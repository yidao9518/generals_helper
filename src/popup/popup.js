import { MODE_BATTLE, MODE_RAW } from "../shared/helper-config.js";

const modeRawBtn = document.getElementById("modeRaw");
const modeBattleBtn = document.getElementById("modeBattle");
const toggleVisibleBtn = document.getElementById("toggleVisible");
const autoRefreshBtn = document.getElementById("autoRefresh");
const showTurnBtn = document.getElementById("showTurn");
const showPlayersBtn = document.getElementById("showPlayers");
const showMapDiffBtn = document.getElementById("showMapDiff");
const showCitiesDiffBtn = document.getElementById("showCitiesDiff");
const showDesertsDiffBtn = document.getElementById("showDesertsDiff");
const showDebugBtn = document.getElementById("showDebug");
const statusEl = document.getElementById("status");
/** @type {Array<[HTMLElement | null, string]>} */
const battleSwitches = [
  [showTurnBtn, "showTurn"],
  [showPlayersBtn, "showPlayers"],
  [showMapDiffBtn, "showMapDiff"],
  [showCitiesDiffBtn, "showCitiesDiff"],
  [showDesertsDiffBtn, "showDesertsDiff"],
  [showDebugBtn, "showDebug"]
];

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function sendToActiveTab(message) {
  const tabId = await getActiveTabId();
  if (!Number.isInteger(tabId)) {
    throw new Error("当前页面不可用");
  }
  return chrome.tabs.sendMessage(tabId, message);
}

function renderState(state) {
  const mode = state?.mode === MODE_BATTLE ? MODE_BATTLE : MODE_RAW;
  const visible = Boolean(state?.visible);
  const autoRefreshEnabled = state?.autoRefreshEnabled !== false;
  const battleConfig = state?.battleConfig || {};
  modeRawBtn.dataset.active = String(mode === MODE_RAW);
  modeBattleBtn.dataset.active = String(mode === MODE_BATTLE);
  toggleVisibleBtn.textContent = visible ? "关闭面板" : "打开面板";
  statusEl.textContent = visible ? "面板已显示" : "面板已隐藏";
  if (autoRefreshBtn instanceof HTMLInputElement) {
    autoRefreshBtn.checked = autoRefreshEnabled;
  }

  for (const [checkbox, key] of battleSwitches) {
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = Boolean(battleConfig[key]);
    }
  }
}

async function refreshState() {
  try {
    const state = await sendToActiveTab({ type: "GET_HELPER_STATE" });
    if (!state?.ok) {
      statusEl.textContent = "页面未响应";
      return;
    }
    renderState(state);
  } catch {
    statusEl.textContent = "请在 generals.io 对局页面使用";
  }
}

modeRawBtn.addEventListener("click", async () => {
  try {
    const state = await sendToActiveTab({ type: "SET_HELPER_MODE", mode: MODE_RAW });
    renderState(state);
  } catch {
    statusEl.textContent = "设置失败";
  }
});

modeBattleBtn.addEventListener("click", async () => {
  try {
    const state = await sendToActiveTab({ type: "SET_HELPER_MODE", mode: MODE_BATTLE });
    renderState(state);
  } catch {
    statusEl.textContent = "设置失败";
  }
});

toggleVisibleBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab({ type: "TOGGLE_HELPER_PANEL" });
    await refreshState();
  } catch {
    statusEl.textContent = "切换失败";
  }
});


if (autoRefreshBtn instanceof HTMLInputElement) {
  autoRefreshBtn.addEventListener("change", async () => {
    try {
      const state = await sendToActiveTab({
        type: "SET_HELPER_AUTO_REFRESH",
        enabled: autoRefreshBtn.checked
      });
      renderState(state);
    } catch {
      statusEl.textContent = "设置失败";
      await refreshState();
    }
  });
}


for (const [checkbox, key] of battleSwitches) {
  if (!(checkbox instanceof HTMLInputElement)) {
    continue;
  }

  checkbox.addEventListener("change", async () => {
    try {
      const config = { [key]: checkbox.checked };
      const state = await sendToActiveTab({ type: "SET_BATTLE_CONFIG", config });
      renderState(state);
    } catch {
      statusEl.textContent = "设置失败";
      await refreshState();
    }
  });
}
void refreshState();

