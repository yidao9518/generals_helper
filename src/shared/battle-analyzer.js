import { buildBattleMapState, isPositiveInteger } from "./battle-map-state.js";
import { applySkipCountMapDiff, formatBattleUpdateMapDiff, parseSkipCountMapDiff } from "./battle-map-diff.js";
import { BATTLE_DISPLAY_CONFIG } from "./helper-config.js";

export { buildBattleMapState, parseSkipCountMapDiff, applySkipCountMapDiff };

export function parseTurn1InitialMapDiff(mapDiff, turn = null) {
  if (turn !== 1 || !Array.isArray(mapDiff) || mapDiff.length < 2 || mapDiff[0] !== 0) {
    return null;
  }

  const initialLength = mapDiff[1];
  if (!Number.isInteger(initialLength) || initialLength < 0) {
    return null;
  }

  const values = mapDiff.slice(2, 2 + initialLength);
  if (values.length !== initialLength) {
    return null;
  }

  const width = values[0];
  const height = values[1];

  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    return {
      kind: "turn1Initial",
      length: initialLength,
      values,
      width,
      height,
      cellCount: null,
      expectedLength: null,
      isComplete: false,
      troopStrengths: [],
      cellStates: [],
      armyTable: [],
      stateTable: [],
      trailingValues: []
    };
  }

  const cellCount = width * height;
  const expectedLength = 2 + cellCount * 2;
  const troopStrengths = values.slice(2, 2 + cellCount);
  const cellStates = values.slice(2 + cellCount, 2 + cellCount * 2);
  const battleMapState = buildBattleMapState(values);

  return {
    kind: "turn1Initial",
    length: initialLength,
    values,
    width,
    height,
    cellCount,
    expectedLength,
    isComplete: initialLength === expectedLength,
    troopStrengths,
    cellStates,
    armyTable: battleMapState?.armyTable || [],
    stateTable: battleMapState?.stateTable || [],
    trailingValues: values.slice(expectedLength)
  };
}

export function applyBattleUpdateToBattleMapState(previousState, update) {
  if (!update) {
    return null;
  }

  if (update.mapDiffInitial) {
    return buildBattleMapState(update.mapDiffInitial.values);
  }

  const baseValues = Array.isArray(previousState)
    ? previousState
    : Array.isArray(previousState?.values)
      ? previousState.values
      : null;

  if (!baseValues) {
    return null;
  }

  const nextValues = applySkipCountMapDiff(baseValues, update.mapDiff);
  if (!nextValues) {
    return null;
  }

  return buildBattleMapState(nextValues);
}

export function parseBattleUpdate(payload) {
  if (!Array.isArray(payload) || payload.length < 2) {
    return null;
  }

  const eventName = payload[0];
  if (eventName !== "game_update") {
    return null;
  }

  const data = payload[1];
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const scores = Array.isArray(data.scores) ? data.scores : [];
  const mapDiff = Array.isArray(data.map_diff) ? data.map_diff : [];

  return {
    turn: data.turn,
    playerCount: scores.length,
    aliveCount: scores.filter((s) => !s.dead).length,
    attackIndex: data.attackIndex,
    mapDiff,
    mapDiffPatch: parseSkipCountMapDiff(mapDiff),
    mapDiffInitial: parseTurn1InitialMapDiff(mapDiff, data.turn),
    citiesDiff: data.cities_diff,
    desertsDiff: data.deserts_diff
  };
}

export function formatBattleUpdate(update, displayConfig = {}, battleMapState = null) {
  if (!update) {
    return "";
  }

  const resolvedConfig = displayConfig || {};
  const {
    showTurn = BATTLE_DISPLAY_CONFIG.showTurn,
    showPlayers = BATTLE_DISPLAY_CONFIG.showPlayers,
    showMapDiff = BATTLE_DISPLAY_CONFIG.showMapDiff,
    showCitiesDiff = BATTLE_DISPLAY_CONFIG.showCitiesDiff,
    showDesertsDiff = BATTLE_DISPLAY_CONFIG.showDesertsDiff
  } = resolvedConfig;

  const parts = [];

  if (showTurn) {
    parts.push(`Turn${update.turn}`);
  }
  if (showPlayers) {
    parts.push(`Players${update.aliveCount}/${update.playerCount}`);
  }
  if (showMapDiff && Array.isArray(update.mapDiff) && update.mapDiff.length > 0) {
    const formattedMapDiff = formatBattleUpdateMapDiff(update, battleMapState);
    parts.push(`MapDiff[${formattedMapDiff === null ? "未计算" : formattedMapDiff}]`);
  }
  if (showCitiesDiff && Array.isArray(update.citiesDiff) && update.citiesDiff.length > 0) {
    parts.push(`CityDiff[${update.citiesDiff.join(",")}]`);
  }
  if (showDesertsDiff && Array.isArray(update.desertsDiff) && update.desertsDiff.length > 0) {
    parts.push(`DstDiff[${update.desertsDiff.join(",")}]`);
  }

  return parts.join(" | ");
}
