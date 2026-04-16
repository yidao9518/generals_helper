import { DEFAULT_PYTHON_BRIDGE_CONFIG, buildBattleSnapshot, findLatestBattleSnapshotFrame, loadPythonBridgeConfig, pingPythonBridge, postBattleSnapshotToPython, savePythonBridgeConfig } from "../shared/python-bridge.js";

export function createPythonBridgeController(getFrameBuffer, _options = {}) {
  const pythonBridgeState = {
    enabled: DEFAULT_PYTHON_BRIDGE_CONFIG.enabled,
    autoPush: DEFAULT_PYTHON_BRIDGE_CONFIG.autoPush,
    url: DEFAULT_PYTHON_BRIDGE_CONFIG.url,
    lastHealthCheckAt: null,
    lastPushAt: null,
    lastError: "",
    lastAnalysis: null,
    lastStatus: null,
    lastSnapshotSummary: ""
  };
  let cachedConfig = null;
  let pendingAutoPushSnapshot = null;
  let pendingAutoPushReason = "auto";
  let autoPushInFlight = false;

  function updatePythonBridgeState(partial) {
    Object.assign(pythonBridgeState, partial);
  }

  function getState() {
    return { ...pythonBridgeState };
  }

  function reportError(message) {
    updatePythonBridgeState({ lastError: String(message || "") });
  }

  function getLatestBattleSnapshot() {
    const latest = findLatestBattleSnapshotFrame(getFrameBuffer());
    if (!latest) {
      return null;
    }
    return { frame: latest.frame, snapshot: latest.snapshot };
  }

  async function getPythonBridgeConfig({ refresh = false } = {}) {
    if (!refresh && cachedConfig) {
      return cachedConfig;
    }

    cachedConfig = await loadPythonBridgeConfig();
    updatePythonBridgeState({
      enabled: cachedConfig.enabled,
      autoPush: cachedConfig.autoPush,
      url: cachedConfig.url
    });
    return cachedConfig;
  }

  async function pingBridgeAndUpdateState(config) {
    const result = await pingPythonBridge(config);
    updatePythonBridgeState({
      enabled: config.enabled,
      autoPush: config.autoPush,
      url: config.url,
      lastHealthCheckAt: new Date().toISOString(),
      lastStatus: result.status,
      lastError: result.ok ? "" : (result.body?.error || `HTTP ${result.status}`)
    });
    return result;
  }

  async function pushSnapshotToBridge(snapshot, reason = "auto") {
    const config = await getPythonBridgeConfig();
    if (!config.enabled) {
      return { ok: false, skipped: true, reason: "bridge_disabled" };
    }

    const result = await postBattleSnapshotToPython(config, snapshot);
    updatePythonBridgeState({
      lastPushAt: new Date().toISOString(),
      lastStatus: result.status,
      lastAnalysis: result.body?.analysis || null,
      lastSnapshotSummary: snapshot?.frame?.battleSummary || "",
      lastError: result.ok ? "" : (result.body?.error || `HTTP ${result.status}`)
    });

    if (!result.ok) {
      throw new Error(result.body?.error || `HTTP ${result.status}`);
    }

    return { ok: true, reason, response: result.body };
  }

  async function flushQueuedAutoPush() {
    if (autoPushInFlight) {
      return;
    }

    const snapshot = pendingAutoPushSnapshot;
    const reason = pendingAutoPushReason;
    pendingAutoPushSnapshot = null;
    pendingAutoPushReason = "auto";

    if (!snapshot) {
      return;
    }

    autoPushInFlight = true;
    try {
      await pushSnapshotToBridge(snapshot, reason);
    } catch (error) {
      reportError(String(error?.message || error));
    } finally {
      autoPushInFlight = false;
      void flushQueuedAutoPush();
    }
  }

  function queueAutoPush(snapshot, reason = "auto") {
    pendingAutoPushSnapshot = snapshot;
    pendingAutoPushReason = reason;
    if (!autoPushInFlight) {
      void flushQueuedAutoPush();
    }
    return { ok: true, queued: true, reason };
  }

  async function maybePushLatestBattleSnapshot(frame, reason = "auto") {
    const config = await getPythonBridgeConfig();
    if (!config.enabled || !config.autoPush) {
      return { ok: false, skipped: true, reason: "bridge_disabled_or_paused" };
    }

    const snapshot = buildBattleSnapshot(frame);
    if (!snapshot) {
      return { ok: false, skipped: true, reason: "no_snapshot" };
    }

    if (reason === "manual") {
      pendingAutoPushSnapshot = null;
      pendingAutoPushReason = "auto";
      return pushSnapshotToBridge(snapshot, reason);
    }

    return queueAutoPush(snapshot, reason);
  }

  async function bootstrap() {
    await getPythonBridgeConfig().catch(() => null);
  }

  async function onAnnotatedFrame(frame) {
    return maybePushLatestBattleSnapshot(frame, "auto");
  }

  async function handleMessage(message) {
    if (message?.type === "GET_LATEST_BATTLE_SNAPSHOT") {
      const latest = getLatestBattleSnapshot();
      return {
        ok: true,
        latest
      };
    }

    if (message?.type === "GET_PYTHON_BRIDGE_STATUS") {
      const config = await getPythonBridgeConfig();
      return {
        ok: true,
        config,
        status: getState()
      };
    }

    if (message?.type === "SET_PYTHON_BRIDGE_CONFIG") {
      cachedConfig = await savePythonBridgeConfig({
        ...(await loadPythonBridgeConfig()),
        ...(message.config || {})
      });
      updatePythonBridgeState({
        enabled: cachedConfig.enabled,
        autoPush: cachedConfig.autoPush,
        url: cachedConfig.url,
        lastError: ""
      });
      return { ok: true, config: cachedConfig, status: getState() };
    }

    if (message?.type === "TEST_PYTHON_BRIDGE") {
      const config = await getPythonBridgeConfig();
      const result = await pingBridgeAndUpdateState(config);
      return {
        ok: result.ok,
        status: getState(),
        result: result.body || null,
        httpStatus: result.status
      };
    }

    if (message?.type === "PUSH_LATEST_BATTLE_SNAPSHOT") {
      const latest = findLatestBattleSnapshotFrame(getFrameBuffer());
      if (!latest) {
        return { ok: false, error: "未找到可推送的战场快照" };
      }
      try {
        const result = await pushSnapshotToBridge(latest.snapshot, "manual");
        return {
          ok: true,
          status: getState(),
          result: result.response || null
        };
      } catch (error) {
        return { ok: false, error: String(error?.message || error), status: getState() };
      }
    }

    return null;
  }

  return {
    bootstrap,
    onAnnotatedFrame,
    handleMessage,
    reportError
  };
}






