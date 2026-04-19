// noinspection JSUnusedGlobalSymbols
import { parseBattlePacketFrame } from "../shared/battle-packet-parser.js";

const MATCH_START_EVENTS = new Set(["game_start"]);
const MATCH_CONFIRM_EVENTS = new Set(["game_activate", "game_update"]);
const MATCH_END_EVENTS = new Set(["game_lost", "game_won"]);
const MATCH_ACTIVATION_TIMEOUT_MS = 2000;

function createDefaultState() {
  return { inMatch: false, currentMatchId: "", lastMatchId: "", battleMapState: null, playerMeta: null, awaitingActivation: false, activationDeadlineAt: 0 };
}

function clearPendingActivation(state) {
  state.awaitingActivation = false;
  state.activationDeadlineAt = 0;
}

function expirePendingActivation(state, now = Date.now()) {
  if (!state?.awaitingActivation) {
    return false;
  }
  if (!Number.isFinite(state.activationDeadlineAt) || now <= state.activationDeadlineAt) {
    return false;
  }

  state.inMatch = false;
  state.currentMatchId = "";
  clearPendingActivation(state);
  return true;
}

function extractPlayerMetaFromPreview(preview) {
  const packet = parseBattlePacketFrame(preview);
  if (!packet || packet.eventName !== "game_start" || !Array.isArray(packet.payload) || typeof packet.payload[1] !== "object" || packet.payload[1] === null) {
    return null;
  }

  const startData = packet.payload[1];
  const usernames = Array.isArray(startData.usernames) ? startData.usernames : [];
  const playerColors = Array.isArray(startData.playerColors) ? startData.playerColors : [];
  const maxPlayers = Math.max(usernames.length, playerColors.length);

  return {
    playerIndex: Number.isInteger(startData.playerIndex) ? startData.playerIndex : null,
    players: Array.from({ length: maxPlayers }, (_, index) => ({
      i: index,
      color: Number.isInteger(playerColors[index]) ? playerColors[index] : null,
      name: typeof usernames[index] === "string" ? usernames[index] : ""
    })),
    raw: {
      playerIndex: Number.isInteger(startData.playerIndex) ? startData.playerIndex : null,
      playerColors,
      usernames
    }
  };
}

export function ensureTabState(tabMatchState, tabId) {
  const key = Number.isInteger(tabId) ? tabId : -1;
  let state = tabMatchState.get(key);
  if (!state) {
    state = createDefaultState();
    tabMatchState.set(key, state);
  }
  return state;
}

export function extractReplayIdFromPreview(preview) {
  if (typeof preview !== "string") {
    return "";
  }
  const match = preview.match(/"replay_id":"([^"\\]+)"/);
  return match ? match[1] : "";
}

export function enrichWithMatchMeta(tabMatchState, frame) {
  const state = ensureTabState(tabMatchState, frame.tabId);
  const eventName = frame.eventName || "";
  const now = Number.isInteger(frame.capturedAt) ? frame.capturedAt : Date.now();

  expirePendingActivation(state, now);

  if (MATCH_CONFIRM_EVENTS.has(eventName)) {
    state.inMatch = true;
    if (!state.currentMatchId) {
      state.currentMatchId = state.lastMatchId || `match-${now}-${Math.random().toString(36).slice(2, 7)}`;
    }
    state.lastMatchId = state.currentMatchId;
    clearPendingActivation(state);
  }

  if (MATCH_START_EVENTS.has(eventName)) {
    const replayId = extractReplayIdFromPreview(frame.preview);
    const generatedId = `match-${now}-${Math.random().toString(36).slice(2, 7)}`;
    state.currentMatchId = replayId || generatedId;
    state.lastMatchId = state.currentMatchId;
    state.inMatch = true;
    state.playerMeta = extractPlayerMetaFromPreview(frame.preview);
    state.awaitingActivation = true;
    state.activationDeadlineAt = now + MATCH_ACTIVATION_TIMEOUT_MS;
  }

  const endedMatchId = state.currentMatchId || state.lastMatchId || "";
  const isEndEvent = MATCH_END_EVENTS.has(eventName);
  const inMatch = isEndEvent ? false : state.inMatch;
  const matchId = state.inMatch ? state.currentMatchId : endedMatchId;

  if (isEndEvent) {
    state.inMatch = false;
    state.currentMatchId = "";
    state.playerMeta = null;
    clearPendingActivation(state);
  }

  if (!state.inMatch) {
    clearPendingActivation(state);
  }

  return {
    ...frame,
    inMatch,
    matchId,
    matchEvent: eventName || "",
    playerMeta: state.playerMeta
  };
}

export function serializeTabMatchState(tabMatchState) {
  return Array.from(tabMatchState.entries());
}

export function restoreTabMatchState(tabMatchState, savedState) {
  tabMatchState.clear();
  if (!Array.isArray(savedState)) {
    return;
  }
  const now = Date.now();
  for (const item of savedState) {
    if (!Array.isArray(item) || item.length !== 2) {
      continue;
    }
    const [key, value] = item;
    if (!Number.isInteger(key) || typeof value !== "object" || value === null) {
      continue;
    }
    tabMatchState.set(key, {
      inMatch: Boolean(value.inMatch),
      currentMatchId: typeof value.currentMatchId === "string" ? value.currentMatchId : "",
      lastMatchId: typeof value.lastMatchId === "string" ? value.lastMatchId : "",
      battleMapState: value.battleMapState && typeof value.battleMapState === "object" ? value.battleMapState : null,
      playerMeta: value.playerMeta && typeof value.playerMeta === "object" ? value.playerMeta : null,
      awaitingActivation: Boolean(value.awaitingActivation) || (Boolean(value.inMatch) && !Number.isInteger(value.activationDeadlineAt)),
      activationDeadlineAt: Number.isInteger(value.activationDeadlineAt)
        ? value.activationDeadlineAt
        : (Boolean(value.inMatch) ? now + MATCH_ACTIVATION_TIMEOUT_MS : 0)
    });
  }
}

export function rebuildTabMatchStateFromFrames(tabMatchState, frameBuffer) {
  tabMatchState.clear();
  for (const frame of frameBuffer) {
    if (!Number.isInteger(frame?.tabId)) {
      continue;
    }
    const state = ensureTabState(tabMatchState, frame.tabId);
    state.inMatch = Boolean(frame?.inMatch);
    const matchId = typeof frame?.matchId === "string" ? frame.matchId : "";
    if (state.inMatch) {
      state.currentMatchId = matchId;
      state.awaitingActivation = true;
      state.activationDeadlineAt = Number.isInteger(frame?.activationDeadlineAt)
        ? frame.activationDeadlineAt
        : Date.now() + MATCH_ACTIVATION_TIMEOUT_MS;
    }
    if (matchId) {
      state.lastMatchId = matchId;
    }
    if (frame?.battleMapStateAfter && typeof frame.battleMapStateAfter === "object") {
      state.battleMapState = frame.battleMapStateAfter;
    }
    if (frame?.playerMeta && typeof frame.playerMeta === "object") {
      state.playerMeta = frame.playerMeta;
    }
  }
}

export function isAnyTabInMatch(tabMatchState, now = Date.now()) {
  for (const state of tabMatchState.values()) {
    expirePendingActivation(state, now);
    if (state?.inMatch) {
      return true;
    }
  }
  return false;
}


