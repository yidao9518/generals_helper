// noinspection JSUnresolvedReference

import assert from "node:assert/strict";
import { buildBattleMapState } from "../src/shared/battle-map-state.js";

async function run() {
  const storageState = {
    pythonBridge: {
      enabled: true,
      autoPush: true,
      url: "https://127.0.0.1:8765/",
      timeoutMs: 200
    }
  };
  const requests = [];
  const sentMessages = [];

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
    }
  };
  globalThis.chrome.runtime = {};
  globalThis.chrome.runtime.sendMessage = async (message) => {
    sentMessages.push(message);
    return { ok: true };
  };

  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.endsWith("/healthz")) {
      return new Response(JSON.stringify({ ok: true, service: "generals-helper-python-bridge", version: "v1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.endsWith("/v1/ingest")) {
      return new Response(JSON.stringify({ ok: true, analysis: { summaryText: "game=match-1 | turn=2" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: false, error: "unexpected" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  };

  const { createPythonBridgeController } = await import("../src/background/python-bridge-controller.js");
  const frameBuffer = [
    {
      capturedAt: 1713187200000,
      eventName: "game_update",
      preview: '42["game_update",{"turn":2,"scores":[{"total":11,"dead":false},{"total":7,"dead":true}],"map_diff":[2,1,99,11],"cities_diff":[],"deserts_diff":[]}]',
      inMatch: true,
      matchId: "match-1",
      tabId: 8,
      frameId: 3,
      direction: "inbound",
      size: 128,
      url: "https://generals.io/",
      category: "event",
      battleSummary: "Turn2 | Players2/2",
      battleMapStateAfter: buildBattleMapState([3, 2, 10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6])
    }
  ];

  const controller = createPythonBridgeController(() => frameBuffer);
  await controller.bootstrap();

  const statusResult = await controller.handleMessage({ type: "GET_PYTHON_BRIDGE_STATUS" });
  assert.equal(statusResult.ok, true);
  assert.equal(statusResult.config.url, "https://127.0.0.1:8765");
  assert.equal(statusResult.status.enabled, true);
  assert.equal(statusResult.status.autoPush, true);

  const latestSnapshotResult = await controller.handleMessage({ type: "GET_LATEST_BATTLE_SNAPSHOT" });
  assert.equal(latestSnapshotResult.ok, true);
  assert.equal(latestSnapshotResult.latest.snapshot.turn, 2);
  assert.equal(latestSnapshotResult.latest.snapshot.board.armyTable[0][0], 10);

  const testResult = await controller.handleMessage({ type: "TEST_PYTHON_BRIDGE" });
  assert.equal(testResult.ok, true);
  assert.equal(testResult.httpStatus, 200);
  assert.equal(requests[0].url, "https://127.0.0.1:8765/healthz");

  const pushResult = await controller.handleMessage({ type: "PUSH_LATEST_BATTLE_SNAPSHOT" });
  assert.equal(pushResult.ok, true);
  assert.equal(pushResult.result.analysis.summaryText, "game=match-1 | turn=2");
  assert.equal(requests[1].url, "https://127.0.0.1:8765/v1/ingest");
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PYTHON_BRIDGE_PUSH_SUCCEEDED");
  assert.equal(sentMessages[0].reason, "manual");

  controller.reportError("boom");
  const afterError = await controller.handleMessage({ type: "GET_PYTHON_BRIDGE_STATUS" });
  assert.equal(afterError.status.lastError, "boom");
}

async function runLatestWinsTest() {
  const storageState = {
    pythonBridge: {
      enabled: true,
      autoPush: true,
      url: "https://127.0.0.1:8765/",
      timeoutMs: 200
    }
  };
  const requests = [];
  const deferredBodies = [];
  let resolveFirstRequest;
  let firstRequestSeen = false;

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
    }
  };

  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, init });
    if (!firstRequestSeen) {
      firstRequestSeen = true;
      await new Promise((resolve) => {
        resolveFirstRequest = resolve;
      });
    }
    const summaryText = `pushed-${requests.length}`;
    deferredBodies.push(summaryText);
    return new Response(JSON.stringify({ ok: true, analysis: { summaryText } }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  };

  const { createPythonBridgeController } = await import("../src/background/python-bridge-controller.js");
  const frameBuffer = [];
  const controller = createPythonBridgeController(() => frameBuffer);
  await controller.bootstrap();

  async function waitForRequestsAtLeast(expected, maxTurns = 20) {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      if (requests.length >= expected) {
        return;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  function createFrame(turn, summary) {
    return {
      capturedAt: 1713187200000 + turn,
      eventName: "game_update",
      preview: `42["game_update",{"turn":${turn},"scores":[{"total":${turn},"dead":false}],"map_diff":[2,1,99,11],"cities_diff":[],"deserts_diff":[]}]`,
      inMatch: true,
      matchId: "match-throttle",
      tabId: 8,
      frameId: turn,
      direction: "inbound",
      size: 128,
      url: "https://generals.io/",
      category: "event",
      battleSummary: summary,
      battleMapStateAfter: {
        width: 3,
        height: 2,
        isComplete: true,
        armyTable: [
          [10, 11, 12],
          [13, 14, 15]
        ],
        stateTable: [
          [1, 2, 3],
          [4, 5, 6]
        ],
        trailingValues: []
      }
    };
  }

  frameBuffer.push(createFrame(1, "Turn1"));
  const firstPush = controller.onAnnotatedFrame(frameBuffer[0]);
  await waitForRequestsAtLeast(1);
  assert.equal(requests.length, 1);

  frameBuffer.push(createFrame(2, "Turn2"));
  const secondPush = controller.onAnnotatedFrame(frameBuffer[1]);
  await waitForRequestsAtLeast(1);
  assert.equal(requests.length, 1);

  frameBuffer.push(createFrame(3, "Turn3"));
  const thirdPush = controller.onAnnotatedFrame(frameBuffer[2]);
  await waitForRequestsAtLeast(1);
  assert.equal(requests.length, 1);

  resolveFirstRequest();
  await firstPush;
  await secondPush;
  await thirdPush;
  await waitForRequestsAtLeast(2);

  assert.equal(requests.length, 2);
  const postedSnapshot = JSON.parse(requests[1].init.body);
  assert.equal(postedSnapshot.type, "battle_snapshot");
  assert.equal(postedSnapshot.snapshot.turn, 3);
  assert.equal(postedSnapshot.snapshot.frame.battleSummary, "Turn3");
  assert.equal(deferredBodies[0], "pushed-1");
}

await run();
await runLatestWinsTest();





