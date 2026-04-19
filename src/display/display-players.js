// noinspection JSUnusedGlobalSymbols

import { setTextContent } from "../shared/dom-utils.js";

function getPlayerField(player, key) {
  if (!player || typeof player !== "object") {
    return null;
  }

  if (player[key] !== undefined && player[key] !== null) {
    return player[key];
  }

  if (player.raw && typeof player.raw === "object" && player.raw[key] !== undefined && player.raw[key] !== null) {
    return player.raw[key];
  }

  return null;
}

function formatYesNo(value) {
  if (value === true) {
    return "是";
  }
  if (value === false) {
    return "否";
  }
  return "暂无";
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

export function renderPlayerPanel({ snapshot, displayConfig, playerListEl, playerMetaEl, getPlayerColor }) {
  if (!(playerListEl instanceof HTMLElement)) {
    return;
  }

  const simpleMode = Boolean(displayConfig?.simpleMode);
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const playerCount = typeof snapshot?.playerCount === "number" ? snapshot.playerCount : players.length;
  const aliveCount = typeof snapshot?.aliveCount === "number"
    ? snapshot.aliveCount
    : players.filter((player) => player?.alive !== false && player?.dead !== true).length;

  setTextContent(playerMetaEl, playerCount ? `${playerCount} 名玩家 / 存活 ${aliveCount}` : "未加载");

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
    if (player?.dead) {
      card.classList.add("player-card--dead");
    }
    if (simpleMode) {
      card.classList.add("player-card--simple");
    }

    const playerColor = typeof getPlayerColor === "function" ? getPlayerColor(player?.color) : "#94a3b8";
    const playerIndex = Number.isInteger(player?.i) ? player.i : player?.index;
    const indexLabel = Number.isInteger(playerIndex) ? `i=${playerIndex}` : "i=暂无";
    const nameLabel = typeof player?.name === "string" && player.name.trim() ? player.name.trim() : "暂无名称";
    const statusLabel = formatPlayerStatus(player);
    const totalValue = getPlayerField(player, "total") ?? player?.score;
    const tilesValue = getPlayerField(player, "tiles");
    const totalLabel = totalValue === null || totalValue === undefined || totalValue === "" ? "暂无" : String(totalValue);
    const tilesLabel = tilesValue === null || tilesValue === undefined || tilesValue === "" ? "暂无" : String(tilesValue);
    const killLabel = formatYesNo(getPlayerField(player, "has_kill"));

    card.style.setProperty("--player-accent", playerColor);
    if (!simpleMode) {
      card.title = `name=${nameLabel} | ${indexLabel} | color=${Number.isInteger(player?.color) ? player.color : "暂无"} | total=${totalLabel} | tiles=${tilesLabel} | has_kill=${killLabel} | ${statusLabel}`;
    } else {
      card.title = `状态=${statusLabel} | 兵力=${totalLabel} | 地块=${tilesLabel}`;
    }

    const header = document.createElement("div");
    header.className = "player-card-header";

    const status = document.createElement("div");
    status.className = "player-status";
    status.textContent = statusLabel;

    const colorBadge = document.createElement("span");
    colorBadge.className = "player-color-badge";
    colorBadge.style.background = playerColor;
    colorBadge.title = `玩家颜色：${playerColor}`;

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = nameLabel;

    const titleGroup = document.createElement("div");
    titleGroup.className = "player-title-group";
    titleGroup.appendChild(colorBadge);
    titleGroup.appendChild(name);

    if (!simpleMode) {
      header.appendChild(titleGroup);
      header.appendChild(status);
    } else {
      header.appendChild(titleGroup);
    }

    const meta = document.createElement("div");
    meta.className = "player-meta";

    const metaItems = simpleMode
      ? [
          ["兵力", totalLabel],
          ["地块", tilesLabel]
        ]
      : [
          ["name", nameLabel],
          ["i", Number.isInteger(player?.i) ? String(player.i) : (Number.isInteger(player?.index) ? String(player.index) : "暂无")],
          ["color", Number.isInteger(player?.color) ? String(player.color) : "暂无"],
          ["总分", totalLabel],
          ["地块", tilesLabel],
          ["击杀", killLabel],
          ["存活", player?.alive === false ? "否" : "是"],
          ["阵亡", player?.dead ? "是" : "否"]
        ];

    for (const [label, value] of metaItems) {
      const labelEl = document.createElement("span");
      labelEl.textContent = `${label}：${value}`;
      meta.appendChild(labelEl);
    }

    card.appendChild(header);
    card.appendChild(meta);
    if (!simpleMode) {
      const raw = document.createElement("div");
      raw.className = "player-raw";
      raw.textContent = formatPlayerRawSummary(player?.raw);
      card.appendChild(raw);
    }
    fragment.appendChild(card);
  }

  playerListEl.appendChild(fragment);
}


