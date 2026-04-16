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


def _is_truthy_score(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    if isinstance(value, str):
        return value.strip().lower() not in {"", "0", "false", "dead", "defeated"}
    return True


def _extract_score_value(player: dict[str, Any]) -> float | None:
    if not isinstance(player, dict):
      return None

    preferred_keys = ("score", "total", "tiles", "army", "land", "cells", "value", "count")
    for key in preferred_keys:
        value = player.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return float(value)

    raw = player.get("raw")
    if isinstance(raw, dict):
        for key in preferred_keys:
            value = raw.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                return float(value)

    for value in player.values():
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return float(value)

    if isinstance(raw, dict):
        for value in raw.values():
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                return float(value)

    return None


def _count_non_empty(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value != 0)
    if isinstance(value, str):
        return int(bool(value.strip()))
    if isinstance(value, dict):
        if not value:
            return 0
        if any(key in value for key in ("owner", "playerId", "team", "army", "strength", "state", "terrain")):
            return int(any(_is_truthy_score(item) for item in value.values()))
        return sum(_count_non_empty(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return sum(_count_non_empty(item) for item in value)
    return int(bool(value))


def _summarize_players(players: list[dict[str, Any]]) -> dict[str, Any]:
    scores: list[float] = []
    alive_count = 0
    for player in players:
        if not isinstance(player, dict):
            continue
        score = _extract_score_value(player)
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
    cells = board.get("cells")
    army_table = board.get("armyTable")
    state_table = board.get("stateTable")
    rows = len(cells) if isinstance(cells, list) else None
    columns = len(cells[0]) if isinstance(cells, list) and cells and isinstance(cells[0], (list, tuple)) else None

    summary: dict[str, Any] = {
        "width": width,
        "height": height,
        "cellRows": rows,
        "cellColumns": columns,
        "hasCells": bool(cells)
    }

    occupied_source = cells if isinstance(cells, (list, tuple)) else army_table if isinstance(army_table, (list, tuple)) else state_table if isinstance(state_table, (list, tuple)) else None
    summary["occupiedCells"] = _count_non_empty(occupied_source) if occupied_source is not None else None

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

    snapshot = snapshot if isinstance(snapshot, dict) else {}
    players = snapshot.get("players") if isinstance(snapshot.get("players"), list) else []
    board = snapshot.get("board") if isinstance(snapshot.get("board"), dict) else {}
    game_id = snapshot.get("gameId") or snapshot.get("game_id")
    turn = _coerce_int(snapshot.get("turn"))

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
    if game_id is not None:
        summary_text_parts.append(f"game={game_id}")
    if turn is not None:
        summary_text_parts.append(f"turn={turn}")
    if board_summary["width"] is not None and board_summary["height"] is not None:
        summary_text_parts.append(f"board={board_summary['width']}x{board_summary['height']}")
    summary_text_parts.append(f"players={player_summary['playerCount']}")
    summary_text_parts.append(f"alive={player_summary['aliveCount']}")

    return {
        "gameId": game_id,
        "turn": turn,
        "summaryText": " | ".join(summary_text_parts),
        "playerSummary": player_summary,
        "boardSummary": board_summary,
        "notes": notes,
        "hasWarnings": bool(notes)
    }


