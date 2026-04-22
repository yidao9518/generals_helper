import helperConfig from "../shared/helper-config.js";
import { setTextContent } from "../shared/dom-utils.js";
import { DEFAULT_PYTHON_BRIDGE_CONFIG, fetchPythonBridgeLatestRecord, loadPythonBridgeConfig } from "../shared/python-bridge.js";
import { renderCombinedBoard } from "./display-board.js";
import { renderPlayerPanel } from "./display-players.js";

const refreshBtn = document.getElementById("refreshBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const turnValueEl = document.getElementById("turnValue");
const matchValueEl = document.getElementById("matchValue");
const playersValueEl = document.getElementById("playersValue");
const debugPanelEl = document.getElementById("debugPanel");
const debugValueEl = document.getElementById("debugValue");
const debugCopyBtn = document.getElementById("debugCopyBtn");
const boardMetaEl = document.getElementById("boardMeta");
const citiesDiffValueEl = document.getElementById("citiesDiffValue");
const desertsDiffValueEl = document.getElementById("desertsDiffValue");
const boardSizeRangeEl = document.getElementById("boardSizeRange");
const boardSizeValueEl = document.getElementById("boardSizeValue");
const playerMetaEl = document.getElementById("playerMeta");
const playerListEl = document.getElementById("playerList");
const boardShellEl = document.getElementById("boardShell");
const boardGridEl = document.getElementById("boardGrid");
const statusEl = document.getElementById("status");

const DISPLAY_CLASS = {
  boardGrid: "board-grid",
  muted: "muted"
};

const PLAYER_COLORS = Array.isArray(helperConfig?.PLAYER_COLORS) ? helperConfig.PLAYER_COLORS : [];
const BOARD_SCALE_DEFAULT = 1;
const BOARD_SCALE_MIN = 0.5;
const BOARD_SCALE_MAX = 1.5;

let boardScale = BOARD_SCALE_DEFAULT;
let pinchState = null;
let boardScaleFrameId = null;
let boardScalePending = null;

let latestSnapshotRequestId = 0;
let latestSnapshot = null;
let latestSnapshotRecordId = null;
let latestSnapshotSimpleMode = DEFAULT_PYTHON_BRIDGE_CONFIG.simpleMode;
// start with helper-config defaults merged with bridge config defaults
let latestDisplayConfig = { ...helperConfig.BATTLE_DISPLAY_CONFIG, ...DEFAULT_PYTHON_BRIDGE_CONFIG };
let cachedBridgeConfig = null;

if (chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "BATTLE_SNAPSHOT_UPDATED") {
      void refreshSnapshot();
    }
    if (message?.type === "PYTHON_BRIDGE_PUSH_SUCCEEDED") {
      void refreshSnapshot();
    }
    if (message?.type === "PYTHON_BRIDGE_CONFIG_UPDATED") {
      cachedBridgeConfig = null;
      void refreshSnapshot({ refreshConfig: true });
    }
  });
}

function buildSnapshotFromPythonRecord(record) {
  const snapshot = record?.snapshot && typeof record.snapshot === "object" ? { ...record.snapshot } : null;
  if (!snapshot) {
    return null;
  }

  const analysis = record?.analysis && typeof record.analysis === "object" ? { ...record.analysis } : null;
  const frame = snapshot.frame && typeof snapshot.frame === "object" ? { ...snapshot.frame } : {};
  const summaryText = analysis?.summaryText || frame.battleSummary || snapshot.summary || snapshot?.battle?.summary || "暂无";

  if (!frame.battleSummary && summaryText) {
    frame.battleSummary = summaryText;
  }
  if (!snapshot.summary && summaryText) {
    snapshot.summary = summaryText;
  }
  if (analysis) {
    snapshot.analysis = analysis;
  }
  snapshot.frame = frame;

  return snapshot;
}

async function getBridgeConfigForDisplay({ refresh = false } = {}) {
  if (!refresh && cachedBridgeConfig) {
    return cachedBridgeConfig;
  }

  try {
    cachedBridgeConfig = await loadPythonBridgeConfig();
  } catch {
    cachedBridgeConfig = { ...DEFAULT_PYTHON_BRIDGE_CONFIG };
  }
  return cachedBridgeConfig;
}

function syncBoardScaleLabel() {
  if (boardSizeValueEl instanceof HTMLElement) {
    const percent = boardScale * 100;
    boardSizeValueEl.textContent = Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
  }
  if (boardSizeRangeEl instanceof HTMLInputElement) {
    boardSizeRangeEl.value = String(boardScale * 100);
  }
}

function setBoardScale(nextScale) {
  const numericScale = Number(nextScale);
  if (!Number.isFinite(numericScale)) {
    return;
  }

  boardScale = Math.min(BOARD_SCALE_MAX, Math.max(BOARD_SCALE_MIN, numericScale));
  syncBoardScaleLabel();
  if (boardGridEl instanceof HTMLElement && boardGridEl.className === DISPLAY_CLASS.boardGrid) {
    boardGridEl.style.zoom = String(boardScale);
  }
}

function scheduleBoardScale(nextScale) {
  boardScalePending = nextScale;
  if (boardScaleFrameId !== null) {
    return;
  }

  boardScaleFrameId = window.requestAnimationFrame(() => {
    boardScaleFrameId = null;
    const pendingScale = boardScalePending;
    boardScalePending = null;
    setBoardScale(pendingScale);
  });
}

function distanceBetweenPoints(pointA, pointB) {
  const deltaX = pointA.clientX - pointB.clientX;
  const deltaY = pointA.clientY - pointB.clientY;
  return Math.hypot(deltaX, deltaY);
}

function getTouchesSnapshot(event) {
  return Array.from(event.touches || []).map((touch) => ({
    id: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY
  }));
}

function startPinch(event) {
  const touches = getTouchesSnapshot(event);
  if (touches.length < 2) {
    return;
  }

  pinchState = {
    initialDistance: distanceBetweenPoints(touches[0], touches[1]),
    initialScale: boardScale
  };
}

function updatePinch(event) {
  if (!pinchState) {
    return;
  }

  const touches = getTouchesSnapshot(event);
  if (touches.length < 2) {
    pinchState = null;
    return;
  }

  event.preventDefault();
  const currentDistance = distanceBetweenPoints(touches[0], touches[1]);
  if (!Number.isFinite(currentDistance) || currentDistance <= 0 || !Number.isFinite(pinchState.initialDistance) || pinchState.initialDistance <= 0) {
    return;
  }

  const scaleRatio = currentDistance / pinchState.initialDistance;
  setBoardScale(pinchState.initialScale * scaleRatio);
}

function endPinch(event) {
  const touches = getTouchesSnapshot(event);
  if (touches.length < 2) {
    pinchState = null;
  }
}

function isEventInsideBoardShell(event) {
  if (!(boardShellEl instanceof HTMLElement)) {
    return false;
  }

  const target = event?.target;
  if (target instanceof Node && boardShellEl.contains(target)) {
    return true;
  }

  const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
  return path.includes(boardShellEl);
}

function handleBoardWheel(event) {
  if (!event.ctrlKey || !isEventInsideBoardShell(event)) {
    return;
  }

  event.preventDefault();
  const currentScale = boardScalePending ?? boardScale;
  const zoomDelta = Math.exp(-event.deltaY * 0.003);
  scheduleBoardScale(currentScale * zoomDelta);
}

function getPlayerColor(color) {
  return Number.isInteger(color) && color >= 0 && color < PLAYER_COLORS.length ? PLAYER_COLORS[color] : "#94a3b8";
}

function formatDebugSummary(battleRelations) {
  const debug = battleRelations?.debug && typeof battleRelations.debug === "object" ? battleRelations.debug : null;
  const playerStates = Array.isArray(battleRelations?.playerStates) ? battleRelations.playerStates : [];
  if (!debug && !playerStates.length) {
    return "暂无调试信息";
  }

  const lines = [];
  lines.push(
    `comparison=${battleRelations?.comparisonAvailable ? "是" : "否"} | ` +
    `warCount=${typeof battleRelations?.warPlayerCount === "number" ? battleRelations.warPlayerCount : "?"} | ` +
    `adjacent=${battleRelations?.adjacencyAssumed ? "是" : "否"}`
  );

  if (debug) {
    lines.push(
      `turn=${debug.currentTurn ?? "?"} | prev=${debug.previousTurn ?? "?"} | keys=${(debug.currentPlayerKeys || []).join(",") || "无"}`
    );
  }

  const players = debug && Array.isArray(debug.players) && debug.players.length ? debug.players : playerStates;
  for (const player of players.slice(0, 6)) {
    // noinspection JSUnresolvedReference
    lines.push(
      `${player.name || `玩家${player.key}`}: ` +
      `s=${player.currentStrength ?? "?"}/${player.previousStrength ?? "?"} ` +
      `t=${player.currentTiles ?? "?"}/${player.previousTiles ?? "?"} ` +
      `sd=${player.strengthDrop ? "是" : "否"} ` +
      `td=${player.tilesDrop ? "是" : "否"} ` +
      `war=${player.inWar ? "是" : "否"} | ` +
      `reasons=${Array.isArray(player.warReasons) && player.warReasons.length ? player.warReasons.join(",") : "无"}`
    );
  }

  const raw = debug || { playerStates };
  lines.push("raw=");
  lines.push(JSON.stringify(raw, null, 2));
  return lines.join("\n");
}

async function copyDebugText() {
  const text = String(debugValueEl?.textContent || "");
  if (!text || text === "暂无") {
    throw new Error("暂无可复制内容");
  }

  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  // noinspection JSDeprecatedSymbols
  const copied = typeof document.execCommand === "function" && document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("复制失败");
  }
}

function renderSnapshot(snapshot, recordId = null, displayConfig = latestDisplayConfig) {
  latestSnapshot = snapshot || null;
  latestSnapshotRecordId = Number.isInteger(recordId) ? recordId : null;
  latestSnapshotSimpleMode = Boolean(displayConfig?.simpleMode);
  latestDisplayConfig = { ...latestDisplayConfig, ...displayConfig };

  if (!latestSnapshot) {
    latestSnapshotRecordId = null;
    setTextContent(turnValueEl, "暂无", { mutedClass: DISPLAY_CLASS.muted });
    setTextContent(matchValueEl, "暂无", { mutedClass: DISPLAY_CLASS.muted });
    setTextContent(playersValueEl, "暂无", { mutedClass: DISPLAY_CLASS.muted });
    setTextContent(debugValueEl, "暂无", { mutedClass: DISPLAY_CLASS.muted });
    if (debugPanelEl instanceof HTMLElement) {
      debugPanelEl.style.display = displayConfig?.showDebug ? "block" : "none";
    }
    renderCombinedBoard({ snapshot: null, boardGridEl, boardMetaEl, boardScale, getPlayerColor });
    renderPlayerPanel({ snapshot: null, displayConfig, playerListEl, playerMetaEl, getPlayerColor });
    return;
  }

  const players = latestSnapshot?.players || [];
  const turn = latestSnapshot?.turn;
  const matchId = latestSnapshot?.matchId || latestSnapshot?.gameId || "暂无";
  const aliveCount = typeof latestSnapshot?.aliveCount === "number"
    ? latestSnapshot.aliveCount
    : players.filter((player) => player?.alive !== false && player?.dead !== true).length;
  const playerCount = typeof latestSnapshot?.playerCount === "number" ? latestSnapshot.playerCount : players.length;
  const debugText = formatDebugSummary(latestSnapshot?.analysis?.battleRelations);

  // The top-line cards (回合 / 对局 / 玩家-存活) must always be visible per UX requirement.
  const turnCard = turnValueEl?.parentElement;
  if (turnCard instanceof HTMLElement) {
    // Always show the turn card regardless of displayConfig
    turnCard.style.display = "";
  }
  setTextContent(turnValueEl, turn, { mutedClass: DISPLAY_CLASS.muted });

  const playersCard = playersValueEl?.parentElement;
  if (playersCard instanceof HTMLElement) {
    // Always show the players / alive card regardless of displayConfig
    playersCard.style.display = "";
  }
  setTextContent(playersValueEl, `${playerCount} / ${aliveCount}`, { mutedClass: DISPLAY_CLASS.muted });

  setTextContent(matchValueEl, matchId, { mutedClass: DISPLAY_CLASS.muted });

  // map/cities/deserts diffs
  if (citiesDiffValueEl instanceof HTMLElement) {
    const parent = citiesDiffValueEl.parentElement;
    if (parent instanceof HTMLElement) parent.style.display = displayConfig?.showCitiesDiff ? "" : "none";
    const citiesCount = Array.isArray(latestSnapshot?.battle?.citiesDiff) ? latestSnapshot.battle.citiesDiff.length : 0;
    setTextContent(citiesDiffValueEl, citiesCount ? `${citiesCount} 个变化` : "暂无", { mutedClass: DISPLAY_CLASS.muted });
  }
  if (desertsDiffValueEl instanceof HTMLElement) {
    const parent = desertsDiffValueEl.parentElement;
    if (parent instanceof HTMLElement) parent.style.display = displayConfig?.showDesertsDiff ? "" : "none";
    const desertsCount = Array.isArray(latestSnapshot?.battle?.desertsDiff) ? latestSnapshot.battle.desertsDiff.length : 0;
    setTextContent(desertsDiffValueEl, desertsCount ? `${desertsCount} 个变化` : "暂无", { mutedClass: DISPLAY_CLASS.muted });
  }

  setTextContent(debugValueEl, debugText, { mutedClass: DISPLAY_CLASS.muted });
  if (debugPanelEl instanceof HTMLElement) {
    debugPanelEl.style.display = displayConfig?.showDebug ? "block" : "none";
  }
  renderCombinedBoard({ snapshot: latestSnapshot, boardGridEl, boardMetaEl, boardScale, getPlayerColor });
  renderPlayerPanel({ snapshot: latestSnapshot, displayConfig, playerListEl, playerMetaEl, getPlayerColor });
}

function renderCurrentSnapshot() {
  if (latestSnapshot) {
    renderSnapshot(latestSnapshot, latestSnapshotRecordId, latestDisplayConfig);
  }
}

function preserveSnapshotIfAvailable(message, bridgeConfig) {
  setTextContent(statusEl, message, { mutedClass: DISPLAY_CLASS.muted });
  if (!latestSnapshot) {
    renderSnapshot(null, null, bridgeConfig);
  }
}

async function refreshSnapshot({ refreshConfig = false } = {}) {
  const requestId = ++latestSnapshotRequestId;
  setTextContent(statusEl, "正在读取本地 Python 数据...", { mutedClass: DISPLAY_CLASS.muted });
  let bridgeConfig = null;
  try {
    bridgeConfig = await getBridgeConfigForDisplay({ refresh: refreshConfig });
    const response = await fetchPythonBridgeLatestRecord(bridgeConfig);
    if (requestId !== latestSnapshotRequestId) {
      return;
    }
    if (!response?.ok) {
      preserveSnapshotIfAvailable(`读取失败：${response?.body?.error || `HTTP ${response?.status}` || "未知错误"}`, bridgeConfig);
      return;
    }

    const latestRecord = response.body?.record || null;
    const latestRecordId = Number.isInteger(latestRecord?.id) ? latestRecord.id : null;
    if (latestRecordId !== null && latestRecordId === latestSnapshotRecordId && latestSnapshotSimpleMode === Boolean(bridgeConfig?.simpleMode)) {
      setTextContent(statusEl, `Python 已是最新：${new Date().toLocaleTimeString()}`, { mutedClass: DISPLAY_CLASS.muted });
      return;
    }

    const latestSnapshotFromPython = buildSnapshotFromPythonRecord(latestRecord);
    if (!latestSnapshotFromPython) {
      preserveSnapshotIfAvailable("Python 暂无最新战斗快照", bridgeConfig);
      return;
    }

    renderSnapshot(latestSnapshotFromPython, latestRecordId, bridgeConfig);
    setTextContent(statusEl, `已从 Python 刷新：${new Date().toLocaleTimeString()}`, { mutedClass: DISPLAY_CLASS.muted });
  } catch (error) {
    if (requestId !== latestSnapshotRequestId) {
      return;
    }
    preserveSnapshotIfAvailable(`刷新失败：${String(error?.message || error)}`, bridgeConfig);
  }
}

if (refreshBtn instanceof HTMLButtonElement) {
  refreshBtn.addEventListener("click", () => {
    void refreshSnapshot();
  });
}

if (openSettingsBtn instanceof HTMLButtonElement) {
  openSettingsBtn.addEventListener("click", async () => {
    try {
      if (typeof chrome.runtime.openOptionsPage === "function") {
        await chrome.runtime.openOptionsPage();
        return;
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
    } catch {
      setTextContent(statusEl, "无法打开设置页", { mutedClass: DISPLAY_CLASS.muted });
    }
  });
}

if (debugCopyBtn instanceof HTMLButtonElement) {
  debugCopyBtn.addEventListener("click", async () => {
    try {
      await copyDebugText();
      setTextContent(statusEl, "调试信息已复制", { mutedClass: DISPLAY_CLASS.muted });
    } catch (error) {
      setTextContent(statusEl, `复制失败：${String(error?.message || error)}`, { mutedClass: DISPLAY_CLASS.muted });
    }
  });
}

if (boardSizeRangeEl instanceof HTMLInputElement) {
  boardSizeRangeEl.min = String(Math.round(BOARD_SCALE_MIN * 100));
  boardSizeRangeEl.max = String(Math.round(BOARD_SCALE_MAX * 100));
  boardSizeRangeEl.step = "any";
  syncBoardScaleLabel();
  boardSizeRangeEl.addEventListener("input", () => {
    setBoardScale(Number(boardSizeRangeEl.value) / 100);
  });
}

if (boardShellEl instanceof HTMLElement) {
  boardShellEl.addEventListener("touchstart", (event) => {
    if (event.touches.length >= 2) {
      startPinch(event);
    }
  }, { passive: true });

  boardShellEl.addEventListener("touchmove", (event) => {
    if (event.touches.length >= 2) {
      updatePinch(event);
    }
  }, { passive: false });

  boardShellEl.addEventListener("touchend", endPinch, { passive: true });
  boardShellEl.addEventListener("touchcancel", endPinch, { passive: true });
}

window.addEventListener("wheel", handleBoardWheel, { passive: false, capture: true });

window.addEventListener("resize", () => {
  renderCurrentSnapshot();
});

void refreshSnapshot();

