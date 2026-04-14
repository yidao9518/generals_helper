// noinspection JSUnusedGlobalSymbols
export async function loadFrameBuffer(storageKey, maxFrames) {
  const { [storageKey]: savedFrames } = await chrome.storage.local.get([storageKey]);
  if (!Array.isArray(savedFrames)) {
    return [];
  }
  return savedFrames.slice(-maxFrames);
}

export async function saveFrameBuffer(storageKey, frameBuffer) {
  await chrome.storage.local.set({
    [storageKey]: frameBuffer
  });
}

export function trimFrameBuffer(frameBuffer, maxFrames) {
  if (frameBuffer.length > maxFrames) {
    return frameBuffer.slice(-maxFrames);
  }
  return frameBuffer;
}

export function getLatestFrames(frameBuffer, limit = 30, filters = {}) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 30;
  let candidates = frameBuffer;

  if (filters?.onlyInMatch) {
    candidates = candidates.filter((frame) => frame?.inMatch);
  }

  const latestFrames = candidates.slice(-safeLimit).reverse();

  if (filters?.onlyInMatch) {
    return latestFrames.map((frame) => {
      if (!frame || typeof frame !== "object") {
        return frame;
      }
      const { preview, ...rest } = frame;
      return rest;
    });
  }

  return latestFrames;
}



