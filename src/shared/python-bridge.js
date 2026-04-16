import { parseBattleUpdate } from "./battle-analyzer.js";

export const PYTHON_BRIDGE_STORAGE_KEY = "pythonBridge";
export const DEFAULT_PYTHON_BRIDGE_CONFIG = {
  enabled: true,
  autoPush: true,
  url: "https://127.0.0.1:8765",
  timeoutMs: 2500
};

function getStorageArea() {
  return globalThis.chrome?.storage?.local || null;
}

function normalizeUrl(url) {
  if (typeof url !== "string") {
    return DEFAULT_PYTHON_BRIDGE_CONFIG.url;
  }
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_PYTHON_BRIDGE_CONFIG.url;
}

function toPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function pickNumericScore(player) {
  if (!player || typeof player !== "object") {
    return null;
  }

  const preferredKeys = ["score", "total", "tiles", "army", "land", "cells", "value", "count"];
  for (const key of preferredKeys) {
    if (typeof player[key] === "number" && Number.isFinite(player[key])) {
      return player[key];
    }
  }

  for (const value of Object.values(player)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function normalizePlayers(scores) {
  if (!Array.isArray(scores)) {
    return [];
  }

  return scores.map((player, index) => {
    const rawPlayer = player && typeof player === "object" ? { ...player } : { value: player };
    return {
      index,
      alive: rawPlayer.dead !== true && rawPlayer.alive !== false,
      dead: Boolean(rawPlayer.dead),
      score: pickNumericScore(rawPlayer),
      raw: rawPlayer
    };
  });
}

function normalizeBattleBoard(battleMapState) {
  if (!battleMapState || typeof battleMapState !== "object") {
    return null;
  }

  const width = Number.isInteger(battleMapState.width) ? battleMapState.width : null;
  const height = Number.isInteger(battleMapState.height) ? battleMapState.height : null;
  const armyTable = Array.isArray(battleMapState.armyTable) ? battleMapState.armyTable : [];
  const stateTable = Array.isArray(battleMapState.stateTable) ? battleMapState.stateTable : [];
  const cells = armyTable.map((armyRow, y) => {
    const row = Array.isArray(armyRow) ? armyRow : [];
    return row.map((army, x) => ({
      x,
      y,
      army,
      state: Array.isArray(stateTable[y]) ? stateTable[y][x] ?? null : null
    }));
  });

  return {
    width,
    height,
    isComplete: Boolean(battleMapState.isComplete),
    armyTable,
    stateTable,
    cells,
    trailingValues: Array.isArray(battleMapState.trailingValues) ? battleMapState.trailingValues : []
  };
}

function parseGameUpdateFrame(frame) {
  if (!frame || frame.eventName !== "game_update" || typeof frame.preview !== "string" || !frame.preview.startsWith("42")) {
    return null;
  }

  try {
    const payload = JSON.parse(frame.preview.slice(2));
    if (!Array.isArray(payload) || payload[0] !== "game_update" || typeof payload[1] !== "object" || payload[1] === null) {
      return null;
    }
    return {
      payload,
      data: payload[1],
      battleUpdate: parseBattleUpdate(payload)
    };
  } catch {
    return null;
  }
}

export function buildBattleSnapshot(frame) {
  const parsed = parseGameUpdateFrame(frame);
  if (!parsed || !parsed.battleUpdate) {
    return null;
  }

  const battleMapState = frame?.battleMapStateAfter || frame?.battleMapStateBefore || null;
  const turn = Number.isInteger(parsed.data.turn) ? parsed.data.turn : null;
  return {
    type: "battle_snapshot",
    source: "extension",
    capturedAt: Number.isInteger(frame?.capturedAt) ? frame.capturedAt : Date.now(),
    gameId: typeof frame?.matchId === "string" ? frame.matchId : "",
    inMatch: Boolean(frame?.inMatch),
    matchId: typeof frame?.matchId === "string" ? frame.matchId : "",
    eventName: frame?.eventName || "",
    turn,
    playerCount: parsed.battleUpdate.playerCount,
    aliveCount: parsed.battleUpdate.aliveCount,
    players: normalizePlayers(parsed.data.scores),
    board: normalizeBattleBoard(battleMapState),
    battle: {
      attackIndex: Number.isInteger(parsed.battleUpdate.attackIndex) ? parsed.battleUpdate.attackIndex : null,
      mapDiff: Array.isArray(parsed.battleUpdate.mapDiff) ? parsed.battleUpdate.mapDiff : [],
      citiesDiff: Array.isArray(parsed.battleUpdate.citiesDiff) ? parsed.battleUpdate.citiesDiff : [],
      desertsDiff: Array.isArray(parsed.battleUpdate.desertsDiff) ? parsed.battleUpdate.desertsDiff : [],
      mapDiffPatch: parsed.battleUpdate.mapDiffPatch || null,
      mapDiffInitial: parsed.battleUpdate.mapDiffInitial
        ? {
            width: parsed.battleUpdate.mapDiffInitial.width,
            height: parsed.battleUpdate.mapDiffInitial.height,
            cellCount: parsed.battleUpdate.mapDiffInitial.cellCount,
            isComplete: parsed.battleUpdate.mapDiffInitial.isComplete,
            troopStrengths: parsed.battleUpdate.mapDiffInitial.troopStrengths,
            cellStates: parsed.battleUpdate.mapDiffInitial.cellStates
          }
        : null
    },
    frame: {
      id: frame?.id || "",
      tabId: Number.isInteger(frame?.tabId) ? frame.tabId : -1,
      frameId: Number.isInteger(frame?.frameId) ? frame.frameId : -1,
      direction: frame?.direction || "",
      size: Number.isFinite(frame?.size) ? frame.size : 0,
      url: typeof frame?.url === "string" ? frame.url : "",
      category: frame?.category || "",
      battleSummary: typeof frame?.battleSummary === "string" ? frame.battleSummary : "",
      inMatch: Boolean(frame?.inMatch),
      matchId: typeof frame?.matchId === "string" ? frame.matchId : ""
    }
  };
}

export async function loadPythonBridgeConfig() {
  const storage = getStorageArea();
  if (!storage) {
    return { ...DEFAULT_PYTHON_BRIDGE_CONFIG };
  }

  const result = await storage.get([PYTHON_BRIDGE_STORAGE_KEY]);
  return normalizePythonBridgeConfig(result[PYTHON_BRIDGE_STORAGE_KEY]);
}

export async function savePythonBridgeConfig(nextConfig) {
  const storage = getStorageArea();
  const normalized = normalizePythonBridgeConfig(nextConfig);
  if (storage) {
    await storage.set({ [PYTHON_BRIDGE_STORAGE_KEY]: normalized });
  }
  return normalized;
}

export function normalizePythonBridgeConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  return {
    enabled: source.enabled !== false,
    autoPush: source.autoPush !== false,
    url: normalizeUrl(source.url),
    timeoutMs: toPositiveInteger(source.timeoutMs, DEFAULT_PYTHON_BRIDGE_CONFIG.timeoutMs)
  };
}

async function requestJson(url, init = {}) {
  const controller = new AbortController();
  const timeoutMs = toPositiveInteger(init.timeoutMs, DEFAULT_PYTHON_BRIDGE_CONFIG.timeoutMs);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function pingPythonBridge(configOrUrl) {
  const config = typeof configOrUrl === "string"
    ? normalizePythonBridgeConfig({ url: configOrUrl })
    : normalizePythonBridgeConfig(configOrUrl);
  return requestJson(`${config.url}/healthz`, { method: "GET", timeoutMs: config.timeoutMs });
}

export async function postBattleSnapshotToPython(configOrUrl, snapshot) {
  const config = typeof configOrUrl === "string"
    ? normalizePythonBridgeConfig({ url: configOrUrl })
    : normalizePythonBridgeConfig(configOrUrl);

  return requestJson(`${config.url}/v1/ingest`, {
    method: "POST",
    timeoutMs: config.timeoutMs,
    body: JSON.stringify(snapshot)
  });
}

export function findLatestBattleSnapshotFrame(frameBuffer) {
  if (!Array.isArray(frameBuffer)) {
    return null;
  }
  for (let index = frameBuffer.length - 1; index >= 0; index -= 1) {
    const snapshot = buildBattleSnapshot(frameBuffer[index]);
    if (snapshot) {
      return { frame: frameBuffer[index], snapshot };
    }
  }
  return null;
}


