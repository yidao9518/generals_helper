import { normalizeCapturedFrame } from "../shared/frame-tools.js";
import { summarizeBattleFrames } from "../shared/battle-debug.js";
import { BATTLE_DISPLAY_CONFIG, decorateBattleFrame, prepareBattleFramesForDisplay, rehydrateBattleFramesFromBuffer } from "./battle-frame-state.js";
import { getLatestFrames, loadFrameBuffer, saveFrameBuffer, trimFrameBuffer } from "./frame-store.js";
import { ensureTabState, enrichWithMatchMeta, isAnyTabInMatch, rebuildTabMatchStateFromFrames, restoreTabMatchState, serializeTabMatchState } from "./match-state.js";

const STORAGE_KEY = "capturedFrames";
const MATCH_STATE_KEY = "tabMatchState";
const MAX_FRAMES = 500;

let frameBuffer = [];
let saveTimer = null;
const tabMatchState = new Map();
let bootstrapPromise = null;

async function bootstrap() {
  frameBuffer = await loadFrameBuffer(STORAGE_KEY, MAX_FRAMES);
  const { [MATCH_STATE_KEY]: savedMatchState } = await chrome.storage.local.get([MATCH_STATE_KEY]);
  restoreTabMatchState(savedMatchState);
  if (tabMatchState.size === 0 && frameBuffer.length > 0) {
    rebuildTabMatchStateFromFrames(tabMatchState, frameBuffer);
  }
  const migrated = rehydrateBattleFramesFromBuffer(frameBuffer, tabMatchState, BATTLE_DISPLAY_CONFIG);
  if (migrated) {
    await saveFrameBuffer(STORAGE_KEY, frameBuffer);
    await chrome.storage.local.set({ [MATCH_STATE_KEY]: serializeTabMatchState(tabMatchState) });
  }
}

function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().catch((error) => {
      console.error("[Generals Helper] bootstrap failed", error);
      frameBuffer = [];
      tabMatchState.clear();
      return null;
    });
  }
  return bootstrapPromise;
}

function scheduleSave() {
  if (saveTimer) {
    return;
  }
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await saveFrameBuffer(STORAGE_KEY, frameBuffer);
    await chrome.storage.local.set({ [MATCH_STATE_KEY]: serializeTabMatchState(tabMatchState) });
  }, 400);
}

function appendFrame(rawFrame, sender) {
  const normalized = normalizeCapturedFrame(rawFrame, sender);
  const withMatchMeta = enrichWithMatchMeta(tabMatchState, normalized);
  const state = ensureTabState(tabMatchState, withMatchMeta.tabId);

  const annotatedFrame = decorateBattleFrame(withMatchMeta, state, BATTLE_DISPLAY_CONFIG);

  frameBuffer.push(annotatedFrame);
  frameBuffer = trimFrameBuffer(frameBuffer, MAX_FRAMES);
  scheduleSave();
}

function sanitizeBattleFramesForClient(frames) {
  return frames.map((frame) => {
    if (!frame || typeof frame !== "object") {
      return frame;
    }
    const { preview, ...rest } = frame;
    return rest;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ensureBootstrap();

    if (message?.type === "WS_FRAME_CAPTURED") {
      appendFrame(message.payload, sender);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "GET_LATEST_FRAMES") {
      const latestFrames = getLatestFrames(frameBuffer, message.limit, { ...message.filters, onlyInMatch: false });
      const filteredFrames = message?.filters?.onlyInMatch ? latestFrames.filter((frame) => frame?.inMatch) : latestFrames;
      const preparedFrames = prepareBattleFramesForDisplay(filteredFrames, BATTLE_DISPLAY_CONFIG);
      sendResponse({
        ok: true,
        inGame: isAnyTabInMatch(tabMatchState),
        frames: message?.filters?.onlyInMatch ? sanitizeBattleFramesForClient(preparedFrames) : preparedFrames,
        battleDebug: summarizeBattleFrames(preparedFrames)
      });
      return;
    }

    if (message?.type === "CLEAR_FRAMES") {
      frameBuffer = [];
      tabMatchState.clear();
      await saveFrameBuffer(STORAGE_KEY, frameBuffer);
      await chrome.storage.local.set({ [MATCH_STATE_KEY]: serializeTabMatchState(tabMatchState) });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type." });
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error?.message || error) });
  });

  return true;
});


ensureBootstrap().catch((error) => {
  console.error("[Generals Helper] bootstrap failed", error);
});

