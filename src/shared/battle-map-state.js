// noinspection JSUnusedGlobalSymbols
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function buildBattleTable(values, width, height) {
  return Array.from({ length: height }, (_, rowIndex) => {
    const rowStart = rowIndex * width;
    return Array.from({ length: width }, (_, columnIndex) => values[rowStart + columnIndex]);
  });
}

export { isNonNegativeInteger, isPositiveInteger, buildBattleTable };

export function buildBattleMapState(values) {
  if (!Array.isArray(values) || values.length < 2) {
    return null;
  }

  const width = values[0];
  const height = values[1];

  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    return null;
  }

  const cellCount = width * height;
  const expectedLength = 2 + cellCount * 2;
  const armyValues = values.slice(2, 2 + cellCount);
  const stateValues = values.slice(2 + cellCount, expectedLength);

  return {
    width,
    height,
    cellCount,
    expectedLength,
    isComplete: values.length >= expectedLength,
    values: values.slice(),
    armyValues,
    stateValues,
    armyTable: buildBattleTable(armyValues, width, height),
    stateTable: buildBattleTable(stateValues, width, height),
    trailingValues: values.slice(expectedLength)
  };
}


