// noinspection JSUnresolvedReference

import assert from "node:assert/strict";
import { normalizeCapturedFrame } from "../src/shared/frame-tools.js";
import { parseBattlePacketFrame } from "../src/shared/battle-packet-parser.js";
import { getLatestFrames } from "../src/background/frame-store.js";
import { formatBattleDebugSummary, summarizeBattleFrames } from "../src/shared/battle-debug.js";
import {
  buildBattleMapState,
  parseBattleUpdate,
  formatBattleUpdate,
  parseTurn1InitialMapDiff,
  parseSkipCountMapDiff,
  applySkipCountMapDiff,
  applyBattleUpdateToBattleMapState
} from "../src/shared/battle-analyzer.js";
import {
  BATTLE_DISPLAY_CONFIG,
  decorateBattleFrame,
  prepareBattleFramesForDisplay,
  rehydrateBattleFramesFromBuffer
} from "../src/background/battle-frame-state.js";

function run() {
  const frame = normalizeCapturedFrame(
    {
      direction: "outbound",
      size: 7,
      preview: "hello"
    },
    { tab: { id: 3 }, frameId: 1 }
  );

  assert.equal(frame.direction, "outbound");
  assert.equal(frame.size, 7);
  assert.equal(frame.tabId, 3);
  assert.equal(frame.frameId, 1);
  assert.ok(frame.id.length > 5);

  const parsedEvent = parseBattlePacketFrame('42["pre_game_start"]');
  assert.equal(parsedEvent.eventName, "pre_game_start");

  const parsedBattleArray = parseBattlePacketFrame(
    '42["game_update",[3,2,10,11,12,13,14,15,1,2,3,4,5,6]]'
  );
  assert.equal(parsedBattleArray.eventName, "game_update");
  assert.deepEqual(parsedBattleArray.battleArray, [3, 2, 10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parsedBattleArray.battleGrid, {
    width: 3,
    height: 2,
    cellCount: 6,
    isComplete: true,
    troopStrengths: [10, 11, 12, 13, 14, 15],
    cellStates: [1, 2, 3, 4, 5, 6],
    cells: [
      { index: 0, x: 0, y: 0, troopStrength: 10, state: 1 },
      { index: 1, x: 1, y: 0, troopStrength: 11, state: 2 },
      { index: 2, x: 2, y: 0, troopStrength: 12, state: 3 },
      { index: 3, x: 0, y: 1, troopStrength: 13, state: 4 },
      { index: 4, x: 1, y: 1, troopStrength: 14, state: 5 },
      { index: 5, x: 2, y: 1, troopStrength: 15, state: 6 }
    ],
    trailingValues: []
  });

  const truncatedBattleArray = parseBattlePacketFrame('42["game_update",[2,2,9,8,7]]');
  assert.equal(truncatedBattleArray.battleGrid.isComplete, false);
  assert.deepEqual(truncatedBattleArray.battleGrid.troopStrengths, [9, 8, 7]);
  assert.deepEqual(truncatedBattleArray.battleGrid.cellStates, []);
  assert.deepEqual(truncatedBattleArray.battleGrid.cells, []);

  const eventFrame = normalizeCapturedFrame({
    direction: "inbound",
    type: "text",
    size: 20,
    preview: '42["pre_game_start"]'
  });

  assert.equal(eventFrame.category, "event");
  assert.equal(eventFrame.eventName, "pre_game_start");

  const plainTextFrame = normalizeCapturedFrame({ type: "text", preview: "ping" });
  assert.equal(plainTextFrame.category, "text");

  const battleUpdate = parseBattleUpdate([
    "game_update",
    {
      turn: 10,
      scores: Array.from({ length: 16 }, () => ({ dead: false })),
      attackIndex: 3,
      map_diff: [2, 1, 99, 11],
      cities_diff: [0],
      deserts_diff: [0]
    }
  ]);
  assert.equal(battleUpdate.turn, 10);
  assert.equal(battleUpdate.playerCount, 16);
  assert.equal(battleUpdate.aliveCount, 16);
  assert.deepEqual(battleUpdate.mapDiff, [2, 1, 99, 11]);
  assert.deepEqual(battleUpdate.mapDiffPatch, {
    kind: "skipCountDiff",
    changes: [{ index: 2, values: [99] }],
    endIndex: 3,
    tailRemaining: 11
  });

  const baseMap = [3, 2, 10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6];
  assert.deepEqual(applySkipCountMapDiff(baseMap, [2, 1, 99, 11]), [
    3, 2, 99, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6
  ]);
  assert.deepEqual(parseSkipCountMapDiff([86, 1, 12, 2499]), {
    kind: "skipCountDiff",
    changes: [{ index: 86, values: [12] }],
    endIndex: 87,
    tailRemaining: 2499
  });

  assert.deepEqual(buildBattleMapState(baseMap), {
    width: 3,
    height: 2,
    cellCount: 6,
    expectedLength: 14,
    isComplete: true,
    values: baseMap,
    armyValues: [10, 11, 12, 13, 14, 15],
    stateValues: [1, 2, 3, 4, 5, 6],
    armyTable: [
      [10, 11, 12],
      [13, 14, 15]
    ],
    stateTable: [
      [1, 2, 3],
      [4, 5, 6]
    ],
    trailingValues: []
  });

  const fakePanelState = {
    visible: true,
    mode: "battle",
    autoRefreshEnabled: true,
    battleConfig: {
      showTurn: true,
      showPlayers: false,
      showMapDiff: true,
      showCitiesDiff: false,
      showDesertsDiff: false,
      showDebug: true
    }
  };
  assert.equal(fakePanelState.battleConfig.showDebug, true);

  const latestFrames = getLatestFrames([
    {
      capturedAt: 1,
      direction: "inbound",
      category: "event",
      eventName: "game_update",
      preview: '42["game_update",[2,1,99,11]]',
      battleSummary: "Turn2 | MapDiff[1(1,1)P3]",
      inMatch: true
    }
  ], 30, { onlyInMatch: true });
  assert.equal(latestFrames[0].preview, undefined);
  assert.equal(latestFrames[0].battleSummary, "Turn2 | MapDiff[1(1,1)P3]");

  const battleDebug = summarizeBattleFrames([
    {
      eventName: "game_start",
      turn: 1,
      battleMapStateBefore: null,
      battleMapStateAfter: null,
      battleSummary: "Turn1 | MapDiff[1(1,1)P10]"
    },
    {
      eventName: "game_update",
      turn: 2,
      battleMapStateBefore: null,
      battleMapStateAfter: null,
      battleSummary: "Turn2 | MapDiff[未计算]"
    }
  ]);
  assert.equal(battleDebug.totalFrames, 2);
  assert.equal(battleDebug.battleFrames, 2);
  assert.equal(battleDebug.framesWithSummary, 2);
  assert.equal(battleDebug.unresolvedFrames, 1);
  assert.match(formatBattleDebugSummary(battleDebug), /DBG total=2 battle=2 summary=2 before=0 after=0 patch=0 tail=0 unresolved=1/);
  assert.match(formatBattleDebugSummary(battleDebug), /DBG game_update turn=2 before=0 after=0 patch=0 .*summary=1 .*MapDiff\[未计算]/);

  const formattedBattleUpdate = formatBattleUpdate(battleUpdate, {
    showTurn: true,
    showPlayers: true,
    showMapDiff: true
  }, buildBattleMapState(baseMap));
  assert.match(formattedBattleUpdate, /Turn10/);
  assert.match(formattedBattleUpdate, /Players16\/16/);
  assert.match(formattedBattleUpdate, /MapDiff\[/);
  assert.match(formattedBattleUpdate, /MapDiff\[1\(1,1\)P99]/);

  const fallbackBattleUpdate = formatBattleUpdate(battleUpdate, {
    showTurn: true,
    showPlayers: true,
    showMapDiff: true
  });
  assert.match(fallbackBattleUpdate, /MapDiff\[未计算]/);
  assert.doesNotMatch(fallbackBattleUpdate, /2,1,99,11/);

  const turn1Values = [3, 2, 10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6];
  const turn1Initial = parseTurn1InitialMapDiff([0, 14, ...turn1Values], 1);
  assert.deepEqual(turn1Initial, {
    kind: "turn1Initial",
    length: 14,
    values: turn1Values,
    width: 3,
    height: 2,
    cellCount: 6,
    expectedLength: 14,
    isComplete: true,
    troopStrengths: [10, 11, 12, 13, 14, 15],
    cellStates: [1, 2, 3, 4, 5, 6],
    armyTable: [
      [10, 11, 12],
      [13, 14, 15]
    ],
    stateTable: [
      [1, 2, 3],
      [4, 5, 6]
    ],
    trailingValues: []
  });

  const turn1Update = parseBattleUpdate([
    "game_update",
    {
      turn: 1,
      scores: Array.from({ length: 16 }, () => ({ dead: false })),
      attackIndex: 4,
      map_diff: [0, 14, ...turn1Values],
      cities_diff: [],
      deserts_diff: []
    }
  ]);
  assert.deepEqual(turn1Update.mapDiffInitial, turn1Initial);
  assert.equal(turn1Update.mapDiffPatch, null);

  const appliedTurn1State = applyBattleUpdateToBattleMapState(null, turn1Update);
  assert.deepEqual(appliedTurn1State, buildBattleMapState(turn1Values));

  const resetState = { battleMapState: appliedTurn1State };
  const decoratedStart = decorateBattleFrame({ eventName: "game_start", tabId: 8 }, resetState, BATTLE_DISPLAY_CONFIG);
  assert.deepEqual(decoratedStart.battleMapStateBefore, null);
  assert.deepEqual(decoratedStart.battleMapStateAfter, null);
  assert.equal(decoratedStart.battleSummary, "");

  const battleState = { battleMapState: appliedTurn1State };
  const decoratedUpdate = decorateBattleFrame({
    eventName: "game_update",
    tabId: 8,
    preview: '42["game_update",{"turn":2,"scores":[{"dead":false}],"attackIndex":5,"map_diff":[2,1,99,11],"cities_diff":[],"deserts_diff":[]}]'
  }, battleState, BATTLE_DISPLAY_CONFIG);
  assert.equal(decoratedUpdate.battleMapDiffLength, 4);
  assert.match(decoratedUpdate.battleSummary, /Turn2/);
  assert.equal(battleState.battleMapState?.width, 3);

  const preparedFrames = prepareBattleFramesForDisplay([
    {
      eventName: "game_update",
      tabId: 9,
      preview: '42["game_update",{"turn":2,"scores":[{"dead":false}],"attackIndex":5,"map_diff":[2,1,99,11],"cities_diff":[],"deserts_diff":[]}]'
    },
    {
      eventName: "game_start",
      tabId: 9,
      preview: '42["pre_game_start"]'
    }
  ], BATTLE_DISPLAY_CONFIG);
  assert.equal(preparedFrames.length, 2);
  assert.match(preparedFrames[0].battleSummary, /Turn2/);
  assert.equal(preparedFrames[1].battleSummary, "");

  const rehydrateFrames = [
    {
      eventName: "game_start",
      tabId: 10,
      preview: '42["pre_game_start"]'
    },
    {
      eventName: "game_update",
      tabId: 10,
      preview: '42["game_update",{"turn":2,"scores":[{"dead":false}],"attackIndex":5,"map_diff":[2,1,99,11],"cities_diff":[],"deserts_diff":[]}]'
    }
  ];
  const rehydrateMutated = rehydrateBattleFramesFromBuffer(rehydrateFrames, new Map(), BATTLE_DISPLAY_CONFIG);
  assert.equal(rehydrateMutated, true);
  assert.match(rehydrateFrames[1].battleSummary, /Turn2/);

  const nextUpdate = parseBattleUpdate([
    "game_update",
    {
      turn: 2,
      scores: Array.from({ length: 16 }, () => ({ dead: false })),
      attackIndex: 5,
      map_diff: [2, 1, 99, 11],
      cities_diff: [],
      deserts_diff: []
    }
  ]);
  assert.deepEqual(nextUpdate.mapDiffPatch, {
    kind: "skipCountDiff",
    changes: [{ index: 2, values: [99] }],
    endIndex: 3,
    tailRemaining: 11
  });

  const appliedNextState = applyBattleUpdateToBattleMapState(appliedTurn1State, nextUpdate);
  assert.deepEqual(appliedNextState, {
    width: 3,
    height: 2,
    cellCount: 6,
    expectedLength: 14,
    isComplete: true,
    values: [3, 2, 99, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6],
    armyValues: [99, 11, 12, 13, 14, 15],
    stateValues: [1, 2, 3, 4, 5, 6],
    armyTable: [
      [99, 11, 12],
      [13, 14, 15]
    ],
    stateTable: [
      [1, 2, 3],
      [4, 5, 6]
    ],
    trailingValues: []
  });

  console.log("frame-tools tests passed");
}

run();

