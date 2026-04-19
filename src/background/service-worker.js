import { normalizeCapturedFrame } from "../shared/frame-tools.js";
import { summarizeBattleFrames } from "../shared/battle-debug.js";
import { BATTLE_DISPLAY_CONFIG, decorateBattleFrame, prepareBattleFramesForDisplay, rehydrateBattleFramesFromBuffer } from "./battle-frame-state.js";
import { getLatestFrames, loadFrameBuffer, saveFrameBuffer, trimFrameBuffer } from "./frame-store.js";
import { ensureTabState, enrichWithMatchMeta, isAnyTabInMatch, rebuildTabMatchStateFromFrames, restoreTabMatchState, serializeTabMatchState } from "./match-state.js";
import { createPythonBridgeController } from "./python-bridge-controller.js";
import { buildBattleSnapshot } from "../shared/python-bridge.js";

const STORAGE_KEY = "capturedFrames";
const MATCH_STATE_KEY = "tabMatchState";
const MAX_FRAMES = 500;

let frameBuffer = [];
let saveTimer = null;
const tabMatchState = new Map();
let bootstrapPromise = null;
const pythonBridgeController = createPythonBridgeController(() => frameBuffer);

async function bootstrap() {
  frameBuffer = await loadFrameBuffer(STORAGE_KEY, MAX_FRAMES);
  const { [MATCH_STATE_KEY]: savedMatchState } = await chrome.storage.local.get([MATCH_STATE_KEY]);
  restoreTabMatchState(tabMatchState, savedMatchState);
  if (tabMatchState.size === 0 && frameBuffer.length > 0) {
    rebuildTabMatchStateFromFrames(tabMatchState, frameBuffer);
  }
  const migrated = rehydrateBattleFramesFromBuffer(frameBuffer, tabMatchState, BATTLE_DISPLAY_CONFIG);
  if (migrated) {
    await saveFrameBuffer(STORAGE_KEY, frameBuffer);
    await chrome.storage.local.set({ [MATCH_STATE_KEY]: serializeTabMatchState(tabMatchState) });
  }
  await pythonBridgeController.bootstrap().catch(() => null);
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
  const latestSnapshot = buildBattleSnapshot(annotatedFrame);
  if (latestSnapshot) {
    void chrome.runtime.sendMessage({
      type: "BATTLE_SNAPSHOT_UPDATED",
      frame: annotatedFrame,
      snapshot: latestSnapshot,
      latest: {
        frame: annotatedFrame,
        snapshot: latestSnapshot
      }
    }).catch(() => null);
  }
  void pythonBridgeController.onAnnotatedFrame(annotatedFrame).catch((error) => {
    pythonBridgeController.reportError(String(error?.message || error));
  });
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

export function buildLatestFramesResponse(frameBuffer, limit, filters, tabMatchState) {
  const onlyInMatch = Boolean(filters?.onlyInMatch);
  const battleConfig = filters?.battleConfig && typeof filters.battleConfig === "object" ? filters.battleConfig : BATTLE_DISPLAY_CONFIG;
  const candidateFrames = onlyInMatch ? frameBuffer.filter((frame) => frame?.inMatch) : frameBuffer;
  const latestFrames = getLatestFrames(candidateFrames, limit);
  const preparedFrames = prepareBattleFramesForDisplay(latestFrames, battleConfig);

  return {
    ok: true,
    inGame: isAnyTabInMatch(tabMatchState),
    frames: onlyInMatch ? sanitizeBattleFramesForClient(preparedFrames) : preparedFrames,
    battleDebug: summarizeBattleFrames(preparedFrames)
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ensureBootstrap();

    if (message?.type === "WS_FRAME_CAPTURED") {
      appendFrame(message.payload, sender);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "BATTLE_SNAPSHOT_UPDATED") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "GET_LATEST_FRAMES") {
      sendResponse(buildLatestFramesResponse(frameBuffer, message.limit, message.filters, tabMatchState));
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

    const pythonBridgeResponse = await pythonBridgeController.handleMessage(message);
    if (pythonBridgeResponse) {
      sendResponse(pythonBridgeResponse);
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

