// noinspection JSUnresolvedReference,JSUnusedLocalSymbols,JSUnusedGlobalSymbols

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
    this.className = "";
    this.textContent = "";
    this.title = "";
    this.classList = new FakeClassList();
    this._listeners = new Map();
  }

  appendChild(child) {
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
      if (["boardSizeRange", "pythonBridgeEnabled", "simpleMode", "pythonBridgeUrl"].includes(id)) {
        element = new FakeInputElement("input");
      } else if (["refreshBtn", "openSettingsBtn", "testPythonBridge", "pushLatestSnapshot", "openDisplayPage"].includes(id)) {
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
    },
    setInterval() {
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
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeMessageListener = listener;
        }
      },
      sendMessage: async () => {},
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
  window.setInterval(() => {});
  chrome.runtime.getURL("src/display/display.html");
  await chrome.runtime.openOptionsPage();

  let fetchCallCount = 0;
  globalThis.fetch = async (url) => {
    fetchCallCount += 1;
    if (String(url).endsWith("/v1/latest")) {
      if (fetchCallCount === 1) {
        return new Response(JSON.stringify({
          ok: true,
          record: {
            id: 1,
            snapshot: {
              turn: 8,
              matchId: "match-1",
              playerCount: 2,
              aliveCount: 2,
              players: [
                  { i: 0, color: 0, name: "WindHT", alive: true, dead: false, score: 12, total: 3, tiles: 1, has_kill: false, raw: { total: 3, tiles: 1, has_kill: false } },
                  { i: 1, color: 1, name: "yidao", alive: false, dead: true, score: 11, total: 3, tiles: 1, has_kill: true, raw: { total: 3, tiles: 1, has_kill: true } }
              ],
              board: {
                width: 2,
                height: 2,
                armyTable: [[3, 0], [5, 6]],
                stateTable: [[0, 1], [-2, 0]],
                cells: [],
                trailingValues: []
              },
              frame: { battleSummary: "Turn8 | Players2/2" }
            },
            analysis: { summaryText: "game=match-1 | turn=8" }
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 2) {
        return new Response(JSON.stringify({
          ok: true,
          record: {
            id: 2,
            snapshot: {
              turn: 9,
              matchId: "match-1",
              playerCount: 2,
              aliveCount: 2,
              players: [
                { i: 0, color: 0, name: "WindHT", alive: true, dead: false, score: 12, total: 3, tiles: 1, has_kill: false, raw: { total: 3, tiles: 1, has_kill: false } },
                { i: 1, color: 1, name: "yidao", alive: false, dead: true, score: 11, total: 3, tiles: 1, has_kill: true, raw: { total: 3, tiles: 1, has_kill: true } }
              ],
              board: {
                width: 2,
                height: 2,
                armyTable: [[3, 0], [5, 6]],
                stateTable: [[0], [-2]],
                cells: [],
                trailingValues: []
              },
              frame: { battleSummary: "Turn9 | Players2/2" }
            },
            analysis: { summaryText: "game=match-1 | turn=9" }
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 3) {
        return new Response(JSON.stringify({ ok: false, error: "temporary outage" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (fetchCallCount === 4) {
        return new Response(JSON.stringify({ ok: true, record: null }), {
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
  const simpleModeToggle = elementById("simpleMode");
  assert.equal(simpleModeToggle.checked, true);
  for (let attempt = 0; attempt < 20 && boardGrid.children.length === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

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
  assert.equal(playerList.children[0].children[1].children.length, 2);
  assert.equal(playerList.children[0].children[1].children[0].textContent, "兵力：3");
  assert.equal(playerList.children[0].children[1].children[1].textContent, "地块：1");
  assert.equal(playerList.children[0].style["--player-accent"], "rgb(255, 0, 0)");
  assert.equal(playerList.children[1].classList.contains("player-card--dead"), true);
  assert.equal(String(playerList.children[0].textContent).includes("raw"), false);
  assert.equal(String(playerList.children[0].textContent).includes("i="), false);
  assert.equal(String(playerList.children[0].textContent).includes("color"), false);

  simpleModeToggle.checked = false;
  simpleModeToggle.dispatchEvent({ type: "change" });
  for (let attempt = 0; attempt < 20 && storageState.pythonBridge.simpleMode !== false; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  for (let attempt = 0; attempt < 20 && playerList.children[0]?.children?.length !== 3; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(storageState.pythonBridge.simpleMode, false);
  assert.equal(playerList.children[0].children.length, 3);
  assert.equal(playerList.children[0].children[1].children.length, 8);
  assert.equal(playerList.children[0].children[1].children[3].textContent, "总分：3");
  assert.equal(playerList.children[0].children[1].children[4].textContent, "地块：1");
  assert.equal(playerList.children[0].children[1].children[5].textContent, "击杀：否");
  assert.equal(playerList.children[0].children[2].textContent.startsWith("raw:"), true);

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

  console.log("display tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});



