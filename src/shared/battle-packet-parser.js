const SOCKET_IO_BATTLE_PACKET_PREFIX = "42";

function parseBattleArray(battleArray) {
  if (!Array.isArray(battleArray) || battleArray.length < 2) {
    return null;
  }

  const width = battleArray[0];
  const height = battleArray[1];

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    return null;
  }

  const cellCount = width * height;
  const troopStrengthStart = 2;
  const troopStrengthEnd = troopStrengthStart + cellCount;
  const stateStart = troopStrengthEnd;
  const stateEnd = stateStart + cellCount;

  const troopStrengths = battleArray.slice(troopStrengthStart, troopStrengthEnd);
  const cellStates = battleArray.slice(stateStart, stateEnd);
  const cellCountParsed = Math.min(troopStrengths.length, cellStates.length);

  return {
    width,
    height,
    cellCount,
    isComplete: troopStrengths.length === cellCount && cellStates.length === cellCount,
    troopStrengths,
    cellStates,
    cells: Array.from({ length: cellCountParsed }, (_, index) => ({
      index,
      x: index % width,
      y: Math.floor(index / width),
      troopStrength: troopStrengths[index],
      state: cellStates[index]
    })),
    trailingValues: battleArray.slice(stateEnd)
  };
}

export function parseBattlePacketFrame(text) {
  if (typeof text !== "string" || !text.startsWith(SOCKET_IO_BATTLE_PACKET_PREFIX)) {
    return null;
  }

  const payloadText = text.slice(SOCKET_IO_BATTLE_PACKET_PREFIX.length);
  let eventName = "";
  let payload = null;
  let battleArray = null;
  let battleGrid = null;

  try {
    payload = JSON.parse(payloadText);
    if (Array.isArray(payload) && typeof payload[0] === "string") {
      eventName = payload[0];
      if (Array.isArray(payload[1])) {
        battleArray = payload[1];
        battleGrid = parseBattleArray(battleArray);
      }
    }
  } catch {
    // ignore malformed socket.io payloads
  }

  return {
    eventName,
    payload,
    battleArray,
    battleGrid
  };
}



