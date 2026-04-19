from __future__ import annotations

import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from python_bridge.analyzer import analyze_snapshot
from python_bridge.protocol import ANALYSIS_LATEST_PATH, HEALTH_PATH, HISTORY_PATH, INGEST_PATH, LATEST_PATH
from python_bridge.server import create_server
from python_bridge.store import BridgeStore


class BridgeServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.store = BridgeStore(max_records=8)
        cls.server = create_server("127.0.0.1", 0, store=cls.store)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, method: str, path: str, payload: dict | None = None):
        data = None
        headers = {}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=3) as resp:
                body = resp.read().decode("utf-8")
                return resp.status, json.loads(body)
        except HTTPError as exc:
            body = exc.read().decode("utf-8")
            return exc.code, json.loads(body)

    def test_healthz(self) -> None:
        status, body = self.request("GET", HEALTH_PATH)
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["version"], "v1")

    def test_ingest_latest_and_history(self) -> None:
        payload = {
            "type": "battle_snapshot",
            "source": "extension",
            "snapshot": {
                "gameId": "game-123",
                "turn": 42,
                "players": [
                    {"id": 0, "score": 120, "alive": True},
                    {"id": 1, "score": 98, "alive": True},
                    {"id": 2, "score": 64, "dead": True}
                ],
                "board": {
                    "width": 18,
                    "height": 18,
                    "armyTable": [[0, 1, 0], [2, 0, 0]],
                    "stateTable": [[0, 1, 0], [2, 0, 0]]
                }
            }
        }

        status, body = self.request("POST", INGEST_PATH, payload)
        self.assertEqual(status, 201)
        self.assertTrue(body["ok"])
        self.assertEqual(body["record"]["gameId"], "game-123")
        self.assertEqual(body["record"]["turn"], 42)
        self.assertEqual(body["analysis"]["playerSummary"]["playerCount"], 3)
        self.assertEqual(body["analysis"]["playerSummary"]["aliveCount"], 2)
        self.assertEqual(body["analysis"]["boardSummary"]["expectedCells"], 324)

        status, latest = self.request("GET", LATEST_PATH)
        self.assertEqual(status, 200)
        self.assertTrue(latest["ok"])
        self.assertEqual(latest["record"]["gameId"], "game-123")
        self.assertIn("snapshot", latest["record"])
        self.assertIn("analysis", latest["record"])

        status, analysis = self.request("GET", ANALYSIS_LATEST_PATH)
        self.assertEqual(status, 200)
        self.assertTrue(analysis["ok"])
        self.assertEqual(analysis["analysis"]["gameId"], "game-123")

        status, history = self.request("GET", f"{HISTORY_PATH}?limit=5")
        self.assertEqual(status, 200)
        self.assertTrue(history["ok"])
        self.assertEqual(len(history["records"]), 1)
        self.assertEqual(history["records"][0]["gameId"], "game-123")

        status, empty_history = self.request("GET", f"{HISTORY_PATH}?limit=0")
        self.assertEqual(status, 200)
        self.assertTrue(empty_history["ok"])
        self.assertEqual(empty_history["records"], [])

    def test_ingest_rejects_bad_payload(self) -> None:
        status, body = self.request("POST", INGEST_PATH, {"type": "wrong"})
        self.assertEqual(status, 400)
        self.assertFalse(body["ok"])
        self.assertIn("battle_snapshot", body["error"])

    def test_state_minus_two_is_sticky(self) -> None:
        game_id = "sticky-game-001"

        def make_payload(turn: int, state_value: int) -> dict:
            return {
                "type": "battle_snapshot",
                "source": "extension",
                "snapshot": {
                    "gameId": game_id,
                    "matchId": game_id,
                    "inMatch": True,
                    "turn": turn,
                    "playerCount": 1,
                    "aliveCount": 1,
                    "players": [{"index": 0, "alive": True, "dead": False, "score": 12, "raw": {"score": 12}}],
                    "board": {
                        "width": 2,
                        "height": 2,
                        "isComplete": True,
                        "armyTable": [[10, 8], [6, 4]],
                        "stateTable": [[0, state_value], [0, 0]],
                        "trailingValues": []
                    },
                    "battle": {"attackIndex": 1, "mapDiff": [], "citiesDiff": [], "desertsDiff": []},
                    "frame": {"battleSummary": f"turn={turn}"}
                }
            }

        first_status, first_body = self.request("POST", INGEST_PATH, make_payload(1, -2))
        self.assertEqual(first_status, 201)
        self.assertTrue(first_body["ok"])

        second_status, second_body = self.request("POST", INGEST_PATH, make_payload(2, 0))
        self.assertEqual(second_status, 201)
        self.assertTrue(second_body["ok"])

        latest_status, latest = self.request("GET", LATEST_PATH)
        self.assertEqual(latest_status, 200)
        self.assertTrue(latest["ok"])
        latest_board = latest["record"]["snapshot"]["board"]
        self.assertEqual(latest_board["stateTable"][0][1], -2)
        self.assertEqual(latest_board["cells"][0][1]["state"], -2)

    def test_state_minus_two_survives_partial_followup_snapshots(self) -> None:
        game_id = "sticky-game-partial-001"

        first_payload = {
            "type": "battle_snapshot",
            "source": "extension",
            "snapshot": {
                "gameId": game_id,
                "matchId": game_id,
                "inMatch": True,
                "turn": 1,
                "playerCount": 1,
                "aliveCount": 1,
                "players": [{"index": 0, "alive": True, "dead": False, "score": 12, "raw": {"score": 12}}],
                "board": {
                    "width": 2,
                    "height": 2,
                    "isComplete": True,
                    "armyTable": [[10, 8], [6, 4]],
                    "stateTable": [[0, -2], [0, 0]],
                    "trailingValues": []
                },
                "battle": {"attackIndex": 1, "mapDiff": [], "citiesDiff": [], "desertsDiff": []},
                "frame": {"battleSummary": "turn=1"}
            }
        }

        partial_payload = {
            "type": "battle_snapshot",
            "source": "extension",
            "snapshot": {
                "gameId": game_id,
                "matchId": game_id,
                "inMatch": True,
                "turn": 2,
                "playerCount": 1,
                "aliveCount": 1,
                "players": [{"index": 0, "alive": True, "dead": False, "score": 12, "raw": {"score": 12}}],
                "board": {
                    "width": 2,
                    "height": 2,
                    "isComplete": True,
                    "armyTable": [[10]],
                    "stateTable": [[0]],
                    "trailingValues": []
                },
                "battle": {"attackIndex": 1, "mapDiff": [], "citiesDiff": [], "desertsDiff": []},
                "frame": {"battleSummary": "turn=2"}
            }
        }

        first_status, first_body = self.request("POST", INGEST_PATH, first_payload)
        self.assertEqual(first_status, 201)
        self.assertTrue(first_body["ok"])

        second_status, second_body = self.request("POST", INGEST_PATH, partial_payload)
        self.assertEqual(second_status, 201)
        self.assertTrue(second_body["ok"])

        latest_status, latest = self.request("GET", LATEST_PATH)
        self.assertEqual(latest_status, 200)
        self.assertTrue(latest["ok"])
        latest_board = latest["record"]["snapshot"]["board"]
        self.assertEqual(latest_board["stateTable"][0][1], -2)
        self.assertEqual(latest_board["stateTable"][1][1], 0)
        self.assertEqual(latest_board["cells"][0][1]["state"], -2)
        self.assertEqual(latest_board["cells"][1][1]["state"], 0)

    def test_state_table_is_authoritative_for_cells(self) -> None:
        game_id = "state-table-authoritative-001"

        payload = {
            "type": "battle_snapshot",
            "source": "extension",
            "snapshot": {
                "gameId": game_id,
                "matchId": game_id,
                "inMatch": True,
                "turn": 1,
                "playerCount": 1,
                "aliveCount": 1,
                "players": [{"index": 0, "alive": True, "dead": False, "score": 12, "raw": {"score": 12}}],
                "board": {
                    "width": 2,
                    "height": 2,
                    "isComplete": True,
                    "armyTable": [[10, 8], [6, 4]],
                    "stateTable": [[0, -2], [0, 0]],
                    "trailingValues": []
                },
                "battle": {"attackIndex": 1, "mapDiff": [], "citiesDiff": [], "desertsDiff": []},
                "frame": {"battleSummary": "turn=1"}
            }
        }

        status, body = self.request("POST", INGEST_PATH, payload)
        self.assertEqual(status, 201)
        self.assertTrue(body["ok"])

        latest_status, latest = self.request("GET", LATEST_PATH)
        self.assertEqual(latest_status, 200)
        self.assertTrue(latest["ok"])
        latest_board = latest["record"]["snapshot"]["board"]
        self.assertEqual(latest_board["stateTable"][0][1], -2)
        self.assertEqual(latest_board["cells"][0][1]["state"], -2)
        self.assertEqual(latest_board["cells"][0][1]["army"], 8)

    def test_rejects_legacy_snapshot_shapes(self) -> None:
        for payload in (
            {
                "type": "battle_snapshot",
                "source": "extension",
                "board": {
                    "width": 2,
                    "height": 2,
                    "stateTable": [[0, 1], [0, 0]]
                }
            },
            {
                "type": "battle_snapshot",
                "source": "extension",
                "battle": {
                    "board": {
                        "width": 2,
                        "height": 2,
                        "stateTable": [[0, 1], [0, 0]]
                    }
                }
            }
        ):
            status, body = self.request("POST", INGEST_PATH, payload)
            self.assertEqual(status, 400)
            self.assertFalse(body["ok"])
            self.assertIn("snapshot", body["error"])

    def test_analyzer_handles_missing_fields(self) -> None:
        analysis = analyze_snapshot({})
        self.assertTrue(analysis["hasWarnings"])
        self.assertIn("gameId missing", analysis["notes"])
        self.assertIn("turn missing", analysis["notes"])
        self.assertEqual(analysis["playerSummary"]["playerCount"], 0)


if __name__ == "__main__":
    unittest.main()


