// noinspection JSUnusedGlobalSymbols

import { setTextContent } from '../shared/dom-utils.js'

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

function getPlayerKey(player, fallbackIndex) {
  if (!player || typeof player !== "object") {
    return fallbackIndex;
  }

  for (const key of ["i", "index", "id"]) {
    const value = player[key];
    if (Number.isInteger(value)) {
      return value;
    }
  }

  return fallbackIndex;
}

function getRelationKey(player, fallbackIndex) {
  return getPlayerKey(player, fallbackIndex);
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

function getBattleRelationMap(snapshot) {
  const battleRelations = snapshot?.analysis?.battleRelations;
  const playerStates = Array.isArray(battleRelations?.playerStates) ? battleRelations.playerStates : [];
  const relationMap = new Map();
  for (const relationState of playerStates) {
    if (relationState && typeof relationState === "object" && relationState.key !== undefined && relationState.key !== null) {
      relationMap.set(String(relationState.key), relationState);
    }
  }
  return relationMap;
}

function normalizeRelationAssociations(relationState) {
  const associations = [];
  const seenKeys = new Set();

  const appendAssociation = (association) => {
    if (!association || typeof association !== "object") {
      return;
    }
    const relationKey = Number.isInteger(association.key) ? association.key : null;
    if (relationKey === null || seenKeys.has(relationKey)) {
      return;
    }
    seenKeys.add(relationKey);
    associations.push({
      key: relationKey,
      name: typeof association.name === "string" && association.name.trim() ? association.name.trim() : `玩家${relationKey}`,
      color: association.color,
      createdTurn: Number.isInteger(association.createdTurn) ? association.createdTurn : null
    });
  };

  const associatedPlayers = Array.isArray(relationState?.associatedPlayers) ? relationState.associatedPlayers : [];
  for (const association of associatedPlayers) {
    appendAssociation(association);
  }

  const adjacentKeys = Array.isArray(relationState?.adjacentPlayerKeys) ? relationState.adjacentPlayerKeys : [];
  const adjacentNames = Array.isArray(relationState?.adjacentPlayerNames) ? relationState.adjacentPlayerNames : [];
  const adjacentColors = Array.isArray(relationState?.adjacentPlayerColors) ? relationState.adjacentPlayerColors : [];
  adjacentKeys.forEach((adjacentKey, index) => {
    appendAssociation({
      key: Number.isInteger(adjacentKey) ? adjacentKey : null,
      name: typeof adjacentNames[index] === "string" ? adjacentNames[index] : "",
      color: adjacentColors[index]
    });
  });

  return associations;
}

function buildRelationValueNode(relationState, getPlayerColor) {
  const associations = normalizeRelationAssociations(relationState);
  const container = document.createElement("span");
  container.className = "player-relation-list";

  if (!associations.length) {
    const empty = document.createElement("span");
    empty.className = "player-relation-empty";
    empty.textContent = "暂无";
    container.appendChild(empty);
    return container;
  }

  for (const association of associations) {
    const chip = document.createElement("span");
    chip.className = "player-relation-chip";
    chip.style.background = typeof association.color === "string"
      ? association.color
      : typeof getPlayerColor === "function"
        ? getPlayerColor(association.color)
        : "#94a3b8";
    chip.title = `${association.name} (${association.key})`;
    container.appendChild(chip);
    // show created turn after the chip, if available
    if (association.createdTurn !== null && association.createdTurn !== undefined) {
      const turnEl = document.createElement("span");
      turnEl.className = "player-relation-turn";
      turnEl.textContent = String(association.createdTurn);
      container.appendChild(turnEl);
    }
  }

  const tooltipNames = associations.map((association) => association.name).filter((name) => typeof name === "string" && name.trim());
  if (tooltipNames.length) {
    container.title = tooltipNames.join("、");
  }

  return container;
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
  const relationMap = getBattleRelationMap(snapshot);
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
    const relationState = relationMap.get(String(getRelationKey(player, playerIndex ?? 0))) || null;
    const isInWar = Boolean(relationState?.inWar);
    const warStatusLabel = isInWar ? "交战" : "未交战";
    const totalValue = getPlayerField(player, "total");
    const tilesValue = getPlayerField(player, "tiles");
    const totalLabel = totalValue === null || totalValue === undefined || totalValue === "" ? "暂无" : String(totalValue);
    const tilesLabel = tilesValue === null || tilesValue === undefined || tilesValue === "" ? "暂无" : String(tilesValue);
    const killLabel = formatYesNo(getPlayerField(player, "has_kill"));
    const relationValueNode = buildRelationValueNode(relationState, getPlayerColor);

    card.style.setProperty("--player-accent", playerColor);
    if (isInWar) {
      card.classList.add("player-card--war");
    }
    if (!simpleMode) {
      card.title = `name=${nameLabel} | ${indexLabel} | color=${Number.isInteger(player?.color) ? player.color : "暂无"} | total=${totalLabel} | tiles=${tilesLabel} | has_kill=${killLabel} | ${warStatusLabel}`;
    } else {
      card.title = `状态=${warStatusLabel} | 兵力=${totalLabel} | 地块=${tilesLabel}`;
    }

    const header = document.createElement("div");
    header.className = "player-card-header";

    const status = document.createElement("div");
    status.className = "player-status";
    status.textContent = warStatusLabel;

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
              ["地块", tilesLabel],
              ["关系", relationValueNode]
            ]
      : [
          ["name", nameLabel],
          ["i", Number.isInteger(player?.i) ? String(player.i) : (Number.isInteger(player?.index) ? String(player.index) : "暂无")],
          ["color", Number.isInteger(player?.color) ? String(player.color) : "暂无"],
          ["兵力", totalLabel],
          ["地块", tilesLabel],
          ["击杀", killLabel],
          ["关系", relationValueNode],
          ["存活", player?.alive === false ? "否" : "是"],
          ["阵亡", player?.dead ? "是" : "否"]
        ];

    for (const [label, value] of metaItems) {
      const itemEl = document.createElement("span");
      itemEl.className = "player-meta-item";
      const labelEl = document.createElement("span");
      labelEl.className = "player-meta-label";
      labelEl.textContent = `${label}：`;
      itemEl.appendChild(labelEl);
      if (value instanceof Node) {
        itemEl.appendChild(value);
      } else {
        const valueEl = document.createElement("span");
        valueEl.textContent = value;
        itemEl.appendChild(valueEl);
      }
      meta.appendChild(itemEl);
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


