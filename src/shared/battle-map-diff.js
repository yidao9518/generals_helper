import { isNonNegativeInteger, isPositiveInteger } from "./battle-map-state.js";

function formatBattleMapDiffEntry(index, value, width, cellCount) {
  const cellValueIndex = index - 2;
  if (cellValueIndex < 0 || !Number.isInteger(cellCount) || cellCount <= 0) {
    return null;
  }

  const layer = Math.floor(cellValueIndex / cellCount);
  if (layer < 0 || layer > 1) {
    return null;
  }

  const cellIndex = cellValueIndex % cellCount;
  const row = Math.floor(cellIndex / width) + 1;
  const column = (cellIndex % width) + 1;
  const kind = layer === 0 ? "P" : "S";

  return `${cellIndex + 1}(${row},${column})${kind}${value}`;
}

export function parseSkipCountMapDiff(mapDiff) {
  if (!Array.isArray(mapDiff) || mapDiff.length === 0) {
    return null;
  }

  const tailRemaining = mapDiff[mapDiff.length - 1];
  if (!isNonNegativeInteger(tailRemaining)) {
    return null;
  }

  const changes = [];
  let index = 0;
  let cursor = 0;
  const tailCursor = mapDiff.length - 1;

  while (cursor < tailCursor) {
    if (cursor + 1 >= tailCursor) {
      return null;
    }

    const skip = mapDiff[cursor];
    const count = mapDiff[cursor + 1];

    if (!isNonNegativeInteger(skip) || !isNonNegativeInteger(count)) {
      return null;
    }

    index += skip;
    cursor += 2;

    if (cursor + count > tailCursor) {
      return null;
    }

    changes.push({
      index,
      values: mapDiff.slice(cursor, cursor + count)
    });

    index += count;
    cursor += count;
  }

  return {
    kind: "skipCountDiff",
    changes,
    endIndex: index,
    tailRemaining
  };
}

export function applySkipCountMapDiff(baseValues, mapDiff) {
  if (!Array.isArray(baseValues)) {
    return null;
  }

  const decodedDiff = parseSkipCountMapDiff(mapDiff);
  if (!decodedDiff) {
    return null;
  }

  const nextValues = baseValues.slice();

  for (const change of decodedDiff.changes) {
    for (let offset = 0; offset < change.values.length; offset += 1) {
      nextValues[change.index + offset] = change.values[offset];
    }
  }

  if (!Number.isInteger(decodedDiff.endIndex) || decodedDiff.endIndex + decodedDiff.tailRemaining !== nextValues.length) {
    return null;
  }

  return nextValues;
}

export function formatBattleUpdateMapDiff(update, battleMapState = null) {
  const dimensions = battleMapState || update?.mapDiffInitial;
  const width = dimensions?.width;
  const cellCount = dimensions?.cellCount;

  if (!isPositiveInteger(width) || !Number.isInteger(cellCount) || cellCount <= 0) {
    return null;
  }

  const patch = update?.mapDiffPatch;
  if (!patch || !Array.isArray(patch.changes) || patch.changes.length === 0) {
    return "";
  }

  const parts = [];
  for (const change of patch.changes) {
    if (!change || !Array.isArray(change.values)) {
      continue;
    }

    for (let offset = 0; offset < change.values.length; offset += 1) {
      const formatted = formatBattleMapDiffEntry(change.index + offset, change.values[offset], width, cellCount);
      if (formatted) {
        parts.push(formatted);
      }
    }
  }

  return parts.length > 0 ? parts.join("；") : "无变化";
}


