"""Thread-safe in-memory storage for uploaded battle snapshots."""

from __future__ import annotations

from collections import deque
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from .protocol import DEFAULT_MAX_RECORDS


def _coerce_sticky_state(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _extract_cell_state(cell: Any) -> int | None:
    if isinstance(cell, dict):
        return _coerce_sticky_state(cell.get("state"))
    return _coerce_sticky_state(cell)


def _force_cell_state(cell: Any, state: int) -> Any:
    if isinstance(cell, dict):
        next_cell = deepcopy(cell)
        next_cell["state"] = state
        return next_cell
    return state


def _merge_sticky_matrix(current_matrix: Any, previous_matrix: Any) -> Any:
    if not isinstance(current_matrix, (list, tuple)):
        return deepcopy(current_matrix)

    previous_rows = previous_matrix if isinstance(previous_matrix, (list, tuple)) else []
    merged_rows: list[Any] = []
    for row_index, current_row in enumerate(current_matrix):
        previous_row = previous_rows[row_index] if row_index < len(previous_rows) and isinstance(previous_rows[row_index], (list, tuple)) else []
        if not isinstance(current_row, (list, tuple)):
            merged_rows.append(deepcopy(current_row))
            continue

        merged_row: list[Any] = []
        for column_index, current_cell in enumerate(current_row):
            previous_cell = previous_row[column_index] if column_index < len(previous_row) else None
            current_state = _extract_cell_state(current_cell)
            previous_state = _extract_cell_state(previous_cell)
            if current_state == -2 or previous_state == -2:
                merged_row.append(_force_cell_state(current_cell, -2))
            else:
                merged_row.append(deepcopy(current_cell))
        merged_rows.append(merged_row)

    return merged_rows


def _same_game(previous_snapshot: dict[str, Any] | None, current_snapshot: dict[str, Any]) -> bool:
    if not isinstance(previous_snapshot, dict):
        return False

    previous_game_id = previous_snapshot.get("gameId") or previous_snapshot.get("game_id")
    current_game_id = current_snapshot.get("gameId") or current_snapshot.get("game_id")
    if previous_game_id is not None and current_game_id is not None:
        return previous_game_id == current_game_id

    previous_board = previous_snapshot.get("board") if isinstance(previous_snapshot.get("board"), dict) else None
    current_board = current_snapshot.get("board") if isinstance(current_snapshot.get("board"), dict) else None
    if isinstance(previous_board, dict) and isinstance(current_board, dict):
        previous_size = (previous_board.get("width"), previous_board.get("height"))
        current_size = (current_board.get("width"), current_board.get("height"))
        return previous_size == current_size

    return True


def _merge_sticky_snapshot(snapshot: dict[str, Any], previous_snapshot: dict[str, Any] | None) -> dict[str, Any]:
    merged_snapshot = deepcopy(snapshot)
    if not _same_game(previous_snapshot, merged_snapshot):
        return merged_snapshot

    if not isinstance(previous_snapshot, dict):
        return merged_snapshot

    previous_board = previous_snapshot.get("board") if isinstance(previous_snapshot.get("board"), dict) else None
    current_board = merged_snapshot.get("board") if isinstance(merged_snapshot.get("board"), dict) else None
    if not isinstance(previous_board, dict) or not isinstance(current_board, dict):
        return merged_snapshot

    if "stateTable" in current_board or "stateTable" in previous_board:
        current_board["stateTable"] = _merge_sticky_matrix(current_board.get("stateTable"), previous_board.get("stateTable"))

    if "cells" in current_board or "cells" in previous_board:
        current_board["cells"] = _merge_sticky_matrix(current_board.get("cells"), previous_board.get("cells"))

    return merged_snapshot


@dataclass(frozen=True)
class StoredRecord:
    id: int
    receivedAt: str
    source: str
    gameId: Any
    turn: Any
    snapshot: dict[str, Any]
    analysis: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "receivedAt": self.receivedAt,
            "source": self.source,
            "gameId": self.gameId,
            "turn": self.turn,
            "snapshot": deepcopy(self.snapshot),
            "analysis": deepcopy(self.analysis)
        }

    def to_summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "receivedAt": self.receivedAt,
            "source": self.source,
            "gameId": self.gameId,
            "turn": self.turn,
            "summaryText": self.analysis.get("summaryText"),
            "hasWarnings": self.analysis.get("hasWarnings", False)
        }


class BridgeStore:
    """Simple in-memory ring buffer with latest record helpers."""

    def __init__(self, max_records: int = DEFAULT_MAX_RECORDS) -> None:
        self._records: deque[StoredRecord] = deque(maxlen=max_records)
        self._lock = Lock()
        self._counter = 0

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    def prepare_snapshot(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            previous_snapshot = self._records[-1].snapshot if self._records else None
        return _merge_sticky_snapshot(snapshot, previous_snapshot)

    def add(self, *, source: str, snapshot: dict[str, Any], analysis: dict[str, Any]) -> StoredRecord:
        with self._lock:
            previous_snapshot = self._records[-1].snapshot if self._records else None
            merged_snapshot = _merge_sticky_snapshot(snapshot, previous_snapshot)
            self._counter += 1
            record = StoredRecord(
                id=self._counter,
                receivedAt=self._now_iso(),
                source=source or "extension",
                gameId=merged_snapshot.get("gameId") or merged_snapshot.get("game_id"),
                turn=merged_snapshot.get("turn"),
                snapshot=deepcopy(merged_snapshot),
                analysis=deepcopy(analysis)
            )
            self._records.append(record)
            return record

    def latest(self) -> StoredRecord | None:
        with self._lock:
            return self._records[-1] if self._records else None

    def latest_analysis(self) -> dict[str, Any] | None:
        latest = self.latest()
        return deepcopy(latest.analysis) if latest else None

    def history(self, limit: int | None = None) -> list[dict[str, Any]]:
        with self._lock:
            records = list(self._records)
        if limit == 0:
            return []
        if limit is not None and limit > 0:
            records = records[-limit:]
        return [record.to_summary() for record in records]

    def size(self) -> int:
        with self._lock:
            return len(self._records)


