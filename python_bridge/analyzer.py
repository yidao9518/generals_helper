"""Battle snapshot analysis helpers.

The browser extension is responsible for extracting the battle snapshot.
This module only derives lightweight, display-friendly analytics from that
already-structured payload.
"""

from __future__ import annotations

from statistics import mean
from typing import Any


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _first_numeric_value(source: Any, preferred_keys: tuple[str, ...] = ()) -> float | None:
    if not isinstance(source, dict):
        return None

    for key in preferred_keys:
        value = source.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return float(value)

    for value in source.values():
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return float(value)

    return None


def _matrix_shape(matrix: Any) -> tuple[int | None, int | None]:
    if not isinstance(matrix, (list, tuple)):
        return None, None
    rows = len(matrix)
    columns = len(matrix[0]) if matrix and isinstance(matrix[0], (list, tuple)) else None
    return rows, columns


def _normalize_snapshot(snapshot: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any], Any, int | None]:
    normalized_snapshot = snapshot if isinstance(snapshot, dict) else {}
    players = normalized_snapshot.get("players") if isinstance(normalized_snapshot.get("players"), list) else []
    board = normalized_snapshot.get("board") if isinstance(normalized_snapshot.get("board"), dict) else {}
    game_id = normalized_snapshot.get("gameId")
    turn = _coerce_int(normalized_snapshot.get("turn"))
    return normalized_snapshot, players, board, game_id, turn


def _summarize_players(players: list[dict[str, Any]]) -> dict[str, Any]:
    scores: list[float] = []
    alive_count = 0
    preferred_keys = ("score",)

    for player in players:
        if not isinstance(player, dict):
            continue
        score = _first_numeric_value(player, preferred_keys)
        if score is not None:
            scores.append(score)
        dead = player.get("dead")
        alive = player.get("alive")
        if dead is True or alive is False:
            continue
        alive_count += 1

    score_stats: dict[str, Any] | None = None
    if scores:
        score_stats = {
            "min": min(scores),
            "max": max(scores),
            "total": sum(scores),
            "gap": max(scores) - min(scores),
            "average": round(mean(scores), 2)
        }

    return {
        "playerCount": len(players),
        "aliveCount": alive_count,
        "scoreStats": score_stats
    }


def _summarize_board(board: dict[str, Any]) -> dict[str, Any]:
    width = _coerce_int(board.get("width"))
    height = _coerce_int(board.get("height"))
    state_table = board.get("stateTable")
    army_table = board.get("armyTable")
    rows, columns = _matrix_shape(state_table)

    def count_occupied(matrix: Any) -> int | None:
        rows_local, _ = _matrix_shape(matrix)
        if rows_local is None:
            return None
        total = 0
        for row in matrix:
            if not isinstance(row, (list, tuple)):
                continue
            for value in row:
                if isinstance(value, (int, float)) and not isinstance(value, bool) and value != 0:
                    total += 1
        return total

    summary: dict[str, Any] = {"width": width, "height": height, "cellRows": rows, "cellColumns": columns,
                               "hasCells": bool(state_table), "occupiedCells": count_occupied(state_table)}

    if isinstance(army_table, (list, tuple)):
        summary["armyRows"] = len(army_table)
        summary["armyColumns"] = len(army_table[0]) if army_table and isinstance(army_table[0], (list, tuple)) else None
    if isinstance(state_table, (list, tuple)):
        summary["stateRows"] = len(state_table)
        summary["stateColumns"] = len(state_table[0]) if state_table and isinstance(state_table[0], (list, tuple)) else None

    if width is not None and height is not None:
        summary["expectedCells"] = width * height
    else:
        summary["expectedCells"] = None

    return summary


def analyze_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Create a compact analysis payload for one structured battle snapshot."""

    snapshot, players, board, game_id, turn = _normalize_snapshot(snapshot)

    player_summary = _summarize_players(players)
    board_summary = _summarize_board(board)

    notes: list[str] = []
    if game_id is None:
        notes.append("gameId missing")
    if turn is None:
        notes.append("turn missing")
    if board_summary["width"] is None or board_summary["height"] is None:
        notes.append("board size missing")
    if player_summary["playerCount"] == 0:
        notes.append("players missing")

    summary_text_parts = []
    for label, value in (
        ("game", game_id),
        ("turn", turn),
        ("board", f"{board_summary['width']}x{board_summary['height']}" if board_summary["width"] is not None and board_summary["height"] is not None else None),
        ("players", player_summary["playerCount"]),
        ("alive", player_summary["aliveCount"])
    ):
        if value is None:
            continue
        summary_text_parts.append(f"{label}={value}")

    return {
        "gameId": game_id,
        "turn": turn,
        "summaryText": " | ".join(summary_text_parts),
        "playerSummary": player_summary,
        "boardSummary": board_summary,
        "notes": notes,
        "hasWarnings": bool(notes)
    }


