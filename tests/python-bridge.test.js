// noinspection JSUnresolvedReference

import assert from "node:assert/strict";
import { buildBattleSnapshot, normalizePythonBridgeConfig } from "../src/shared/python-bridge.js";

function run() {
  const defaultConfig = normalizePythonBridgeConfig();
  assert.equal(defaultConfig.url, "https://127.0.0.1:8765");

  const config = normalizePythonBridgeConfig({ enabled: 0, autoPush: 1, timeoutMs: 1000 });
  assert.equal(config.enabled, true);
  assert.equal(config.autoPush, true);
  assert.equal(config.url, "https://127.0.0.1:8765");
  assert.equal(config.timeoutMs, 1000);

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
}

run();

