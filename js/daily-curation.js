(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PromptHubDailyCuration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function getShanghaiDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function dateKeyToTime(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function getItemTime(item = {}) {
    const candidates = [item.collectedAt, item.githubSyncedAt, item.timestamp, item.date];
    for (const candidate of candidates) {
      const time = Date.parse(candidate);
      if (!Number.isNaN(time)) return time;
    }
    return 0;
  }

  function isEligible(item = {}) {
    return Boolean(
      String(item.id || '').trim() &&
      String(item.title || '').trim() &&
      String(item.prompt || '').trim().length >= 40 &&
      /^https?:\/\//i.test(String(item.image || ''))
    );
  }

  function scorePrompt(item, dateKey) {
    const todayTime = dateKeyToTime(dateKey);
    const itemTime = getItemTime(item);
    const itemDateKey = itemTime ? getShanghaiDateKey(new Date(itemTime)) : '';
    const itemDayTime = dateKeyToTime(itemDateKey);
    const ageInDays = Number.isFinite(todayTime) && Number.isFinite(itemDayTime)
      ? Math.max(0, Math.floor((todayTime - itemDayTime) / DAY_MS))
      : Infinity;
    const freshness = itemDateKey === dateKey ? 340 : (ageInDays <= 7 ? (130 - ageInDays * 12) : 0);
    const completeness = Math.min(80, Math.floor(String(item.prompt || '').trim().length / 45));
    const verified = item.verified ? 80 : 0;
    const collected = item.isCollection ? 45 : 0;
    const popularity = Math.min(65, Math.floor(Math.log2(Math.max(0, Number(item.likes) || 0) + 1) * 6));
    const dailyVariation = stableHash(`${dateKey}:${item.id}`) % 120;
    return freshness + completeness + verified + collected + popularity + dailyVariation;
  }

  function getDailyCuratedPrompts(items = [], limit = 6, dateKey = getShanghaiDateKey()) {
    const ranked = items
      .filter(isEligible)
      .map(item => ({ item, score: scorePrompt(item, dateKey) }))
      .sort((left, right) => right.score - left.score || String(left.item.id).localeCompare(String(right.item.id)));
    const selected = [];
    const selectedIds = new Set();
    const usedCategories = new Set();

    for (const entry of ranked) {
      const category = String(entry.item.category || '其他');
      if (selected.length >= limit || usedCategories.has(category)) continue;
      selected.push(entry.item);
      selectedIds.add(entry.item.id);
      usedCategories.add(category);
    }

    for (const entry of ranked) {
      if (selected.length >= limit) break;
      if (!selectedIds.has(entry.item.id)) selected.push(entry.item);
    }

    return selected;
  }

  return { getShanghaiDateKey, getDailyCuratedPrompts, isEligible, scorePrompt, stableHash };
});
