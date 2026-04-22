// noinspection JSUnresolvedReference,JSUnusedLocalSymbols,JSUnusedGlobalSymbols,JSValidateTypes

import assert from "node:assert/strict";

class FakeClassList {
  constructor() {
    this._set = new Set();
  }

  add(...tokens) {
    for (const token of tokens) {
      this._set.add(token);
    }
  }

  remove(...tokens) {
    for (const token of tokens) {
      this._set.delete(token);
    }
  }

  toggle(token, force) {
    if (force === true) {
      this._set.add(token);
      return true;
    }
    if (force === false) {
      this._set.delete(token);
      return false;
    }
    if (this._set.has(token)) {
      this._set.delete(token);
      return false;
    }
    this._set.add(token);
    return true;
  }

  contains(token) {
    return this._set.has(token);
  }

  toString() {
    return Array.from(this._set).join(" ");
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
      removeProperty(name) {
        delete this[name];
      }
    };
    this.dataset = {};
    this.title = "";
    this.classList = new FakeClassList();
    this._listeners = new Map();
  }

  appendChild(child = null) {
    if (child && child.tagName === "FRAGMENT" && Array.isArray(child.children)) {
      this.children.push(...child.children);
      return child;
    }
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    for (const child of children) {
      if (child && child.tagName === "FRAGMENT" && Array.isArray(child.children)) {
        this.children.push(...child.children);
      } else {
        this.children.push(child);
      }
    }
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    const listeners = this._listeners.get(event?.type || "") || [];
    for (const listener of listeners) {
      listener(event);
    }
    return true;
  }

  contains() {
    return true;
  }
}

class FakeInputElement extends FakeElement {}
class FakeButtonElement extends FakeElement {}

async function run() {
  const elements = new Map();
  let runtimeMessageListener = null;
  let copiedText = null;
  const storageState = {
    pythonBridge: {
      enabled: true,
      autoPush: true,
      simpleMode: true,
      url: "https://127.0.0.1:8765",
      timeoutMs: 2500
    }
  };
  const elementById = (id) => {
    if (!elements.has(id)) {
      let element = new FakeElement("div");
      if (["boardSizeRange", "pythonBridgeEnabled", "pythonBridgeUrl"].includes(id)) {
        element = new FakeInputElement("input");
      } else if (["refreshBtn", "openSettingsBtn", "testPythonBridge", "pushLatestSnapshot", "openDisplayPage", "showDebug"].includes(id)) {
        element = new FakeButtonElement("button");
      }
      element.id = id;
      elements.set(id, element);
    }
    return elements.get(id);
  };

  const boardGrid = elementById("boardGrid");
  const boardShell = elementById("boardShell");
  const boardMeta = elementById("boardMeta");
  const playerList = elementById("playerList");
  const status = elementById("status");
  const refreshBtn = elementById("refreshBtn");
  void boardShell;
  void playerList;
  void status;
  void refreshBtn;

  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLButtonElement = FakeButtonElement;
  globalThis.Node = FakeElement;
  globalThis.window = {
    addEventListener() {},
    requestAnimationFrame(callback) {
      callback();
      return 1;
    }
  };
  globalThis.document = {
    getElementById: elementById,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    createDocumentFragment() {
      return new FakeElement("fragment");
    },
    addEventListener() {},
    visibilityState: "visible"
  };
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  }
  globalThis.navigator.clipboard = {
    async writeText(text) {
      copiedText = text;
    }
  };
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeMessageListener = listener;
        }
      },
      sendMessage: async (message) => {
        if (typeof runtimeMessageListener === "function") {
          runtimeMessageListener(message, {}, () => null);
        }
        return null;
      },
      getURL(path) {
        return path;
      },
      openOptionsPage: async () => {}
    },
    tabs: {
      create: async () => {}
    },
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
        async set(entries) {
          for (const [key, value] of Object.entries(entries || {})) {
            storageState[key] = value;
          }
        }
      }
    }
  };

  const sanityElement = new FakeElement("span");
  sanityElement.classList.add("x");
  sanityElement.classList.remove("x");
  sanityElement.classList.toggle("y");
  sanityElement.classList.contains("y");
  sanityElement.appendChild(new FakeElement("em"));
  sanityElement.replaceChildren();
  sanityElement.contains(new FakeElement("em"));
  assert.equal(sanityElement.tagName, "SPAN");
  sanityElement.dataset.foo = "bar";
  assert.equal(sanityElement.dataset.foo, "bar");
  sanityElement.textContent = "hello";
  assert.equal(sanityElement.textContent, "hello");
  sanityElement.title = "world";
  assert.equal(sanityElement.title, "world");
  sanityElement.style.setProperty("color", "red");
  assert.equal(sanityElement.style.color, "red");
  sanityElement.style.removeProperty("color");
  assert.equal(sanityElement.style.color, undefined);
  assert.ok(sanityElement.classList.toString().includes("y"));

  const sanityButton = document.createElement("button");
  const sanityFragment = document.createDocumentFragment();
  assert.ok(sanityButton instanceof FakeElement);
  assert.ok(sanityFragment instanceof FakeElement);
  window.requestAnimationFrame(() => {});
  chrome.runtime.getURL("src/display/display.html");
  await chrome.runtime.openOptionsPage();

  function buildBattleRelations({ inWar, warPlayerCount, adjacencyAssumed, currentStrength, previousStrength, currentTiles, previousTiles }) {
    const commonPlayerState = (key, name, color, adjacentKey, adjacentName, adjacentColor) => ({
      key,
      name,
      color,
      inWar,
      warReasons: inWar ? ["strength_not_increased"] : [],
      currentStrength,
      previousStrength,
      currentTiles,
      previousTiles,
      associatedPlayers: adjacentKey === null ? [] : [{ key: adjacentKey, name: adjacentName, color: adjacentColor }],
      adjacentPlayerKeys: adjacencyAssumed ? [adjacentKey] : [],
      adjacentPlayerNames: adjacencyAssumed ? [adjacentName] : [],
      adjacentPlayerColors: adjacencyAssumed ? [adjacentColor] : [],
      relationText: adjacentName ? `关联：${adjacentName}` : "关联：暂无"
    });

    return {
      comparisonAvailable: true,
      warPlayerCount,
      inWarPlayerKeys: inWar ? [0, 1] : [],
      adjacencyAssumed,
      playerStates: [
        commonPlayerState(0, "WindHT", 0, 1, "yidao", 1),
        commonPlayerState(1, "yidao", 1, 0, "WindHT", 0)
      ],
      notes: [],
      debug: {
        fieldRules: { strength: "total", tiles: "tiles", warWhen: "strength or tiles decreased" },
        currentTurn: 8,
        previousTurn: 7,
        currentPlayerKeys: [0, 1],
        previousPlayerKeys: [0, 1],
        players: [
          { key: 0, name: "WindHT", matchedPrevious: true, currentStrength, previousStrength, strengthDelta: currentStrength - previousStrength, currentTiles, previousTiles, tilesDelta: currentTiles - previousTiles, warReasons: inWar ? ["strength_not_increased"] : [], inWar },
          { key: 1, name: "yidao", matchedPrevious: true, currentStrength, previousStrength, strengthDelta: currentStrength - previousStrength, currentTiles, previousTiles, tilesDelta: currentTiles - previousTiles, warReasons: inWar ? ["strength_not_increased"] : [], inWar }
        ]
      }
    };
  }

  function buildLatestRecord({ id, turn, battleSummary, battleRelations, boardState }) {
    return {
      ok: true,
      record: {
        id,
        snapshot: {
          turn,
          matchId: "match-1",
          playerCount: 2,
          aliveCount: 2,
          players: [
            { i: 0, color: 0, name: "WindHT", alive: true, dead: false, total: 3, tiles: 1, has_kill: false, raw: { total: 3, tiles: 1, has_kill: false } },
            { i: 1, color: 1, name: "yidao", alive: false, dead: true, total: 3, tiles: 1, has_kill: true, raw: { total: 3, tiles: 1, has_kill: true } }
          ],
          board: boardState,
          frame: { battleSummary }
        },
        analysis: {
          summaryText: `game=match-1 | turn=${turn}`,
          battleRelations
        }
      }
    };
  }

  let fetchCallCount = 0;
  globalThis.fetch = async (url) => {
    fetchCallCount += 1;
    if (String(url).endsWith("/v1/latest")) {
      if (fetchCallCount === 1) {
        return new Response(JSON.stringify(buildLatestRecord({
          id: 1,
          turn: 8,
          battleSummary: "Turn8 | Players2/2",
          boardState: {
            width: 2,
            height: 2,
            armyTable: [[3, 0], [5, 6]],
            stateTable: [[0, 1], [-2, 0]],
            cells: [],
            trailingValues: []
          },
          battleRelations: buildBattleRelations({
            inWar: true,
            warPlayerCount: 2,
            adjacencyAssumed: true,
            currentStrength: 3,
            previousStrength: 3,
            currentTiles: 1,
            previousTiles: 1
          })
        })), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 2) {
        return new Response(JSON.stringify(buildLatestRecord({
          id: 2,
          turn: 9,
          battleSummary: "Turn9 | Players2/2",
          boardState: {
            width: 2,
            height: 2,
            armyTable: [[3, 0], [5, 6]],
            stateTable: [[0, 1], [-2, 0]],
            cells: [],
            trailingValues: []
          },
          battleRelations: buildBattleRelations({
            inWar: true,
            warPlayerCount: 2,
            adjacencyAssumed: true,
            currentStrength: 3,
            previousStrength: 3,
            currentTiles: 1,
            previousTiles: 1
          })
        })), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 3) {
        return new Response(JSON.stringify({
          ok: true,
          record: {
            id: 3,
            snapshot: {
              turn: 10,
              matchId: "match-1",
              playerCount: 2,
              aliveCount: 2,
              players: [
                { i: 0, color: 0, name: "WindHT", alive: true, dead: false, total: 3, tiles: 1, has_kill: false, raw: { total: 3, tiles: 1, has_kill: false } },
                { i: 1, color: 1, name: "yidao", alive: false, dead: true, total: 3, tiles: 1, has_kill: true, raw: { total: 3, tiles: 1, has_kill: true } }
              ],
              board: {
                width: 2,
                height: 2,
                armyTable: [[3, 0], [5, 6]],
                stateTable: [[0], [-2]],
                cells: [],
                trailingValues: []
              },
              frame: { battleSummary: "Turn10 | Players2/2" }
            },
            analysis: {
              summaryText: "game=match-1 | turn=10",
              battleRelations: {
                comparisonAvailable: true,
                warPlayerCount: 0,
                inWarPlayerKeys: [],
                adjacencyAssumed: false,
                playerStates: [
                  { key: 0, name: "WindHT", color: 0, inWar: false, warReasons: [], currentStrength: 3, previousStrength: 3, currentTiles: 1, previousTiles: 1, associatedPlayers: [{ key: 1, name: "yidao", color: 1 }], adjacentPlayerKeys: [], adjacentPlayerNames: [], adjacentPlayerColors: [], relationText: "关联：yidao" },
                  { key: 1, name: "yidao", color: 1, inWar: false, warReasons: [], currentStrength: 3, previousStrength: 3, currentTiles: 1, previousTiles: 1, associatedPlayers: [{ key: 0, name: "WindHT", color: 0 }], adjacentPlayerKeys: [], adjacentPlayerNames: [], adjacentPlayerColors: [], relationText: "关联：WindHT" }
                ],
                notes: []
              }
            }
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 4) {
        return new Response(JSON.stringify({ ok: false, error: "temporary outage" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 5) {
        return new Response(JSON.stringify({ ok: true, record: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 6) {
        return new Response(JSON.stringify(buildLatestRecord({
          id: 6,
          turn: 11,
          battleSummary: "Turn11 | Players2/2",
          boardState: {
            width: 2,
            height: 2,
            armyTable: [[3, 0], [5, 6]],
            stateTable: [[0, 1], [-2, 0]],
            cells: [],
            trailingValues: []
          },
          battleRelations: buildBattleRelations({
            inWar: true,
            warPlayerCount: 2,
            adjacencyAssumed: true,
            currentStrength: 3,
            previousStrength: 3,
            currentTiles: 1,
            previousTiles: 1
          })
        })), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "unexpected" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  };

  await import("../src/display/display-main.js");
  for (let attempt = 0; attempt < 20 && boardGrid.children.length === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(elements.has("simpleMode"), false);

  assert.equal(boardGrid.children.length, 4);
  assert.equal(boardGrid.children[0].style.background, "rgb(255, 0, 0)");
  assert.equal(boardGrid.children[1].style.background, "rgb(39, 146, 255)");
  assert.equal(boardGrid.children[1].children[0].textContent, "");
  assert.equal(boardGrid.children[1].children[0].classList.contains("cell-empty-text"), true);
  assert.equal(boardGrid.children[2].className.includes("cell-state--2"), true);
  assert.equal(boardGrid.children[2].style.background, undefined);
  assert.equal(boardGrid.children[3].style.background, "rgb(255, 0, 0)");
  assert.equal(boardMeta.textContent, "2×2");

  assert.equal(playerList.children.length, 2);
  assert.equal(playerList.children[0].children.length, 2);
  assert.equal(playerList.children[0].children[0].children.length, 1);
  assert.equal(playerList.children[0].children[0].children[0].children.length, 2);
  assert.equal(playerList.children[0].children[1].children.length, 3);
  assert.equal(playerList.children[0].children[1].children[0].children[0].textContent, "兵力：");
  assert.equal(playerList.children[0].children[1].children[0].children[1].textContent, "3");
  assert.equal(playerList.children[0].children[1].children[1].children[0].textContent, "地块：");
  assert.equal(playerList.children[0].children[1].children[1].children[1].textContent, "1");
  assert.equal(playerList.children[0].children[1].children[2].children[0].textContent, "关系：");
  assert.equal(playerList.children[0].children[1].children[2].children[1].children.length, 1);
  assert.equal(playerList.children[0].children[1].children[2].children[1].children[0].style.background, "rgb(39, 146, 255)");
  assert.equal(playerList.children[0].classList.contains("player-card--war"), true);
  assert.equal(playerList.children[0].style["--player-accent"], "rgb(255, 0, 0)");
  assert.equal(playerList.children[1].classList.contains("player-card--dead"), true);
  assert.equal(String(playerList.children[0].textContent).includes("raw"), false);
  assert.equal(String(playerList.children[0].textContent).includes("i="), false);
  assert.equal(String(playerList.children[0].textContent).includes("color"), false);
  refreshBtn.dispatchEvent({ type: "click" });
  for (let attempt = 0; attempt < 20 && !String(status.textContent).includes("已从 Python 刷新"); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(String(status.textContent).includes("已从 Python 刷新"), true);

  refreshBtn.dispatchEvent({ type: "click" });
  for (let attempt = 0; attempt < 20 && !String(status.textContent).includes("尺寸不一致"); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(String(status.textContent).includes("棋盘表格尺寸不一致"), true);
  assert.equal(boardGrid.children.length, 4);
  assert.equal(boardGrid.children[0].style.background, "rgb(255, 0, 0)");
  assert.equal(boardGrid.children[1].children[0].classList.contains("cell-empty-text"), true);

  refreshBtn.dispatchEvent({ type: "click" });
  for (let attempt = 0; attempt < 20 && !String(status.textContent).includes("读取失败"); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(String(status.textContent).includes("读取失败：temporary outage"), true);

  refreshBtn.dispatchEvent({ type: "click" });
  for (let attempt = 0; attempt < 20 && !String(status.textContent).includes("暂无最新战斗快照"); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(String(status.textContent).includes("Python 暂无最新战斗快照"), true);
  assert.equal(boardGrid.children.length, 4);
  assert.equal(boardGrid.children[3].style.background, "rgb(255, 0, 0)");

  runtimeMessageListener?.({ type: "BATTLE_SNAPSHOT_UPDATED" }, {}, () => null);
  for (let attempt = 0; attempt < 20 && fetchCallCount < 6; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(fetchCallCount >= 6, true);

  console.log("display tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

