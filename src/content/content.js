const BRIDGE_SOURCE = "generals-helper-ws-hook";
const PANEL_ID = "generals-helper-panel-root";
const REFRESH_MS = 1500;
const INIT_FLAG = "__generalsHelperContentInitialized";
const MODE_RAW = "raw";
const MODE_BATTLE = "battle";
const PANEL_TEMPLATE_URL = chrome.runtime.getURL("src/content/panel.html");

const runtimeMessagePromise = import(chrome.runtime.getURL("src/shared/runtime-message.js"));

let frameViewPromise = null;
let frameLoader = null;
let panelTemplatePromise = null;
let panelTemplate = "";
let panelHost = null;
let panelRoot = null;
let framesEl = null;
let titleEl = null;
let refreshTimer = null;
let panelRefresh = null;
let displayMode = MODE_RAW;
let autoRefreshEnabled = true;

const CONTENT_BATTLE_DISPLAY_CONFIG = {
  showTurn: true,
  showPlayers: false,
  showMapDiff: true,
  showCitiesDiff: false,
  showDesertsDiff: false,
  showDebug: false
};

function getFrameViewModule() {
  if (!frameViewPromise) {
    frameViewPromise = import(chrome.runtime.getURL("src/content/frame-view.js"));
  }
  return frameViewPromise;
}

async function getFrameLoader() {
  if (!frameLoader) {
    const { createFrameView } = await getFrameViewModule();
    frameLoader = createFrameView(
      () => displayMode,
      () => CONTENT_BATTLE_DISPLAY_CONFIG
    ).loadFramesInto;
  }
  return frameLoader;
}

function getPanelTemplate() {
  if (!panelTemplatePromise) {
    panelTemplatePromise = fetch(PANEL_TEMPLATE_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`加载面板模板失败: ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        panelTemplate = text;
        return text;
      });
  }
  return panelTemplatePromise;
}

function getModeLabel(mode) {
  return mode === MODE_BATTLE ? "战场信息分析" : "原始消息";
}

function syncPanelTitle() {
  if (titleEl) {
    titleEl.textContent = getModeLabel(displayMode);
  }
}

function isPanelMounted() {
  return Boolean(panelHost && panelHost.isConnected);
}

function ensurePanelMounted() {
  if (panelHost && !panelHost.isConnected) {
    panelHost = null;
    panelRoot = null;
    framesEl = null;
    titleEl = null;
  }

  if (!isPanelMounted()) {
    mountPanel();
  }

  return panelHost;
}

function injectWsHook() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/injected/ws-hook.js");
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

async function sendRuntimeMessage(message, retries = 1) {
  const { sendRuntimeMessage: sendSharedRuntimeMessage } = await runtimeMessagePromise;
  return sendSharedRuntimeMessage(message, retries);
}

function mountPanel() {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    panelHost = existing;
    panelRoot = panelHost.shadowRoot;
    titleEl = panelRoot?.querySelector("#gh-title") || null;
    framesEl = panelRoot?.querySelector("#gh-frames") || null;
    syncPanelTitle();
    return panelHost;
  }

  const host = document.createElement("div");
  host.id = PANEL_ID;
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("left", "0", "important");
  host.style.setProperty("right", "0", "important");
  host.style.setProperty("bottom", "0", "important");
  host.style.setProperty("top", "auto", "important");
  host.style.setProperty("inset", "auto 0 0 0", "important");
  host.style.setProperty("transform", "none", "important");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("pointer-events", "auto", "important");
  host.style.setProperty("z-index", "2147483647", "important");

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = panelTemplate || '<div class="gh-wrap">加载中...</div>';

  (document.body || document.documentElement).appendChild(host);
  panelHost = host;
  panelRoot = shadow;
  titleEl = shadow.querySelector("#gh-title");
  framesEl = shadow.querySelector("#gh-frames");
  syncPanelTitle();
  return host;
}

function stopAutoRefresh() {
  if (!refreshTimer) {
    return;
  }
  clearInterval(refreshTimer);
  refreshTimer = null;
}

function startAutoRefresh(refresh) {
  if (!autoRefreshEnabled || refreshTimer) {
    return;
  }
  refreshTimer = setInterval(refresh, REFRESH_MS);
}

function syncAutoRefresh(refresh = panelRefresh) {
  stopAutoRefresh();
  if (autoRefreshEnabled && isPanelMounted() && panelHost.style.display !== "none") {
    startAutoRefresh(refresh);
  }
}

function hidePanel() {
  if (!isPanelMounted()) {
    return;
  }
  panelHost.style.display = "none";
  stopAutoRefresh();
}

function showPanel(refresh = panelRefresh) {
  ensurePanelMounted();
  if (!isPanelMounted()) {
    return;
  }
  panelHost.style.display = "block";
  if (typeof refresh === "function") {
    refresh();
  }
  startAutoRefresh(refresh);
}

function togglePanel(refresh = panelRefresh) {
  ensurePanelMounted();
  if (!isPanelMounted() || panelHost.style.display === "none") {
    showPanel(refresh);
    return;
  }
  hidePanel();
}

function setDisplayMode(mode, refresh = panelRefresh) {
  displayMode = mode === MODE_BATTLE ? MODE_BATTLE : MODE_RAW;
  syncPanelTitle();
  if (typeof refresh === "function") {
    refresh();
  }
}

function getPanelState() {
  return {
    visible: Boolean(isPanelMounted() && panelHost.style.display !== "none"),
    mode: displayMode,
    autoRefreshEnabled,
    battleConfig: { ...CONTENT_BATTLE_DISPLAY_CONFIG }
  };
}

async function bootPanel() {
  await getPanelTemplate();
  const panel = mountPanel();
  if (!panel || !panelRoot || !framesEl) {
    return;
  }

  const refreshBtn = panelRoot.querySelector("#gh-refresh");
  const clearBtn = panelRoot.querySelector("#gh-clear");

  const refresh = () => {
    getFrameLoader().then((loadFramesInto) => loadFramesInto(framesEl)).catch((error) => {
      framesEl.textContent = `刷新失败: ${error?.message || error}`;
    });
  };
  panelRefresh = refresh;

  refreshBtn.addEventListener("click", refresh);
  clearBtn.addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "CLEAR_FRAMES" }, 1);
    refresh();
  });

  showPanel(refresh);
  window.addEventListener("unload", () => stopAutoRefresh());
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_HELPER_STATE") {
    sendResponse({ ok: true, ...getPanelState() });
    return;
  }
  if (message?.type === "SHOW_HELPER_PANEL") {
    showPanel();
  }
  if (message?.type === "TOGGLE_HELPER_PANEL") {
    togglePanel();
  }
  if (message?.type === "SET_HELPER_VISIBLE") {
    if (message.visible) {
      showPanel();
    } else {
      hidePanel();
    }
    sendResponse({ ok: true, ...getPanelState() });
    return;
  }
  if (message?.type === "SET_HELPER_MODE") {
    setDisplayMode(message.mode);
    sendResponse({ ok: true, ...getPanelState() });
    return;
  }
  if (message?.type === "SET_HELPER_AUTO_REFRESH") {
    autoRefreshEnabled = message.enabled !== false;
    syncAutoRefresh();
    sendResponse({ ok: true, ...getPanelState() });
    return;
  }
  if (message?.type === "SET_BATTLE_CONFIG") {
    if (typeof message.config === "object" && message.config !== null) {
      Object.assign(CONTENT_BATTLE_DISPLAY_CONFIG, message.config);
      if (typeof panelRefresh === "function") {
        panelRefresh();
      }
    }
    sendResponse({ ok: true, ...getPanelState() });
    return;
  }
  sendResponse({ ok: true, ...getPanelState() });
});

function forwardCapturedFrame(event) {
  if (event.source !== window) {
    return;
  }
  const data = event.data;
  if (!data || data.source !== BRIDGE_SOURCE || data.type !== "WS_FRAME_CAPTURED") {
    return;
  }

  sendRuntimeMessage({
    type: "WS_FRAME_CAPTURED",
    payload: data.payload
  }, 1).catch(() => {
    // ignore transient bridge errors
  });
}

if (window === window.top && !window[INIT_FLAG]) {
  window[INIT_FLAG] = true;
  window.addEventListener("message", forwardCapturedFrame);
  injectWsHook();
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bootPanel, { once: true });
  } else {
    void bootPanel();
  }
}
