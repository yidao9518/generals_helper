// noinspection JSUnusedGlobalSymbols
const MATCH_START_EVENTS = new Set(["game_start"]);
const MATCH_END_EVENTS = new Set(["game_lost", "game_won"]);
const MATCH_ACTIVE_EVENTS = new Set(["game_start", "game_update"]);

export function ensureTabState(tabMatchState, tabId) {
  const key = Number.isInteger(tabId) ? tabId : -1;
  let state = tabMatchState.get(key);
  if (!state) {
    state = { inMatch: false, currentMatchId: "", lastMatchId: "", battleMapState: null };
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

  if (MATCH_ACTIVE_EVENTS.has(eventName)) {
    state.inMatch = true;
    if (!state.currentMatchId) {
      state.currentMatchId = state.lastMatchId || `match-${frame.capturedAt}-${Math.random().toString(36).slice(2, 7)}`;
    }
    state.lastMatchId = state.currentMatchId;
  }

  if (MATCH_START_EVENTS.has(eventName)) {
    const replayId = extractReplayIdFromPreview(frame.preview);
    const generatedId = `match-${frame.capturedAt}-${Math.random().toString(36).slice(2, 7)}`;
    state.currentMatchId = replayId || generatedId;
    state.lastMatchId = state.currentMatchId;
    state.inMatch = true;
  }

  const endedMatchId = state.currentMatchId || state.lastMatchId || "";
  const isEndEvent = MATCH_END_EVENTS.has(eventName);
  const inMatch = isEndEvent ? false : state.inMatch;
  const matchId = state.inMatch ? state.currentMatchId : endedMatchId;

  if (isEndEvent) {
    state.inMatch = false;
    state.currentMatchId = "";
  }

  return {
    ...frame,
    inMatch,
    matchId,
    matchEvent: eventName || ""
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
      battleMapState: value.battleMapState && typeof value.battleMapState === "object" ? value.battleMapState : null
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
    }
    if (matchId) {
      state.lastMatchId = matchId;
    }
    if (frame?.battleMapStateAfter && typeof frame.battleMapStateAfter === "object") {
      state.battleMapState = frame.battleMapStateAfter;
    }
  }
}

export function isAnyTabInMatch(tabMatchState) {
  for (const state of tabMatchState.values()) {
    if (state?.inMatch) {
      return true;
    }
  }
  return false;
}


