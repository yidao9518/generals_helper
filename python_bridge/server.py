"""Minimal local HTTP/HTTPS service for Generals Helper.

Run:
    python -m python_bridge.server

The service exposes:
    GET  /healthz
    POST /v1/ingest
    GET  /v1/latest
    GET  /v1/analysis/latest
    GET  /v1/history?limit=25
"""

from __future__ import annotations

import argparse
import json
import ssl
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from .analyzer import analyze_snapshot
from .protocol import (
    ANALYSIS_LATEST_PATH,
    DEFAULT_HOST,
    DEFAULT_HISTORY_LIMIT,
    DEFAULT_PORT,
    HEALTH_PATH,
    HISTORY_PATH,
    INGEST_PATH,
    LATEST_PATH,
)
from .store import BridgeStore


def _json_response(handler: BaseHTTPRequestHandler, status: HTTPStatus, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def _error(handler: BaseHTTPRequestHandler, status: HTTPStatus, message: str) -> None:
    _json_response(handler, status, {"ok": False, "error": message})


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    raw_length = handler.headers.get("Content-Length") or "0"
    try:
        length = max(0, int(raw_length))
    except ValueError as exc:
        raise ValueError("Invalid Content-Length header") from exc

    raw = handler.rfile.read(length) if length > 0 else b""
    if not raw:
        return {}

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Request body must be valid JSON") from exc

    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


def _extract_snapshot(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    if payload.get("type") != "battle_snapshot":
        raise ValueError("Unsupported payload type. Expected battle_snapshot.")

    snapshot = payload.get("snapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("Missing snapshot object under 'snapshot'.")

    source = payload.get("source") or snapshot.get("source") or "extension"
    return snapshot, str(source)


def make_handler(store: BridgeStore) -> type[BaseHTTPRequestHandler]:
    class BridgeRequestHandler(BaseHTTPRequestHandler):
        server_version = "GeneralsHelperBridge/0.1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            return

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == HEALTH_PATH:
                _json_response(self, HTTPStatus.OK, {"ok": True, "service": "generals-helper-python-bridge", "version": "v1"})
                return

            if parsed.path == LATEST_PATH:
                latest = store.latest()
                _json_response(self, HTTPStatus.OK, {"ok": True, "record": latest.to_dict() if latest else None})
                return

            if parsed.path == ANALYSIS_LATEST_PATH:
                latest = store.latest()
                _json_response(self, HTTPStatus.OK, {"ok": True, "analysis": latest.analysis if latest else None})
                return

            if parsed.path == HISTORY_PATH:
                params = parse_qs(parsed.query)
                limit_value = params.get("limit", [str(DEFAULT_HISTORY_LIMIT)])[0]
                try:
                    limit = int(limit_value)
                except ValueError:
                    _error(self, HTTPStatus.BAD_REQUEST, "limit must be an integer")
                    return
                if limit < 0:
                    _error(self, HTTPStatus.BAD_REQUEST, "limit must be >= 0")
                    return
                _json_response(self, HTTPStatus.OK, {"ok": True, "records": store.history(limit)})
                return

            _error(self, HTTPStatus.NOT_FOUND, "Unknown endpoint")

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path != INGEST_PATH:
                _error(self, HTTPStatus.NOT_FOUND, "Unknown endpoint")
                return

            try:
                payload = _read_json_body(self)
                snapshot, source = _extract_snapshot(payload)
                previous_record = store.latest()
                previous_snapshot = previous_record.snapshot if previous_record else None
                previous_analysis = previous_record.analysis if previous_record else None
                prepared_snapshot = store.prepare_snapshot(snapshot)
                analysis = analyze_snapshot(prepared_snapshot, previous_snapshot=previous_snapshot, previous_analysis=previous_analysis)
                record = store.add(source=source, snapshot=snapshot, analysis=analysis)
            except ValueError as exc:
                _error(self, HTTPStatus.BAD_REQUEST, str(exc))
                return

            _json_response(
                self,
                HTTPStatus.CREATED,
                {
                    "ok": True,
                    "record": record.to_summary(),
                    "analysis": analysis,
                    "historySize": store.size()
                }
            )

    return BridgeRequestHandler


def create_server(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    *,
    store: BridgeStore | None = None,
    certfile: str | None = None,
    keyfile: str | None = None,
) -> ThreadingHTTPServer:
    store = store or BridgeStore()
    handler_cls = make_handler(store)
    server = ThreadingHTTPServer((host, port), handler_cls)
    server.store = store  # type: ignore[attr-defined]

    if bool(certfile) ^ bool(keyfile):
        raise ValueError("HTTPS requires both certfile and keyfile")
    if certfile and keyfile:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=certfile, keyfile=keyfile)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Generals Helper local HTTP/HTTPS bridge.")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Host to bind (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port to bind (default: {DEFAULT_PORT})")
    parser.add_argument("--certfile", default=None, help="Enable HTTPS with this certificate file")
    parser.add_argument("--keyfile", default=None, help="Private key for HTTPS (required with --certfile)")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        server = create_server(args.host, args.port, certfile=args.certfile, keyfile=args.keyfile)
    except ValueError as exc:
        parser.error(str(exc))
    scheme = "https" if args.certfile or args.keyfile else "http"
    print(f"[Generals Helper] listening on {scheme}://{args.host}:{server.server_port}")
    print(f"[Generals Helper] health:   GET  {HEALTH_PATH}")
    print(f"[Generals Helper] ingest:   POST {INGEST_PATH}")
    print(f"[Generals Helper] latest:   GET  {LATEST_PATH}")
    print(f"[Generals Helper] history:  GET  {HISTORY_PATH}?limit=25")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[Generals Helper] shutting down")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

