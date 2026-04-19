// noinspection JSUnresolvedReference

import assert from "node:assert/strict";
import { enrichWithMatchMeta, isAnyTabInMatch, rebuildTabMatchStateFromFrames, restoreTabMatchState } from "../src/background/match-state.js";

function makeStartFrame(capturedAt = 1000) {
  return {
    tabId: 7,
    capturedAt,
    eventName: "game_start",
    preview: '42["game_start",{"replay_id":"replay-001"}]'
  };
}

function makeActivateFrame(capturedAt = 1500) {
  return {
    tabId: 7,
    capturedAt,
    eventName: "game_activate",
    preview: '42["game_activate"]'
  };
}

function run() {
  const activeStates = new Map();
  const started = enrichWithMatchMeta(activeStates, makeStartFrame(1000));
  assert.equal(started.inMatch, true);
  assert.equal(activeStates.get(7).awaitingActivation, true);
  assert.equal(activeStates.get(7).activationDeadlineAt, 3000);
  assert.equal(isAnyTabInMatch(activeStates, 2500), true);
  assert.equal(isAnyTabInMatch(activeStates, 3001), false);
  assert.equal(activeStates.get(7).inMatch, false);
  assert.equal(activeStates.get(7).awaitingActivation, false);

  const activatedStates = new Map();
  enrichWithMatchMeta(activatedStates, makeStartFrame(1000));
  const activated = enrichWithMatchMeta(activatedStates, makeActivateFrame(1500));
  assert.equal(activated.inMatch, true);
  assert.equal(activatedStates.get(7).awaitingActivation, false);
  assert.equal(activatedStates.get(7).activationDeadlineAt, 0);
  assert.equal(isAnyTabInMatch(activatedStates, 5000), true);

  const originalNow = Date.now;
  try {
    Date.now = () => 1000;
    const restoredStates = new Map();
    restoreTabMatchState(restoredStates, [[7, { inMatch: true, currentMatchId: "match-old", lastMatchId: "match-old" }]]);
    assert.equal(restoredStates.get(7).awaitingActivation, true);
    assert.equal(restoredStates.get(7).activationDeadlineAt, 3000);
    assert.equal(isAnyTabInMatch(restoredStates, 2500), true);
    assert.equal(isAnyTabInMatch(restoredStates, 3001), false);

    const rebuiltStates = new Map();
    rebuildTabMatchStateFromFrames(rebuiltStates, [
      { tabId: 9, inMatch: true, matchId: "match-new", battleMapStateAfter: { width: 1, height: 1 } }
    ]);
    assert.equal(rebuiltStates.get(9).awaitingActivation, true);
    assert.equal(rebuiltStates.get(9).activationDeadlineAt, 3000);
  } finally {
    Date.now = originalNow;
  }

  console.log("match-state tests passed");
}

run();

