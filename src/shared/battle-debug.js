function isBattleFrame(frame) {
  return frame?.eventName === "game_start" || frame?.eventName === "game_update";
}

export function summarizeBattleFrames(frames, sampleLimit = 6) {
  const safeFrames = Array.isArray(frames) ? frames : [];
  const summary = {
    totalFrames: safeFrames.length,
    battleFrames: 0,
    framesWithSummary: 0,
    framesWithBeforeState: 0,
    framesWithAfterState: 0,
    framesWithDiffPatch: 0,
    framesWithTailRemaining: 0,
    unresolvedFrames: 0,
    sampleFrames: []
  };

  for (const frame of safeFrames) {
    if (!isBattleFrame(frame)) {
      continue;
    }

    summary.battleFrames += 1;
    if (typeof frame.battleSummary === "string" && frame.battleSummary.trim()) {
      summary.framesWithSummary += 1;
      if (frame.battleSummary.includes("未计算")) {
        summary.unresolvedFrames += 1;
      }
    }
    if (frame?.battleMapDiffPatchOk) {
      summary.framesWithDiffPatch += 1;
    }
    if (Number.isInteger(frame?.battleMapDiffTailRemaining)) {
      summary.framesWithTailRemaining += 1;
    }
    if (frame?.battleMapStateBefore) {
      summary.framesWithBeforeState += 1;
    }
    if (frame?.battleMapStateAfter) {
      summary.framesWithAfterState += 1;
    }

    if (summary.sampleFrames.length < sampleLimit) {
      summary.sampleFrames.push({
        eventName: frame.eventName || "",
        turn: Number.isFinite(frame.turn) ? frame.turn : null,
        hasBeforeState: Boolean(frame.battleMapStateBefore),
        hasAfterState: Boolean(frame.battleMapStateAfter),
        hasDiffPatch: Boolean(frame.battleMapDiffPatchOk),
        diffLen: Number.isInteger(frame.battleMapDiffLength) ? frame.battleMapDiffLength : null,
        tailRemaining: Number.isInteger(frame.battleMapDiffTailRemaining) ? frame.battleMapDiffTailRemaining : null,
        diffHead: Array.isArray(frame.battleMapDiffHead) ? frame.battleMapDiffHead.join(",") : "",
        hasSummary: typeof frame.battleSummary === "string" && frame.battleSummary.trim().length > 0,
        summary: typeof frame.battleSummary === "string" ? frame.battleSummary : ""
      });
    }
  }

  return summary;
}

export function formatBattleDebugSummary(debug) {
  if (!debug || typeof debug !== "object") {
    return "";
  }

  const lines = [
    `DBG total=${debug.totalFrames || 0} battle=${debug.battleFrames || 0} summary=${debug.framesWithSummary || 0} before=${debug.framesWithBeforeState || 0} after=${debug.framesWithAfterState || 0} patch=${debug.framesWithDiffPatch || 0} tail=${debug.framesWithTailRemaining || 0} unresolved=${debug.unresolvedFrames || 0}`
  ];

  if (Array.isArray(debug.sampleFrames) && debug.sampleFrames.length > 0) {
    lines.push(
      ...debug.sampleFrames.map((sample) => {
        const turnPart = Number.isInteger(sample.turn) ? ` turn=${sample.turn}` : "";
        const diffPart = Number.isInteger(sample.diffLen) ? ` diffLen=${sample.diffLen}` : "";
        const tailPart = Number.isInteger(sample.tailRemaining) ? ` tail=${sample.tailRemaining}` : "";
        const patchPart = ` patch=${sample.hasDiffPatch ? 1 : 0}`;
        const summaryPart = sample.summary ? ` ${sample.summary}` : "";
        const headPart = sample.diffHead ? ` head=${sample.diffHead}` : "";
        return `DBG ${sample.eventName || ""}${turnPart} before=${sample.hasBeforeState ? 1 : 0} after=${sample.hasAfterState ? 1 : 0}${patchPart}${diffPart}${tailPart}${headPart} summary=${sample.hasSummary ? 1 : 0}${summaryPart}`;
      })
    );
  }

  return lines.join("\n");
}



