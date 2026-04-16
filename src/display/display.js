const refreshBtn = document.getElementById("refreshBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const turnValueEl = document.getElementById("turnValue");
const matchValueEl = document.getElementById("matchValue");
const playersValueEl = document.getElementById("playersValue");
const summaryValueEl = document.getElementById("summaryValue");
const boardMetaEl = document.getElementById("boardMeta");
const boardSizeRangeEl = document.getElementById("boardSizeRange");
const boardSizeValueEl = document.getElementById("boardSizeValue");
const playerMetaEl = document.getElementById("playerMeta");
const playerListEl = document.getElementById("playerList");
const boardShellEl = document.getElementById("boardShell");
const boardGridEl = document.getElementById("boardGrid");
const statusEl = document.getElementById("status");

const DISPLAY_CLASS = {
  boardGrid: "board-grid",
  boardCell: "board-cell",
  cellContent: "cell-content",
  cellEmptyText: "cell-empty-text",
  muted: "muted",
  emptyBoard: "empty-board"
};

const STATE_CLASS_BY_VALUE = {
  [-1]: "cell-state--1",
  [-2]: "cell-state--2",
  [-3]: "cell-state--3",
  [-4]: "cell-state--4"
};

const BOARD_CELL_SIZE = "1.4rem";
const BOARD_SCALE_DEFAULT = 1;
const BOARD_SCALE_MIN = 0.5;
const BOARD_SCALE_MAX = 1.5;

let boardScale = BOARD_SCALE_DEFAULT;
let pinchState = null;
let boardScaleFrameId = null;
let boardScalePending = null;

let latestSnapshotRequestId = 0;
let pollingTimer = null;
let latestSnapshot = null;

function setText(el, value, fallback = "暂无") {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  el.textContent = typeof value === "string" && value.trim() ? value : fallback;
  el.classList.toggle(DISPLAY_CLASS.muted, !value || !String(value).trim());
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "暂无";
  }
  return String(value);
}

function matrixDimensions(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) {
    return { rows: 0, cols: 0 };
  }
  return {
    rows: matrix.length,
    cols: Math.max(...matrix.map((row) => (Array.isArray(row) ? row.length : 0)))
  };
}

function getCellSize() {
  return BOARD_CELL_SIZE;
}

function formatBoardScale(scale) {
  const percent = scale * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

function syncBoardScaleLabel() {
  if (boardSizeValueEl instanceof HTMLElement) {
    boardSizeValueEl.textContent = formatBoardScale(boardScale);
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

function normalizeStateClass(state) {
  return Number.isInteger(state) && STATE_CLASS_BY_VALUE[state] ? STATE_CLASS_BY_VALUE[state] : "cell-state-0";
}

function formatArmyValue(value) {
  const army = Number(value);
  if (!Number.isFinite(army) || army <= 0) {
    return "";
  }
  return String(army);
}

function formatPlayerStatus(player) {
  if (player?.dead) {
    return "阵亡";
  }
  if (player?.alive === false) {
    return "未存活";
  }
  return "存活";
}

function formatPlayerRawSummary(raw) {
  if (!raw || typeof raw !== "object") {
    return "raw: 暂无";
  }

  const entries = Object.entries(raw).slice(0, 4);
  if (!entries.length) {
    return "raw: 空对象";
  }

  return `raw: ${entries.map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(", ")}`;
}

function renderPlayerPanel(snapshot) {
  if (!(playerListEl instanceof HTMLElement)) {
    return;
  }

  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const playerCount = typeof snapshot?.playerCount === "number" ? snapshot.playerCount : players.length;
  const aliveCount = typeof snapshot?.aliveCount === "number"
    ? snapshot.aliveCount
    : players.filter((player) => player?.alive !== false && player?.dead !== true).length;

  setText(playerMetaEl, playerCount ? `${playerCount} 名玩家 / 存活 ${aliveCount}` : "未加载");

  if (!players.length) {
    playerListEl.className = "player-list";
    playerListEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "player-empty";
    empty.textContent = "暂无玩家信息";
    playerListEl.appendChild(empty);
    return;
  }

  playerListEl.className = "player-list";
  playerListEl.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (const player of players) {
    const card = document.createElement("div");
    card.className = "player-card";
    const indexLabel = Number.isInteger(player?.index) ? `玩家 ${player.index + 1}` : "未知玩家";
    const statusLabel = formatPlayerStatus(player);
    const scoreLabel = typeof player?.score === "number" ? String(player.score) : "暂无";
    card.title = `${indexLabel} | ${statusLabel} | score=${scoreLabel}`;

    const header = document.createElement("div");
    header.className = "player-card-header";

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = indexLabel;

    const status = document.createElement("div");
    status.className = "player-status";
    status.textContent = statusLabel;

    header.appendChild(name);
    header.appendChild(status);

    const meta = document.createElement("div");
    meta.className = "player-meta";

    const metaItems = [
      ["序号", Number.isInteger(player?.index) ? String(player.index) : "暂无"],
      ["分数", scoreLabel],
      ["存活", player?.alive === false ? "否" : "是"],
      ["阵亡", player?.dead ? "是" : "否"]
    ];

    for (const [label, value] of metaItems) {
      const labelEl = document.createElement("span");
      labelEl.textContent = `${label}：${value}`;
      meta.appendChild(labelEl);
    }

    const raw = document.createElement("div");
    raw.className = "player-raw";
    raw.textContent = formatPlayerRawSummary(player?.raw);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(raw);
    fragment.appendChild(card);
  }

  playerListEl.appendChild(fragment);
}

function renderCombinedBoard(snapshot) {
  if (!(boardGridEl instanceof HTMLElement)) {
    return;
  }

  const board = snapshot?.board || {};
  const armyTable = Array.isArray(board?.armyTable) ? board.armyTable : [];
  const stateTable = Array.isArray(board?.stateTable) ? board.stateTable : [];
  const dims = matrixDimensions(armyTable.length ? armyTable : stateTable);

  if (!dims.rows || !dims.cols) {
    boardGridEl.className = DISPLAY_CLASS.emptyBoard;
    boardGridEl.textContent = "暂无数据";
    boardGridEl.style.zoom = "";
    setText(boardMetaEl, "未加载");
    return;
  }

  const cellSize = getCellSize();

  boardGridEl.className = DISPLAY_CLASS.boardGrid;
  boardGridEl.style.zoom = String(boardScale);
  boardGridEl.style.gridTemplateColumns = `repeat(${dims.cols}, ${cellSize})`;
  boardGridEl.style.gridAutoRows = cellSize;
  boardGridEl.style.gap = "0";
  boardGridEl.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (let row = 0; row < dims.rows; row += 1) {
    for (let col = 0; col < dims.cols; col += 1) {
      const state = Number.isInteger(stateTable[row]?.[col]) ? stateTable[row][col] : 0;
      const army = armyTable[row]?.[col];
      const cell = document.createElement("div");
      cell.className = `${DISPLAY_CLASS.boardCell} ${normalizeStateClass(state)}`;
      cell.dataset.state = String(state);
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.title = `坐标 (${row + 1}, ${col + 1})\n兵力: ${formatArmyValue(army) || "0"}\n状态: ${state}`;

      const content = document.createElement("span");
      content.className = DISPLAY_CLASS.cellContent;
      const armyText = formatArmyValue(army);
      content.textContent = armyText;
      if (!armyText) {
        content.classList.add(DISPLAY_CLASS.cellEmptyText);
      }
      cell.appendChild(content);
      fragment.appendChild(cell);
    }
  }

  boardGridEl.replaceChildren(fragment);
  setText(boardMetaEl, `${dims.rows}×${dims.cols}`);
}

function renderSnapshot(snapshot) {
  latestSnapshot = snapshot || null;

  if (!latestSnapshot) {
    setText(turnValueEl, "暂无");
    setText(matchValueEl, "暂无");
    setText(playersValueEl, "暂无");
    setText(summaryValueEl, "暂无");
    renderCombinedBoard(null);
    renderPlayerPanel(null);
    return;
  }

  const players = latestSnapshot?.players || [];
  const turn = latestSnapshot?.turn;
  const matchId = latestSnapshot?.matchId || latestSnapshot?.gameId || "暂无";
  const aliveCount = typeof latestSnapshot?.aliveCount === "number"
    ? latestSnapshot.aliveCount
    : players.filter((player) => player?.alive !== false && player?.dead !== true).length;
  const playerCount = typeof latestSnapshot?.playerCount === "number" ? latestSnapshot.playerCount : players.length;
  const summaryText = latestSnapshot?.frame?.battleSummary || latestSnapshot?.summary || latestSnapshot?.battle?.summary || "暂无";

  setText(turnValueEl, formatValue(turn));
  setText(matchValueEl, formatValue(matchId));
  setText(playersValueEl, `${playerCount} / ${aliveCount}`);
  setText(summaryValueEl, summaryText);
  renderCombinedBoard(latestSnapshot);
  renderPlayerPanel(latestSnapshot);
}

function renderCurrentSnapshot() {
  if (latestSnapshot) {
    renderCombinedBoard(latestSnapshot);
  }
}

async function getBattleSnapshot() {
  return chrome.runtime.sendMessage({ type: "GET_LATEST_BATTLE_SNAPSHOT" });
}

async function refreshSnapshot() {
  const requestId = ++latestSnapshotRequestId;
  setText(statusEl, "正在刷新最新快照...");
  try {
    const response = await getBattleSnapshot();
    if (requestId !== latestSnapshotRequestId) {
      return;
    }
    if (!response?.ok) {
      setText(statusEl, `读取失败：${response?.error || "未知错误"}`);
      return;
    }
    if (!response.latest?.snapshot) {
      setText(statusEl, "暂无最新战斗快照");
      renderSnapshot(null);
      return;
    }
    renderSnapshot(response.latest.snapshot);
    setText(statusEl, `已刷新：${new Date().toLocaleTimeString()}`);
  } catch (error) {
    if (requestId !== latestSnapshotRequestId) {
      return;
    }
    setText(statusEl, `刷新失败：${String(error?.message || error)}`);
  }
}

function startPolling() {
  if (pollingTimer !== null) {
    return;
  }
  pollingTimer = window.setInterval(() => {
    void refreshSnapshot();
  }, 500);
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
      setText(statusEl, "无法打开设置页");
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
startPolling();
