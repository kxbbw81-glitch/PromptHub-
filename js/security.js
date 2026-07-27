(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.PromptHubSecurity = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const MAX_IMAGE_URL_LENGTH = 4096;
  const MAX_IMAGE_COUNT = 12;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeImageUrl(value, fallback = '') {
    const input = String(value ?? '').trim();
    if (!input || input.length > MAX_IMAGE_URL_LENGTH) return fallback;

    try {
      const parsed = new URL(input);
      return parsed.protocol === 'https:'
        ? parsed.href
        : fallback;
    } catch {
      return fallback;
    }
  }

  function sanitizeImageUrls(values) {
    if (!Array.isArray(values)) return [];

    const seen = new Set();
    const safeUrls = [];

    for (const value of values) {
      const url = sanitizeImageUrl(value);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      safeUrls.push(url);
      if (safeUrls.length === MAX_IMAGE_COUNT) break;
    }

    return safeUrls;
  }

  return Object.freeze({
    escapeHtml,
    sanitizeImageUrl,
    sanitizeImageUrls
  });
});
