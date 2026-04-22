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


def _player_lookup_key(player: Any, fallback_index: int) -> int:
    if not isinstance(player, dict):
        return fallback_index

    for key in ("i", "index", "id"):
        key_value = _coerce_int(player.get(key))
        if key_value is not None:
            return key_value

    return fallback_index


def _player_name(player: Any) -> str:
    if not isinstance(player, dict):
        return ""

    for key in ("name", "username", "playerName"):
        value = player.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def _player_numeric_metric(player: Any, preferred_keys: tuple[str, ...]) -> int | float | None:
    if not isinstance(player, dict):
        return None

    containers = (player, player.get("raw") if isinstance(player.get("raw"), dict) else None)
    for container in containers:
        if not isinstance(container, dict):
            continue
        for key in preferred_keys:
            value = container.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, int):
                return value
            if isinstance(value, float):
                return int(value) if value.is_integer() else value

    return None


def _player_color_value(player: Any) -> int | None:
    if not isinstance(player, dict):
        return None

    color_value = _coerce_int(player.get("color"))
    if color_value is not None:
        return color_value

    return _coerce_int(player.get("i"))


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


def _analyze_battle_relations(players: list[dict[str, Any]], current_snapshot: dict[str, Any], previous_snapshot: dict[str, Any] | None, previous_analysis: dict[str, Any] | None = None) -> dict[str, Any]:
    comparison_available = _same_game(previous_snapshot, current_snapshot)
    current_turn = _coerce_int(current_snapshot.get("turn")) if isinstance(current_snapshot, dict) else None
    previous_players = previous_snapshot.get("players") if comparison_available and isinstance(previous_snapshot, dict) and isinstance(previous_snapshot.get("players"), list) else []
    previous_player_map: dict[int, dict[str, Any]] = {}
    for index, player in enumerate(previous_players):
        if isinstance(player, dict):
            previous_player_map[_player_lookup_key(player, index)] = player

    current_player_map: dict[int, dict[str, Any]] = {}
    for index, player in enumerate(players):
        if isinstance(player, dict):
            current_player_map[_player_lookup_key(player, index)] = player

    player_states: list[dict[str, Any]] = []
    war_keys: list[int] = []
    relation_notes: list[str] = []
    debug_players: list[dict[str, Any]] = []

    # Restore previous relationships if available
    previous_relations = {}
    if previous_analysis and comparison_available:
        prev_battle_relations = previous_analysis.get("battleRelations")
        if isinstance(prev_battle_relations, dict):
            for state in prev_battle_relations.get("playerStates", []):
                key = state.get("key")
                if key is not None:
                    previous_relations[key] = state.get("associatedPlayers", [])

    for index, player in enumerate(players):
        if not isinstance(player, dict):
            continue

        player_key = _player_lookup_key(player, index)
        previous_player = previous_player_map.get(player_key)
        current_color = _player_color_value(player)
        current_strength = _player_numeric_metric(player, ("total",))
        previous_strength = _player_numeric_metric(previous_player, ("total",))
        current_tiles = _player_numeric_metric(player, ("tiles",))
        previous_tiles = _player_numeric_metric(previous_player, ("tiles",))
        war_reasons: list[str] = []
        if previous_player is not None:
            if current_tiles is not None and previous_tiles is not None and current_tiles < previous_tiles:
                war_reasons.append("tiles_decreased")
            if current_strength is not None and previous_strength is not None and current_strength < previous_strength:
                war_reasons.append("strength_not_increased")

        in_war = bool(war_reasons)
        if in_war:
            war_keys.append(player_key)

        strength_delta = None
        if current_strength is not None and previous_strength is not None:
            strength_delta = current_strength - previous_strength
        tiles_delta = None
        if current_tiles is not None and previous_tiles is not None:
            tiles_delta = current_tiles - previous_tiles

        debug_players.append({
            "key": player_key,
            "name": _player_name(player),
            "matchedPrevious": previous_player is not None,
            "currentStrength": current_strength,
            "previousStrength": previous_strength,
            "strengthDelta": strength_delta,
            "currentTiles": current_tiles,
            "previousTiles": previous_tiles,
            "tilesDelta": tiles_delta,
            "strengthDrop": bool(current_strength is not None and previous_strength is not None and current_strength < previous_strength),
            "tilesDrop": bool(current_tiles is not None and previous_tiles is not None and current_tiles < previous_tiles),
            "warReasons": list(war_reasons),
            "inWar": in_war
        })

        player_states.append({
            "key": player_key,
            "name": _player_name(player),
            "color": current_color,
            "inWar": in_war,
            "warReasons": war_reasons,
            "currentStrength": current_strength,
            "previousStrength": previous_strength,
            "currentTiles": current_tiles,
            "previousTiles": previous_tiles,
            "associatedPlayers": list(previous_relations.get(player_key, [])),
            "adjacentPlayerKeys": [],
            "adjacentPlayerNames": [],
            "adjacentPlayerColors": []
        })

    adjacent_assumed = len(war_keys) == 2
    if adjacent_assumed:
        key_to_state = {state["key"]: state for state in player_states}
        first_key, second_key = war_keys
        first_state = key_to_state.get(first_key)
        second_state = key_to_state.get(second_key)
        if first_state is not None and second_state is not None:
            # preserve existing order of associatedPlayers and append new association at the end
            def append_if_missing(state, other_key, other_relation):
                assoc_list = state.get("associatedPlayers") if isinstance(state.get("associatedPlayers"), list) else []
                seen = {assoc.get("key") for assoc in assoc_list if isinstance(assoc, dict) and assoc.get("key") is not None}
                if other_key not in seen:
                    assoc = {
                        "key": other_key,
                        "name": _player_name(other_relation) or f"玩家{other_key}",
                        "color": _player_color_value(other_relation)
                    }
                    # attach createdTurn if available
                    if current_turn is not None:
                        assoc["createdTurn"] = current_turn
                    assoc_list.append(assoc)
                    state["associatedPlayers"] = assoc_list

            second_relation = current_player_map.get(second_key)
            first_relation = current_player_map.get(first_key)

            second_name = _player_name(second_relation) or second_state["name"] or f"玩家{second_key}"
            first_name = _player_name(first_relation) or first_state["name"] or f"玩家{first_key}"
            second_color = _player_color_value(second_relation)
            first_color = _player_color_value(first_relation)

            append_if_missing(first_state, second_key, second_relation)
            append_if_missing(second_state, first_key, first_relation)
            first_state["adjacentPlayerKeys"] = [second_key]
            first_state["adjacentPlayerNames"] = [second_name]
            first_state["adjacentPlayerColors"] = [second_color]
            second_state["adjacentPlayerKeys"] = [first_key]
            second_state["adjacentPlayerNames"] = [first_name]
            second_state["adjacentPlayerColors"] = [first_color]
    for state in player_states:
        if state["inWar"]:
            state["relationText"] = "交战"
        elif state["associatedPlayers"]:
            names = [p.get("name") for p in state["associatedPlayers"] if p.get("name")]
            state["relationText"] = f"关联：{', '.join(names)}"
        else:
            state["relationText"] = "关联：暂无"

    return {
        "comparisonAvailable": comparison_available,
        "warPlayerCount": len(war_keys),
        "inWarPlayerKeys": war_keys,
        "adjacencyAssumed": adjacent_assumed,
        "playerStates": player_states,
        "notes": relation_notes,
        "debug": {
            "fieldRules": {
                "strength": "total",
                "tiles": "tiles",
                "warWhen": "strength or tiles decreased"
            },
            "currentTurn": _coerce_int(current_snapshot.get("turn")) if isinstance(current_snapshot, dict) else None,
            "previousTurn": _coerce_int(previous_snapshot.get("turn")) if isinstance(previous_snapshot, dict) else None,
            "currentPlayerKeys": sorted(current_player_map.keys()),
            "previousPlayerKeys": sorted(previous_player_map.keys()),
            "players": debug_players
        }
    }


def _normalize_snapshot(snapshot: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any], Any, int | None]:
    normalized_snapshot = snapshot if isinstance(snapshot, dict) else {}
    players = normalized_snapshot.get("players") if isinstance(normalized_snapshot.get("players"), list) else []
    board = normalized_snapshot.get("board") if isinstance(normalized_snapshot.get("board"), dict) else {}
    game_id = normalized_snapshot.get("gameId")
    turn = _coerce_int(normalized_snapshot.get("turn"))
    return normalized_snapshot, players, board, game_id, turn


def _summarize_players(players: list[dict[str, Any]]) -> dict[str, Any]:
    values: list[float] = []
    alive_count = 0
    preferred_keys = ("total",)

    for player in players:
        if not isinstance(player, dict):
            continue
        value = _first_numeric_value(player, preferred_keys)
        if value is not None:
            values.append(value)
        dead = player.get("dead")
        alive = player.get("alive")
        if dead is True or alive is False:
            continue
        alive_count += 1

    value_stats: dict[str, Any] | None = None
    if values:
        value_stats = {
            "min": min(values),
            "max": max(values),
            "total": sum(values),
            "gap": max(values) - min(values),
            "average": round(mean(values), 2)
        }

    return {
        "playerCount": len(players),
        "aliveCount": alive_count,
        "valueStats": value_stats
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


def analyze_snapshot(snapshot: dict[str, Any], previous_snapshot: dict[str, Any] | None = None, previous_analysis: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create a compact analysis payload for one structured battle snapshot."""

    snapshot, players, board, game_id, turn = _normalize_snapshot(snapshot)

    player_summary = _summarize_players(players)
    board_summary = _summarize_board(board)
    battle_relations = _analyze_battle_relations(players, snapshot, previous_snapshot, previous_analysis)

    notes: list[str] = []
    if game_id is None:
        notes.append("gameId missing")
    if turn is None:
        notes.append("turn missing")
    if board_summary["width"] is None or board_summary["height"] is None:
        notes.append("board size missing")
    if player_summary["playerCount"] == 0:
        notes.append("players missing")
    notes.extend(battle_relations["notes"])

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
        "battleRelations": battle_relations,
        "notes": notes,
        "hasWarnings": bool(notes)
    }

