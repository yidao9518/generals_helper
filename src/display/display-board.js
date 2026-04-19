// noinspection JSUnusedGlobalSymbols

import { setTextContent } from "../shared/dom-utils.js";

const BOARD_CELL_SIZE = "1.4rem";

const DISPLAY_CLASS = {
  boardGrid: "board-grid",
  boardCell: "board-cell",
  cellContent: "cell-content",
  cellEmptyText: "cell-empty-text",
  emptyBoard: "empty-board"
};

const STATE_CLASS_BY_VALUE = {
  [-1]: "cell-state--1",
  [-2]: "cell-state--2",
  [-3]: "cell-state--3",
  [-4]: "cell-state--4"
};

export function matrixDimensions(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) {
    return { rows: 0, cols: 0 };
  }

  const rows = matrix.length;
  const firstRow = matrix[0];
  if (!Array.isArray(firstRow)) {
    throw new Error("棋盘表格格式无效：首行不是数组");
  }

  const cols = firstRow.length;
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    if (!Array.isArray(row)) {
      throw new Error(`棋盘表格格式无效：第 ${rowIndex + 1} 行不是数组`);
    }
    if (row.length !== cols) {
      throw new Error(`棋盘表格尺寸不一致：第 ${rowIndex + 1} 行列数为 ${row.length}，但首行列数为 ${cols}`);
    }
  }

  return { rows, cols };
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

function getReadableTextColor(backgroundColor) {
  if (typeof backgroundColor !== "string") {
    return "#0f172a";
  }

  const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (!match) {
    return "#0f172a";
  }

  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return luminance >= 160 ? "#0f172a" : "#f8fafc";
}

function getPlayerColorByState(players, state, getPlayerColor) {
  if (!Number.isInteger(state) || state < 0 || !Array.isArray(players) || typeof getPlayerColor !== "function") {
    return null;
  }

  const owner = players.find((player) => Number.isInteger(player?.i) && player.i === state);
  return owner ? getPlayerColor(owner.color) : null;
}

function renderEmptyBoard(boardGridEl, boardMetaEl) {
  boardGridEl.className = DISPLAY_CLASS.emptyBoard;
  boardGridEl.textContent = "暂无数据";
  boardGridEl.style.zoom = "";
  setTextContent(boardMetaEl, "未加载");
}

export function renderCombinedBoard({ snapshot, boardGridEl, boardMetaEl, boardScale, getPlayerColor }) {
  if (!(boardGridEl instanceof HTMLElement)) {
    return;
  }

  const board = snapshot?.board || {};
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const armyTable = Array.isArray(board?.armyTable) ? board.armyTable : [];
  const stateTable = Array.isArray(board?.stateTable) ? board.stateTable : [];
  const armyDims = matrixDimensions(armyTable);
  const stateDims = matrixDimensions(stateTable);

  if (!armyDims.rows && !stateDims.rows) {
    renderEmptyBoard(boardGridEl, boardMetaEl);
    return;
  }

  if (armyDims.rows !== stateDims.rows || armyDims.cols !== stateDims.cols) {
    throw new Error(`棋盘表格尺寸不一致：armyTable=${armyDims.rows}×${armyDims.cols}，stateTable=${stateDims.rows}×${stateDims.cols}`);
  }

  if (!armyDims.rows || !armyDims.cols) {
    renderEmptyBoard(boardGridEl, boardMetaEl);
    return;
  }

  boardGridEl.className = DISPLAY_CLASS.boardGrid;
  boardGridEl.style.zoom = String(boardScale);
  boardGridEl.style.gridTemplateColumns = `repeat(${armyDims.cols}, ${BOARD_CELL_SIZE})`;
  boardGridEl.style.gridAutoRows = BOARD_CELL_SIZE;
  boardGridEl.style.gap = "0";
  boardGridEl.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (let row = 0; row < armyDims.rows; row += 1) {
    for (let col = 0; col < armyDims.cols; col += 1) {
      const state = Number.isInteger(stateTable[row]?.[col]) ? stateTable[row][col] : 0;
      const army = armyTable[row]?.[col];
      const cellColor = getPlayerColorByState(players, state, getPlayerColor);
      const cell = document.createElement("div");
      cell.className = `${DISPLAY_CLASS.boardCell} ${normalizeStateClass(state)}`;
      if (cellColor) {
        cell.style.background = cellColor;
      }
      cell.dataset.state = String(state);
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.title = `坐标 (${row + 1}, ${col + 1})\n兵力: ${formatArmyValue(army) || "0"}\n状态: ${state}`;

      const content = document.createElement("span");
      content.className = DISPLAY_CLASS.cellContent;
      if (cellColor) {
        content.style.color = getReadableTextColor(cellColor);
      }
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
  setTextContent(boardMetaEl, `${armyDims.rows}×${armyDims.cols}`);
}


