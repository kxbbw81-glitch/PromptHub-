const fs = require('node:fs');
const path = require('node:path');
const parser = require('../extension/prompt-parser.js');

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const DEFAULT_COLLECTIONS_PATH = path.join(__dirname, '../data/collections.json');

function dateKeyInShanghai(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(entry => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function collectionDateKey(item) {
  return dateKeyInShanghai(item?.collectedAt || item?.githubSyncedAt || item?.timestamp || item?.date);
}

function hasManualTitle(item) {
  return item?.titleSource === 'manual' || item?.titleLocked === true;
}

function needsTitleAudit(item) {
  if (!item?.prompt || hasManualTitle(item)) return false;
  return !item.title || parser.isGenericTitle(item.title) || parser.titleLooksLikePrompt(item.title, item.prompt);
}

function hasPendingTitleSync(item) {
  if (item?.titleSource !== 'prompt-audit' || !item?.titleGeneratedAt) return false;
  const generatedAt = Date.parse(item.titleGeneratedAt);
  const syncedAt = Date.parse(item.githubSyncedAt || '');
  return Number.isFinite(generatedAt) && (!Number.isFinite(syncedAt) || generatedAt > syncedAt);
}

function auditCollections(payload, { dateKey = dateKeyInShanghai(new Date()), now = new Date().toISOString() } = {}) {
  const collections = Array.isArray(payload?.collections) ? payload.collections : [];
  const result = {
    dateKey,
    audited: 0,
    updated: 0,
    synchronized: 0,
    skippedManual: 0,
    skippedUnresolved: 0,
    changes: []
  };

  for (const item of collections) {
    if (collectionDateKey(item) !== dateKey) continue;
    result.audited += 1;

    if (hasManualTitle(item)) {
      result.skippedManual += 1;
      continue;
    }
    if (!needsTitleAudit(item)) {
      if (hasPendingTitleSync(item)) {
        item.githubSyncedAt = item.titleGeneratedAt;
        result.synchronized += 1;
      }
      continue;
    }

    // Do not feed the broad source title back into the generator. The full
    // prompt is the authoritative signal for an automatic replacement.
    const title = parser.normalizeAutoTitle('', item.prompt);
    if (!title || parser.isGenericTitle(title) || title === 'AI提示词' || title === item.title) {
      result.skippedUnresolved += 1;
      continue;
    }

    const previousTitle = item.title || '';
    item.title = title;
    item.titleSource = 'prompt-audit';
    item.titleGeneratedAt = now;
    item.githubSyncedAt = now;
    result.updated += 1;
    result.changes.push({ id: item.id, from: previousTitle, to: title });
  }

  return result;
}

function parseArgs(args) {
  const options = { apply: false, file: DEFAULT_COLLECTIONS_PATH, dateKey: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') options.apply = true;
    if (arg === '--date') options.dateKey = args[index + 1] || '';
    if (arg === '--file') options.file = path.resolve(args[index + 1] || options.file);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(fs.readFileSync(options.file, 'utf8'));
  const result = auditCollections(payload, { dateKey: options.dateKey || undefined });

  if (options.apply && (result.updated > 0 || result.synchronized > 0)) {
    payload.updatedAt = new Date().toISOString();
    fs.writeFileSync(options.file, `${JSON.stringify(payload, null, 2)}\n`);
  }

  console.log(JSON.stringify({ ...result, changed: options.apply ? result.updated + result.synchronized : 0 }));
}

if (require.main === module) main();

module.exports = {
  SHANGHAI_TIME_ZONE,
  auditCollections,
  collectionDateKey,
  dateKeyInShanghai,
  hasManualTitle,
  hasPendingTitleSync,
  needsTitleAudit
};
