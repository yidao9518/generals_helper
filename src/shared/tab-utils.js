// Utility helpers for locating the active generals.io tab and sending messages to it.

/**
 * Find a sensible active tab id to send messages to. Prefers the currently active tab
 * when it points to generals.io; otherwise picks one of the generals.io tabs.
 * @returns {Promise<number|undefined>}
 */
export async function getActiveTabId() {
  const currentWindowTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentWindowTab = currentWindowTabs[0];
  if (currentWindowTab?.url?.includes("generals.io")) {
    return currentWindowTab.id;
  }

  const generalsTabs = await chrome.tabs.query({ url: ["*://*.generals.io/*"] });
  return generalsTabs.find((tab) => tab.active)?.id ?? generalsTabs[0]?.id ?? currentWindowTab?.id;
}

/**
 * Send a message to the chosen active generals.io tab.
 * Throws when no valid tab id could be found.
 */
export async function sendToActiveTab(message) {
  const tabId = await getActiveTabId();
  if (!Number.isInteger(tabId)) {
    throw new Error("当前页面不可用");
  }
  return chrome.tabs.sendMessage(tabId, message);
}

