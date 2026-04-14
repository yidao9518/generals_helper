// noinspection JSUnusedGlobalSymbols
import { applyBattleUpdateToBattleMapState, formatBattleUpdate, parseBattleUpdate } from "../shared/battle-analyzer.js";
import { BATTLE_DISPLAY_CONFIG } from "../shared/helper-config.js";
import { ensureTabState } from "./match-state.js";

export { BATTLE_DISPLAY_CONFIG };

function parseBattleUpdateFromFrame(frame) {
  if (frame?.eventName !== "game_update" || typeof frame.preview !== "string" || !frame.preview.startsWith("42")) {
    return null;
  }

  try {
    const payload = JSON.parse(frame.preview.slice(2));
    return parseBattleUpdate(payload);
  } catch {
    return null;
  }
}

function buildBattleFrameFields(frame, battleUpdate, battleMapStateBefore, battleMapStateAfter, displayConfig) {
  return {
    ...frame,
    battleMapStateBefore,
    battleMapStateAfter,
    battleSummary: formatBattleUpdate(battleUpdate, displayConfig, battleMapStateBefore || battleMapStateAfter || null),
    battleMapDiffLength: Array.isArray(battleUpdate.mapDiff) ? battleUpdate.mapDiff.length : 0,
    battleMapDiffPatchOk: Boolean(battleUpdate.mapDiffPatch),
    battleMapDiffTailRemaining: Number.isInteger(battleUpdate.mapDiffPatch?.tailRemaining) ? battleUpdate.mapDiffPatch.tailRemaining : null,
    battleMapDiffHead: Array.isArray(battleUpdate.mapDiff) ? battleUpdate.mapDiff.slice(0, 8) : []
  };
}

function applyBattleFrame(frame, state, displayConfig, { mutateFrame = false } = {}) {
  const targetFrame = mutateFrame ? frame : { ...frame };
  const eventName = targetFrame.eventName || "";

  if (eventName === "game_start") {
    state.battleMapState = null;
    targetFrame.battleMapStateBefore = null;
    targetFrame.battleMapStateAfter = null;
    targetFrame.battleSummary = "";
    return { frame: targetFrame, battleUpdate: null, changed: true };
  }

  const battleUpdate = parseBattleUpdateFromFrame(targetFrame);
  if (battleUpdate) {
    const battleMapStateBefore = state.battleMapState || targetFrame.battleMapStateBefore || null;
    const battleMapStateAfter = applyBattleUpdateToBattleMapState(battleMapStateBefore, battleUpdate) || battleMapStateBefore;
    const annotatedFrame = buildBattleFrameFields(targetFrame, battleUpdate, battleMapStateBefore, battleMapStateAfter, displayConfig);
    if (mutateFrame) {
      Object.assign(targetFrame, annotatedFrame);
    }
    state.battleMapState = battleMapStateAfter;
    return { frame: annotatedFrame, battleUpdate, changed: true };
  }

  if (targetFrame?.battleMapStateAfter && typeof targetFrame.battleMapStateAfter === "object") {
    state.battleMapState = targetFrame.battleMapStateAfter;
  }

  return { frame: targetFrame, battleUpdate: null, changed: false };
}

export function decorateBattleFrame(frame, state, displayConfig = BATTLE_DISPLAY_CONFIG) {
  return applyBattleFrame(frame, state, displayConfig, { mutateFrame: false }).frame;
}

export function prepareBattleFramesForDisplay(frames, displayConfig = BATTLE_DISPLAY_CONFIG) {
  const prepared = [];
  const tabStates = new Map();

  for (const frame of [...(Array.isArray(frames) ? frames : [])].reverse()) {
    if (!Number.isInteger(frame?.tabId)) {
      prepared.push(frame);
      continue;
    }

    const state = ensureTabState(tabStates, frame.tabId);
    const { frame: preparedFrame } = applyBattleFrame(frame, state, displayConfig, { mutateFrame: false });
    prepared.push(preparedFrame);
  }

  return prepared.reverse();
}

export function rehydrateBattleFramesFromBuffer(frames, tabStates, displayConfig = BATTLE_DISPLAY_CONFIG) {
  let mutated = false;

  for (const frame of frames) {
    if (!Number.isInteger(frame?.tabId)) {
      continue;
    }

    const state = ensureTabState(tabStates, frame.tabId);
    const { changed } = applyBattleFrame(frame, state, displayConfig, { mutateFrame: true });
    mutated = mutated || changed;
  }

  return mutated;
}



