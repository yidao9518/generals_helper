function formatDisplayText(value, fallback = "暂无") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const text = String(value);
  return text.trim() ? text : fallback;
}

/**
 * @typedef {Object} SetTextContentOptions
 * @property {string} [fallback]
 * @property {string|null} [mutedClass]
 */

/**
 * @param {HTMLElement|null|undefined} el
 * @param {unknown} value
 * @param {SetTextContentOptions} [options]
 */
export function setTextContent(el, value, { fallback = "暂无", mutedClass = null } = {}) {
  if (!(el instanceof HTMLElement)) {
    return;
  }

  const text = formatDisplayText(value, fallback);
  el.textContent = text;
  if (mutedClass) {
    el.classList.toggle(mutedClass, text === fallback);
  }
}


