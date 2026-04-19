// noinspection JSUnresolvedReference

import assert from "node:assert/strict";

async function run() {
  const storageState = {};
  const sentMessages = [];
  let messageListener = null;
  let resolveBroadcast = null;
  const broadcastSeen = new Promise((resolve) => {
    resolveBroadcast = resolve;
  });

  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const result = {};
          for (const key of keys) {
            if (key in storageState) {
              result[key] = storageState[key];
            }
          }
          return result;
        },
        async set(values) {
          Object.assign(storageState, values);
        }
      }
    },
    runtime: {
      onMessage: {}
    }
  };

  globalThis.chrome.runtime.onMessage.addListener = (listener) => {
    messageListener = listener;
  };
  globalThis.chrome.runtime.sendMessage = async (message) => {
    sentMessages.push(message);
    resolveBroadcast?.(message);
    return { ok: true };
  };

  const { buildLatestFramesResponse } = await import("../src/background/service-worker.js");

  assert.equal(typeof messageListener, "function");

  await messageListener(
    {
      type: "WS_FRAME_CAPTURED",
      payload: {
        capturedAt: 10,
        preview: "42[\"game_update\",{\"turn\":1,\"scores\":[{\"dead\":false}],\"map_diff\":[]}]"
      }
    },
    {
      tab: { id: 7 },
      frameId: 3
    },
    () => {}
  );

  await broadcastSeen;
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "BATTLE_SNAPSHOT_UPDATED");
  assert.equal(sentMessages[0].latest.frame.tabId, 7);
  assert.equal(sentMessages[0].latest.frame.frameId, 3);
  assert.equal(sentMessages[0].latest.snapshot.type, "battle_snapshot");
  assert.equal(sentMessages[0].latest.snapshot.turn, 1);

  const frameBuffer = [
    {
      eventName: "game_update",
      preview: "42[\"game_update\",{\"turn\":1}]",
      inMatch: true,
      matchId: "match-1",
      tabId: 7,
      frameId: 1
    },
    {
      eventName: "text",
      preview: "non-match",
      inMatch: false,
      tabId: 7,
      frameId: 2
    }
  ];

  const response = buildLatestFramesResponse(frameBuffer, 2, { onlyInMatch: true }, new Map());
  assert.equal(response.ok, true);
  assert.equal(response.inGame, false);
  assert.deepEqual(response.frames.map((frame) => frame.frameId), [1]);
  assert.equal(response.frames[0].preview, undefined);

  const battleResponse = buildLatestFramesResponse(frameBuffer, 2, {
    onlyInMatch: true,
    battleConfig: {
      showTurn: false,
      showPlayers: true,
      showMapDiff: false,
      showCitiesDiff: false,
      showDesertsDiff: false,
      showDebug: false
    }
  }, new Map());
  assert.equal(battleResponse.frames[0].battleSummary.includes("Turn"), false);
  assert.equal(battleResponse.frames[0].battleSummary.includes("Players"), true);

  console.log("service-worker tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});





