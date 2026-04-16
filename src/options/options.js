import { loadPythonBridgeConfig, pingPythonBridge, savePythonBridgeConfig } from "../shared/python-bridge.js";

const enabledEl = document.getElementById("pythonBridgeEnabled");
const urlEl = document.getElementById("pythonBridgeUrl");
const testBtn = document.getElementById("testPythonBridge");
const pushBtn = document.getElementById("pushLatestSnapshot");
const openDisplayPageBtn = document.getElementById("openDisplayPage");
const bridgeServiceStatusEl = document.getElementById("bridgeServiceStatus");
const bridgeLastPushAtEl = document.getElementById("bridgeLastPushAt");
const bridgeLastHealthCheckAtEl = document.getElementById("bridgeLastHealthCheckAt");
const bridgeLastErrorEl = document.getElementById("bridgeLastError");
const bridgeLastAnalysisEl = document.getElementById("bridgeLastAnalysis");
const bridgeStatusEl = document.getElementById("bridgeStatus");

let currentConfig = null;
let bridgeStatusPollTimer = null;

function formatTimestamp(value) {
  if (typeof value !== "string" || !value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function setText(el, value, fallback = "暂无") {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  el.textContent = typeof value === "string" && value.trim() ? value : fallback;
  el.classList.toggle("bridge-muted", !value || !String(value).trim());
}

function formatBridgeError(value) {
  if (!value) {
    return "暂无";
  }
  return String(value);
}

function formatAnalysisSummary(status) {
  const analysis = status?.lastAnalysis;
  if (analysis && typeof analysis === "object") {
    return analysis.summaryText || JSON.stringify(analysis);
  }
  if (typeof status?.lastSnapshotSummary === "string" && status.lastSnapshotSummary.trim()) {
    return status.lastSnapshotSummary;
  }
  return "暂无";
}

function renderBridgeStatus(message, isError = false) {
  if (!(bridgeStatusEl instanceof HTMLElement)) {
    return;
  }
  bridgeStatusEl.textContent = message;
  bridgeStatusEl.style.color = isError ? "#b91c1c" : "#666";
}

function renderBridgeDetails(status, config) {
  const mergedStatus = status || {};

  const serviceOk = mergedStatus.lastStatus ? `已连接（HTTPS ${mergedStatus.lastStatus}）` : (config.enabled ? "未检测，点击测试连接或等待自动检查" : "已关闭");
  setText(bridgeServiceStatusEl, serviceOk, "尚未连接本地 Python 服务。");
  setText(bridgeLastPushAtEl, formatTimestamp(mergedStatus.lastPushAt), "未记录");
  setText(bridgeLastHealthCheckAtEl, formatTimestamp(mergedStatus.lastHealthCheckAt), "未记录");
  setText(bridgeLastErrorEl, formatBridgeError(mergedStatus.lastError), "暂无");
  setText(bridgeLastAnalysisEl, formatAnalysisSummary(mergedStatus), "暂无");

  const suffixParts = [];
  if (config.enabled) {
    suffixParts.push(`实时分析推送已开启`);
  } else {
    suffixParts.push(`实时分析推送已关闭`);
  }
  if (mergedStatus.lastAnalysis?.summaryText) {
    suffixParts.push(`最新摘要：${mergedStatus.lastAnalysis.summaryText}`);
  }
  renderBridgeStatus(suffixParts.join(" | "));
}

function syncBridgeControls(config) {
  if (enabledEl instanceof HTMLInputElement) {
    enabledEl.checked = config.enabled;
  }
  if (urlEl instanceof HTMLInputElement) {
    urlEl.value = config.url;
  }
}

async function persistBridgeConfig(partial) {
  currentConfig = await savePythonBridgeConfig({ ...(currentConfig || {}), ...partial });
  syncBridgeControls(currentConfig);
  return currentConfig;
}

async function refreshBridgeConfig() {
  currentConfig = await loadPythonBridgeConfig();
  syncBridgeControls(currentConfig);
  await refreshBridgeStatus();
  void probeBridgeConnection();
}

function startBridgeStatusPolling() {
  if (bridgeStatusPollTimer !== null) {
    return;
  }
  bridgeStatusPollTimer = window.setInterval(() => {
    void refreshBridgeStatus();
  }, 500);
}

async function openDisplayPage() {
  const url = chrome.runtime.getURL("src/display/display.html");
  await chrome.tabs.create({ url });
}

async function refreshBridgeStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PYTHON_BRIDGE_STATUS" });
    if (response?.ok) {
      renderBridgeDetails(response.status, response.config || currentConfig || {});
      return response;
    }
    renderBridgeDetails(null, currentConfig || {});
    renderBridgeStatus(`无法读取桥接状态：${response?.error || "未知错误"}`, true);
    return response;
  } catch (error) {
    renderBridgeDetails(null, currentConfig || {});
    renderBridgeStatus(`无法读取桥接状态：${String(error?.message || error)}`, true);
    return null;
  }
}

async function probeBridgeConnection() {
  if (!currentConfig?.enabled) {
    return;
  }

  renderBridgeStatus("正在检查本地 HTTPS 实时分析服务...");
  try {
    const response = await chrome.runtime.sendMessage({ type: "TEST_PYTHON_BRIDGE" });
    if (!response?.ok) {
      renderBridgeStatus(`自动检查失败：${response?.error || "未知错误"}`, true);
      await refreshBridgeStatus();
      return;
    }
    await refreshBridgeStatus();
  } catch (error) {
    renderBridgeStatus(`自动检查失败：${String(error?.message || error)}`, true);
    await refreshBridgeStatus();
  }
}

async function testBridge() {
  if (!currentConfig) {
    currentConfig = await loadPythonBridgeConfig();
  }

  renderBridgeStatus("正在测试本地 HTTPS 实时分析服务...");
  try {
    const result = await pingPythonBridge(currentConfig);
    if (!result.ok) {
      renderBridgeStatus(`连接失败：HTTPS ${result.status} ${result.body?.error || ""}`.trim(), true);
      await refreshBridgeStatus();
      return;
    }
    const service = result.body?.service || "local-bridge";
    const version = result.body?.version || "v1";
    renderBridgeStatus(`连接成功：${service} (${version}) @ ${currentConfig.url}`);
    await refreshBridgeStatus();
  } catch (error) {
    renderBridgeStatus(`连接失败：${String(error?.message || error)}`, true);
    await refreshBridgeStatus();
  }
}

async function pushLatestSnapshot() {
  renderBridgeStatus("正在推送最新分析...");
  try {
    const response = await chrome.runtime.sendMessage({ type: "PUSH_LATEST_BATTLE_SNAPSHOT" });
    if (!response?.ok) {
      renderBridgeStatus(`推送失败：${response?.error || "未知错误"}`, true);
      await refreshBridgeStatus();
      return;
    }
    const analysisText = response?.result?.analysis?.summaryText || response?.status?.lastSnapshotSummary || "已发送";
    renderBridgeStatus(`推送成功：${analysisText}`);
    await refreshBridgeStatus();
  } catch (error) {
    renderBridgeStatus(`推送失败：${String(error?.message || error)}`, true);
    await refreshBridgeStatus();
  }
}

if (enabledEl instanceof HTMLInputElement) {
  enabledEl.addEventListener("change", async () => {
    try {
      await persistBridgeConfig({ enabled: enabledEl.checked });
      renderBridgeStatus(`实时分析推送已${enabledEl.checked ? "开启" : "关闭"}`);
      await refreshBridgeStatus();
    } catch (error) {
      renderBridgeStatus(`保存失败：${String(error?.message || error)}`, true);
      await refreshBridgeConfig();
    }
  });
}

if (urlEl instanceof HTMLInputElement) {
  const saveUrl = async () => {
    const nextUrl = typeof urlEl.value === "string" ? urlEl.value.trim() : "";
    try {
      await persistBridgeConfig({ url: nextUrl });
      renderBridgeStatus(`服务地址已更新为：${currentConfig.url}`);
      await refreshBridgeStatus();
    } catch (error) {
      renderBridgeStatus(`保存失败：${String(error?.message || error)}`, true);
      await refreshBridgeConfig();
    }
  };
  urlEl.addEventListener("change", saveUrl);
  urlEl.addEventListener("blur", saveUrl);
}

if (testBtn instanceof HTMLButtonElement) {
  testBtn.addEventListener("click", () => {
    void testBridge();
  });
}

if (pushBtn instanceof HTMLButtonElement) {
  pushBtn.addEventListener("click", () => {
    void pushLatestSnapshot();
  });
}

if (openDisplayPageBtn instanceof HTMLButtonElement) {
  openDisplayPageBtn.addEventListener("click", async () => {
    try {
      await openDisplayPage();
    } catch (error) {
      renderBridgeStatus(`无法打开信息显示：${String(error?.message || error)}`, true);
    }
  });
}

void refreshBridgeConfig();
startBridgeStatusPolling();











