from __future__ import annotations

import argparse
import ipaddress
import re
import subprocess
import sys
import platform
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
except ModuleNotFoundError as exc:  # pragma: no cover - helpful runtime guard
    raise SystemExit(
        "Missing dependency: cryptography. Install the bridge package dependencies first, e.g. `python -m pip install -e .\\python_bridge`."
    ) from exc

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CERT_DIR = REPO_ROOT / "certs"
DEFAULT_CERT_NAME = "localhost"
DEFAULT_HOSTS = ["localhost", "127.0.0.1", "::1"]
DEFAULT_PORT = 8765


def parse_hosts(raw_hosts: str) -> list[str]:
    hosts = [host.strip() for host in raw_hosts.split(",")]
    hosts = [host for host in hosts if host]
    return hosts or list(DEFAULT_HOSTS)


def build_certificate(hosts: list[str], days: int) -> tuple[bytes, bytes]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject_name = hosts[0]
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, subject_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Generals Helper"),
    ])

    now = datetime.now(timezone.utc)
    san_entries = []
    for host in hosts:
        try:
            san_entries.append(x509.IPAddress(ipaddress.ip_address(host)))
        except ValueError:
            san_entries.append(x509.DNSName(host))

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=days))
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.ExtendedKeyUsage([
                ExtendedKeyUsageOID.SERVER_AUTH,
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    key_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return cert_pem, key_pem


def write_cert_files(cert_dir: Path, name: str, hosts: list[str], days: int) -> tuple[Path, Path]:
    cert_dir.mkdir(parents=True, exist_ok=True)
    cert_path = cert_dir / f"{name}.crt"
    key_path = cert_dir / f"{name}.key"
    cert_pem, key_pem = build_certificate(hosts, days)
    cert_path.write_bytes(cert_pem)
    key_path.write_bytes(key_pem)
    return cert_path, key_path


def ensure_cert_files(cert_dir: Path, name: str, hosts: list[str], days: int) -> tuple[Path, Path, bool]:
    cert_dir.mkdir(parents=True, exist_ok=True)
    cert_path = cert_dir / f"{name}.crt"
    key_path = cert_dir / f"{name}.key"

    if cert_path.exists() and key_path.exists() and cert_key_matches(cert_path, key_path):
        return cert_path, key_path, False

    cert_pem, key_pem = build_certificate(hosts, days)
    cert_path.write_bytes(cert_pem)
    key_path.write_bytes(key_pem)
    return cert_path, key_path, True


def cert_key_matches(cert_path: Path, key_path: Path) -> bool:
    try:
        cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
        private_key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    except (OSError, ValueError):
        return False

    try:
        cert_public_bytes = cert.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        key_public_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        return cert_public_bytes == key_public_bytes
    except (AttributeError, TypeError, ValueError):
        return False


def certificate_sha1_thumbprint(cert_path: Path) -> str:
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    return cert.fingerprint(hashes.SHA1()).hex().upper()


def normalize_thumbprint(raw_thumbprint: str) -> str:
    return re.sub(r"[^0-9A-Fa-f]", "", raw_thumbprint).upper()


def get_windows_root_store_thumbprints() -> set[str]:
    result = subprocess.run(
        ["certutil", "-user", "-store", "Root"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit((result.stderr or result.stdout or "Failed to inspect certificate store").strip())

    output = f"{result.stdout}\n{result.stderr}"
    thumbprints = set()
    for match in re.finditer(r"Cert Hash\(sha1\):\s*([0-9A-Fa-f\s]+)", output):
        thumbprints.add(normalize_thumbprint(match.group(1)))
    return thumbprints


def is_certificate_trusted_in_windows_root_store(cert_path: Path) -> bool:
    return certificate_sha1_thumbprint(cert_path) in get_windows_root_store_thumbprints()


def trust_certificate_windows(cert_path: Path) -> bool:
    if platform.system() != "Windows":
        raise SystemExit("--trust is only supported on Windows")

    if is_certificate_trusted_in_windows_root_store(cert_path):
        return False

    result = subprocess.run(
        ["certutil", "-user", "-addstore", "Root", str(cert_path)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit((result.stderr or result.stdout or "Failed to trust certificate").strip())

    return True


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a local self-signed HTTPS certificate for Generals Helper.")
    parser.add_argument("--out-dir", default=str(DEFAULT_CERT_DIR), help=f"Directory for cert files (default: {DEFAULT_CERT_DIR})")
    parser.add_argument("--name", default=DEFAULT_CERT_NAME, help=f"Base filename without extension (default: {DEFAULT_CERT_NAME})")
    parser.add_argument("--hosts", default=",".join(DEFAULT_HOSTS), help="Comma-separated SAN hosts/IPs (default: localhost,127.0.0.1,::1)")
    parser.add_argument("--days", type=int, default=825, help="Certificate validity period in days (default: 825)")
    parser.add_argument("--host", default="127.0.0.1", help="Bridge bind host when using --serve (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Bridge port when using --serve (default: {DEFAULT_PORT})")
    parser.add_argument("--serve", action="store_true", help="Start the bridge after generating the certificate")
    parser.add_argument("--trust", action="store_true", help="Trust the generated certificate in the Windows Current User root store")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    hosts = parse_hosts(args.hosts)
    cert_path, key_path, generated = ensure_cert_files(Path(args.out_dir), args.name, hosts, args.days)

    print(f"[Generals Helper] certificate: {cert_path}")
    print(f"[Generals Helper] private key: {key_path}")
    print(f"[Generals Helper] files:       {'generated' if generated else 'reused existing'}")
    print(f"[Generals Helper] SAN hosts:   {', '.join(hosts)}")

    if args.trust:
        trusted = trust_certificate_windows(cert_path)
        if trusted:
            print("[Generals Helper] certificate trusted in Current User\\Root")
        else:
            print("[Generals Helper] certificate already trusted in Current User\\Root")

    if args.serve:
        command = [
            sys.executable,
            "-m",
            "python_bridge.server",
            "--host",
            args.host,
            "--port",
            str(args.port),
            "--certfile",
            str(cert_path),
            "--keyfile",
            str(key_path),
        ]
        print(f"[Generals Helper] starting HTTPS bridge: {' '.join(command)}")
        raise SystemExit(subprocess.call(command, cwd=str(REPO_ROOT)))

    print("[Generals Helper] HTTPS materials generated. Start the bridge with --certfile and --keyfile.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


