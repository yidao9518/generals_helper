// noinspection JSUnresolvedReference

import assert from "node:assert/strict";
import { buildBattleSnapshot, fetchPythonBridgeLatestRecord, normalizePythonBridgeConfig, postBattleSnapshotToPython } from "../src/shared/python-bridge.js";

async function run() {
  const defaultConfig = normalizePythonBridgeConfig();
  assert.equal(defaultConfig.url, "https://127.0.0.1:8765");

  const config = normalizePythonBridgeConfig({ enabled: 0, autoPush: 1, timeoutMs: 1000 });
  assert.equal(config.enabled, true);
  assert.equal(config.autoPush, true);
  assert.equal(config.simpleMode, false);
  assert.equal(config.url, "https://127.0.0.1:8765");
  assert.equal(config.timeoutMs, 1000);

  const simpleModeConfig = normalizePythonBridgeConfig({ simpleMode: true });
  assert.equal(simpleModeConfig.simpleMode, true);

  const snapshot = buildBattleSnapshot({
    capturedAt: 1713187200000,
    eventName: "game_update",
    matchId: "match-abc",
    inMatch: true,
    tabId: 7,
    frameId: 3,
    direction: "inbound",
    size: 128,
    url: "https://generals.io/",
    category: "event",
    battleSummary: "Turn2 | Players16/16",
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
    },
    preview: '42["game_update",{"turn":2,"scores":[{"score":11,"dead":false},{"score":7,"dead":true}],"attackIndex":5,"map_diff":[2,1,99,11],"cities_diff":[],"deserts_diff":[]}]'
  });

  assert.ok(snapshot);
  assert.equal(snapshot.type, "battle_snapshot");
  assert.equal(snapshot.gameId, "match-abc");
  assert.equal(snapshot.turn, 2);
  assert.equal(snapshot.playerCount, 2);
  assert.equal(snapshot.players[0].score, 11);
  assert.equal(snapshot.players[0].alive, true);
  assert.equal(snapshot.players[1].alive, false);
  assert.equal(snapshot.board.width, 3);
  assert.equal(snapshot.board.height, 2);
  assert.equal(snapshot.board.cells[0][0].army, 10);
  assert.equal(snapshot.board.cells[1][2].state, 6);
  assert.equal(snapshot.battle.mapDiff.length, 4);
  assert.match(snapshot.frame.battleSummary, /Turn2/);

  const snapshotWithMeta = buildBattleSnapshot({
    capturedAt: 1713187200001,
    eventName: "game_update",
    matchId: "match-abc",
    inMatch: true,
    tabId: 7,
    frameId: 4,
    direction: "inbound",
    size: 128,
    url: "https://generals.io/",
    category: "event",
    battleSummary: "Turn3 | Players16/16",
    playerMeta: {
      playerIndex: 1,
      players: [
        { i: 0, color: 0, name: "WindHT" },
        { i: 1, color: 1, name: "yidao" }
      ]
    },
    battleMapStateAfter: {
      width: 1,
      height: 1,
      isComplete: true,
      armyTable: [[9]],
      stateTable: [[2]],
      trailingValues: []
    },
    preview: '42["game_update",{"turn":3,"scores":[{"total":2,"tiles":1,"i":0,"color":0,"dead":false},{"total":2,"tiles":1,"i":1,"color":1,"dead":false}],"attackIndex":0,"map_diff":[1800],"cities_diff":[0],"deserts_diff":[0]}]'
  });

  assert.equal(snapshotWithMeta.players[0].name, "WindHT");
  assert.equal(snapshotWithMeta.players[1].name, "yidao");
  assert.equal(snapshotWithMeta.players[0].color, 0);
  assert.equal(snapshotWithMeta.players[1].color, 1);
  assert.equal(snapshotWithMeta.players[1].isSelf, true);

  const snapshotWithConflicts = buildBattleSnapshot({
    capturedAt: 1713187200002,
    eventName: "game_update",
    matchId: "match-abc",
    inMatch: true,
    tabId: 7,
    frameId: 5,
    direction: "inbound",
    size: 128,
    url: "https://generals.io/",
    category: "event",
    battleSummary: "Turn4 | Players16/16",
    playerMeta: {
      playerIndex: 1,
      players: [
        { i: 0, color: 0, name: "WindHT" },
        { i: 1, color: 1, name: "yidao" }
      ]
    },
    battleMapStateAfter: {
      width: 1,
      height: 1,
      isComplete: true,
      armyTable: [[9]],
      stateTable: [[2]],
      trailingValues: []
    },
    preview: '42["game_update",{"turn":4,"scores":[{"total":2,"tiles":1,"i":9,"color":9,"name":"wrong","score":123,"dead":false}],"attackIndex":0,"map_diff":[1800],"cities_diff":[0],"deserts_diff":[0]}]'
  });

  assert.equal(snapshotWithConflicts.players[0].i, 0);
  assert.equal(snapshotWithConflicts.players[0].color, 0);
  assert.equal(snapshotWithConflicts.players[0].name, "WindHT");
  assert.equal(snapshotWithConflicts.players[0].score, 123);
  assert.equal(snapshotWithConflicts.players[0].dead, false);

  const snapshotWithOutOfOrderScores = buildBattleSnapshot({
    capturedAt: 1713187200003,
    eventName: "game_update",
    matchId: "match-abc",
    inMatch: true,
    tabId: 7,
    frameId: 6,
    direction: "inbound",
    size: 128,
    url: "https://generals.io/",
    category: "event",
    battleSummary: "Turn5 | Players16/16",
    playerMeta: {
      playerIndex: 1,
      players: [
        { i: 0, color: 0, name: "WindHT" },
        { i: 1, color: 1, name: "yidao" },
        { i: 2, color: 2, name: "wlzc1024" }
      ]
    },
    battleMapStateAfter: {
      width: 1,
      height: 1,
      isComplete: true,
      armyTable: [[9]],
      stateTable: [[2]],
      trailingValues: []
    },
    preview: '42["game_update",{"turn":5,"scores":[{"i":2,"color":2,"score":30,"dead":false},{"i":0,"color":0,"score":18,"dead":false},{"i":1,"color":1,"score":22,"dead":false}],"attackIndex":0,"map_diff":[1800],"cities_diff":[0],"deserts_diff":[0]}]'
  });

  assert.equal(snapshotWithOutOfOrderScores.players[0].i, 2);
  assert.equal(snapshotWithOutOfOrderScores.players[0].name, "wlzc1024");
  assert.equal(snapshotWithOutOfOrderScores.players[1].i, 0);
  assert.equal(snapshotWithOutOfOrderScores.players[1].name, "WindHT");
  assert.equal(snapshotWithOutOfOrderScores.players[2].i, 1);
  assert.equal(snapshotWithOutOfOrderScores.players[2].name, "yidao");

  const originalFetch = globalThis.fetch;
  try {
    let requestedUrl = "";
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ ok: true, record: { snapshot: { turn: 8 }, analysis: { summaryText: "turn=8" } } });
        }
      };
    };

    const response = await fetchPythonBridgeLatestRecord({ url: "https://127.0.0.1:8765", timeoutMs: 1234 });
    assert.equal(requestedUrl, "https://127.0.0.1:8765/v1/latest");
    assert.equal(response.ok, true);
    assert.equal(response.body.record.snapshot.turn, 8);
    assert.equal(response.body.record.analysis.summaryText, "turn=8");

    let postedBody = null;
    globalThis.fetch = async (_url, init) => {
      postedBody = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 201,
        async text() {
          return JSON.stringify({ ok: true, record: { id: 1 }, analysis: { summaryText: "ok" }, historySize: 1 });
        }
      };
    };

    const ingestResponse = await postBattleSnapshotToPython({ url: "https://127.0.0.1:8765", timeoutMs: 1234 }, { turn: 9, frame: { battleSummary: "turn=9" } });
    assert.equal(ingestResponse.ok, true);
    assert.equal(postedBody.type, "battle_snapshot");
    assert.equal(postedBody.source, "extension");
    assert.equal(postedBody.snapshot.turn, 9);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await run();

