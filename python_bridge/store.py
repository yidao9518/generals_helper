"""Thread-safe in-memory storage for uploaded battle snapshots."""

from __future__ import annotations

from collections import deque
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from .protocol import DEFAULT_MAX_RECORDS


def _merge_sticky_state_matrix(current_matrix: Any, previous_matrix: Any) -> Any:
    if not isinstance(current_matrix, (list, tuple)):
        return deepcopy(previous_matrix) if isinstance(previous_matrix, (list, tuple)) else deepcopy(current_matrix)

    previous_rows = previous_matrix if isinstance(previous_matrix, (list, tuple)) else []
    merged_rows: list[Any] = []
    row_count = max(len(current_matrix), len(previous_rows))
    for row_index in range(row_count):
        current_row = current_matrix[row_index] if row_index < len(current_matrix) else None
        previous_row = previous_rows[row_index] if row_index < len(previous_rows) and isinstance(previous_rows[row_index], (list, tuple)) else []

        if not isinstance(current_row, (list, tuple)):
            merged_rows.append(deepcopy(previous_row) if previous_row else deepcopy(current_row))
            continue

        merged_row: list[Any] = []
        column_count = max(len(current_row), len(previous_row))
        for column_index in range(column_count):
            current_cell = current_row[column_index] if column_index < len(current_row) else None
            previous_cell = previous_row[column_index] if column_index < len(previous_row) else None
            if current_cell == -2 or previous_cell == -2:
                merged_row.append(-2)
            elif current_cell is not None:
                merged_row.append(deepcopy(current_cell))
            else:
                merged_row.append(deepcopy(previous_cell))
        merged_rows.append(merged_row)

    return merged_rows


def _extract_state_table(board: dict[str, Any]) -> Any:
    if not isinstance(board, dict):
        return None

    state_table = board.get("stateTable")
    if isinstance(state_table, (list, tuple)):
        return state_table
    return None


def _build_cells_from_tables(army_table: Any, state_table: Any) -> Any:
    if not isinstance(state_table, (list, tuple)):
        return None

    army_rows = army_table if isinstance(army_table, (list, tuple)) else []
    merged_rows: list[Any] = []
    row_count = max(len(army_rows), len(state_table))

    for row_index in range(row_count):
        army_row = army_rows[row_index] if row_index < len(army_rows) and isinstance(army_rows[row_index], (list, tuple)) else []
        state_row = state_table[row_index] if row_index < len(state_table) and isinstance(state_table[row_index], (list, tuple)) else []
        column_count = max(len(army_row), len(state_row))

        merged_row: list[Any] = []
        for column_index in range(column_count):
            state = state_row[column_index] if column_index < len(state_row) else None
            merged_row.append({
                "x": column_index,
                "y": row_index,
                "army": army_row[column_index] if column_index < len(army_row) else None,
                "state": state
            })
        merged_rows.append(merged_row)

    return merged_rows


def _sync_cells_to_state_table(board: dict[str, Any]) -> None:
    state_table = board.get("stateTable")
    if not isinstance(state_table, (list, tuple)):
        return

    board["cells"] = _build_cells_from_tables(board.get("armyTable"), state_table)


def _same_game(previous_snapshot: dict[str, Any] | None, current_snapshot: dict[str, Any]) -> bool:
    if not isinstance(previous_snapshot, dict):
        return False

    previous_game_id = previous_snapshot.get("gameId")
    current_game_id = current_snapshot.get("gameId")
    if previous_game_id is None or current_game_id is None:
        return False

    if previous_game_id != current_game_id:
        return False

    previous_board = previous_snapshot.get("board") if isinstance(previous_snapshot.get("board"), dict) else None
    current_board = current_snapshot.get("board") if isinstance(current_snapshot.get("board"), dict) else None
    if isinstance(previous_board, dict) and isinstance(current_board, dict):
        previous_size = (previous_board.get("width"), previous_board.get("height"))
        current_size = (current_board.get("width"), current_board.get("height"))
        return previous_size == current_size

    return False


def _merge_sticky_snapshot(snapshot: dict[str, Any], previous_snapshot: dict[str, Any] | None) -> dict[str, Any]:
    merged_snapshot = deepcopy(snapshot)
    current_board = merged_snapshot.get("board")
    if not isinstance(current_board, dict):
        return merged_snapshot

    current_state_table = _extract_state_table(current_board)
    if current_state_table is None:
        return merged_snapshot

    same_game = _same_game(previous_snapshot, merged_snapshot)
    if same_game and previous_snapshot is not None:
        previous_board = previous_snapshot.get("board") if isinstance(previous_snapshot.get("board"), dict) else None
        previous_state_table = _extract_state_table(previous_board)
        if previous_state_table is not None:
            current_board["stateTable"] = _merge_sticky_state_matrix(current_state_table, previous_state_table)

    _sync_cells_to_state_table(current_board)

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
                gameId=merged_snapshot.get("gameId"),
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


