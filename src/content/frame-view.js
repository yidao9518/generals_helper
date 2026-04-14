import { formatBattleDebugSummary } from "../shared/battle-debug.js";
import { sendRuntimeMessage } from "../shared/runtime-message.js";

// noinspection JSUnusedGlobalSymbols
const DISPLAY_FRAME_LIMIT = 32;

function formatFrameRaw(frame) {
  const ts = new Date(frame.capturedAt).toLocaleTimeString();
  const size = typeof frame.size === "number" ? frame.size : 0;
  const category = frame.category || frame.type || "text";
  const eventPart = frame.eventName ? ` event=${frame.eventName}` : "";
  const preview = typeof frame.preview === "string" ? frame.preview : "";
  return `[${ts}] ${frame.direction} ws/${category}${eventPart} ${size}b\n${preview}`;
}

function formatBattleFrame(frame) {
  const ts = new Date(frame.capturedAt).toLocaleTimeString();
  const size = typeof frame.size === "number" ? frame.size : 0;
  const eventPart = frame.eventName ? ` event=${frame.eventName}` : "";

  let output = `[${ts}] ${frame.direction} battle/event${eventPart} ${size}b`;

  if (typeof frame?.battleSummary === "string" && frame.battleSummary.trim()) {
    output += `\n${frame.battleSummary}`;
  } else if (frame.eventName === "game_update") {
    output += "\n[战报摘要未准备]";
  }

  return output;
}

// noinspection JSUnusedGlobalSymbols
export function createFrameView(getDisplayMode, getBattleDisplayConfig) {
  let latestRequestId = 0;

  async function loadFramesInto(container) {
    const requestId = ++latestRequestId;
    const displayMode = getDisplayMode();
    const onlyInMatch = displayMode === "battle";
    const response = await sendRuntimeMessage({
      type: "GET_LATEST_FRAMES",
      limit: DISPLAY_FRAME_LIMIT,
      filters: { onlyInMatch }
    }, 1);

    if (requestId !== latestRequestId) {
      return;
    }

    if (!response?.ok) {
      container.textContent = "读取失败";
      return;
    }

    let frames = Array.isArray(response.frames) ? response.frames : [];
    if (displayMode === "battle") {
      frames = frames.filter((frame) => frame?.category === "event");
    }

    if (!frames.length) {
      if (displayMode === "battle" && response.inGame) {
        container.textContent = "游戏中，暂无可分析的战场事件...";
        return;
      }
      container.textContent = displayMode === "battle"
        ? "未在游戏中"
        : "暂无原始消息";
      return;
    }

    if (displayMode === "battle") {
      const battleConfig = typeof getBattleDisplayConfig === "function" ? getBattleDisplayConfig() : {};
      const battleDebugText = battleConfig?.showDebug ? formatBattleDebugSummary(response.battleDebug) : "";
      const battleText = frames.map(formatBattleFrame).join("\n\n");
      container.textContent = battleDebugText
        ? `${battleDebugText}\n\n${battleText}`
        : battleText;
      return;
    }

    container.textContent = frames.map(formatFrameRaw).join("\n\n");
  }

  return { loadFramesInto };
}


