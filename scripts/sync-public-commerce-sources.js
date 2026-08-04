const fs = require('node:fs');
const path = require('node:path');
const { classifyCommerceType, COMMERCE_CATEGORY } = require('./category-rules');
const gptImageImporter = require('./import-awesome-gpt-image-2');
const aiartImporter = require('./import-awesome-aiart-pics-prompts');
const { normalizeSourceUrl, promptFingerprint } = require('./grok-x-discovery');

const MIN_PROMPT_LENGTH = 160;
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config', 'commerce-public-sources.json');
const DEFAULT_COLLECTIONS_PATH = path.join(__dirname, '..', 'data', 'collections.json');
const COMMERCE_SIGNALS = /\b(?:e-?commerce|product\s+(?:photography|shot|render|showcase|display|campaign|ad|advertising|detail)|packshot|packaging|brand\s+(?:campaign|visual|identity)|lifestyle\s+product|ugc|unboxing)\b|电商|商品|产品(?:主图|摄影|广告|海报|展示|详情|卖点)|包装|品牌(?:视觉|广告|活动|识别)|场景种草|开箱|测评|口碑/i;

function cleanText(value) {
  return String(value || '').trim();
}

function isHttps(value) {
  try {
    return new URL(cleanText(value)).protocol === 'https:';
  } catch {
    return false;
  }
}

function validateSource(source = {}) {
  const required = ['id', 'adapter', 'name', 'dataUrl', 'license', 'licenseUrl'];
  const missing = required.filter(key => !cleanText(source[key]));
  if (missing.length) return { valid: false, reason: `missing source metadata: ${missing.join(', ')}` };
  if (!isHttps(source.dataUrl) || !isHttps(source.licenseUrl)) return { valid: false, reason: 'source metadata must use HTTPS' };
  if (!['awesome-gpt-image-2', 'awesome-aiart-pics-prompts'].includes(source.adapter)) {
    return { valid: false, reason: `unsupported source adapter: ${source.adapter}` };
  }
  return { valid: true };
}

function hasHttpsResultMedia(item = {}) {
  const images = [item.image, ...(Array.isArray(item.images) ? item.images : [])].filter(Boolean);
  return images.length > 0 && images.every(isHttps);
}

function hasAttribution(item = {}) {
  return Boolean(cleanText(item.attribution) || cleanText(item.sourceRepository) || cleanText(item.sourceAuthor));
}

function isCommerceCandidate(item = {}) {
  return COMMERCE_SIGNALS.test([
    item.title,
    item.prompt,
    item.category,
    item.commerceType,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ].filter(Boolean).join(' '));
}

function toCommerceCollection(item, source) {
  const commerceType = item.commerceType || classifyCommerceType(item) || '产品主图';
  return {
    ...item,
    category: COMMERCE_CATEGORY,
    commerceType,
    source: item.source || source.name,
    sourceLicenseVerified: true,
    sourceLicenseUrl: source.licenseUrl,
    collectionOrigin: 'approved-public-commerce'
  };
}

function validateCollection(item, source) {
  if (cleanText(item.prompt).length < MIN_PROMPT_LENGTH) return 'prompt shorter than 160 characters';
  if (!hasHttpsResultMedia(item)) return 'missing HTTPS result media';
  if (!isHttps(item.sourceUrl || item.url)) return 'missing HTTPS source URL';
  if (cleanText(item.license) !== cleanText(source.license)) return 'source license mismatch';
  if (!hasAttribution(item)) return 'missing attribution';
  if (!isCommerceCandidate(item)) return 'not an e-commerce prompt';
  return '';
}

function importSource(source, content, collections, now) {
  if (source.adapter === 'awesome-gpt-image-2') {
    const payload = JSON.parse(content);
    const expectedCategory = source.sourceCategory || 'Products & E-commerce';
    const cases = (payload.cases || []).filter(item => item.category === expectedCategory);
    return gptImageImporter.importCases({ cases }, collections, now);
  }
  return aiartImporter.importEntries(content, collections, now);
}

function existingKeys(collections) {
  return {
    ids: new Set(collections.map(item => cleanText(item.id)).filter(Boolean)),
    prompts: new Set(collections.map(item => promptFingerprint(item.prompt)).filter(Boolean)),
    sources: new Set(collections.map(item => normalizeSourceUrl(item.sourceUrl || item.url)).filter(Boolean))
  };
}

function importApprovedCommerceSources({ sources, sourceContents, collections, now = new Date().toISOString() }) {
  const accepted = [];
  const rejected = [];
  const summary = [];
  const keys = existingKeys(collections);

  for (const source of sources.filter(item => item.enabled !== false)) {
    const sourceCheck = validateSource(source);
    if (!sourceCheck.valid) {
      rejected.push({ source: source.id || 'unknown', reason: sourceCheck.reason });
      summary.push({ source: source.id || 'unknown', accepted: 0, rejected: 1, error: sourceCheck.reason });
      continue;
    }

    const content = sourceContents[source.id];
    if (!content) {
      rejected.push({ source: source.id, reason: 'missing source content' });
      summary.push({ source: source.id, accepted: 0, rejected: 1, error: 'missing source content' });
      continue;
    }

    let imported;
    try {
      imported = importSource(source, content, [...collections, ...accepted], now);
    } catch (error) {
      const reason = `source parse failed: ${error.message}`;
      rejected.push({ source: source.id, reason });
      summary.push({ source: source.id, accepted: 0, rejected: 1, error: reason });
      continue;
    }

    rejected.push(...imported.rejected.map(item => ({ source: source.id, ...item })));
    let sourceAccepted = 0;
    let sourceRejected = imported.rejected.length;
    for (const rawItem of imported.accepted) {
      const reason = validateCollection(rawItem, source);
      if (reason) {
        rejected.push({ source: source.id, id: rawItem.id, reason });
        sourceRejected += 1;
        continue;
      }

      const item = toCommerceCollection(rawItem, source);
      const id = cleanText(item.id);
      const prompt = promptFingerprint(item.prompt);
      const sourceUrl = normalizeSourceUrl(item.sourceUrl || item.url);
      if (keys.ids.has(id) || keys.prompts.has(prompt) || keys.sources.has(sourceUrl)) {
        rejected.push({ source: source.id, id, reason: 'duplicate collection' });
        sourceRejected += 1;
        continue;
      }
      if (sourceAccepted >= Number(source.maxItemsPerRun || 20)) {
        rejected.push({ source: source.id, id, reason: 'source run limit reached' });
        sourceRejected += 1;
        continue;
      }

      keys.ids.add(id);
      keys.prompts.add(prompt);
      keys.sources.add(sourceUrl);
      accepted.push(item);
      sourceAccepted += 1;
    }
    summary.push({ source: source.id, accepted: sourceAccepted, rejected: sourceRejected });
  }

  return { accepted, rejected, summary };
}

async function fetchSourceText(url, fetcher = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: { accept: 'application/json, text/plain, text/markdown;q=0.9, */*;q=0.5' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('request timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(argv) {
  const options = { config: DEFAULT_CONFIG_PATH, collections: DEFAULT_COLLECTIONS_PATH, apply: false };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--config') options.config = path.resolve(argv[++index]);
    else if (argv[index] === '--collections') options.collections = path.resolve(argv[++index]);
    else if (argv[index] === '--apply') options.apply = true;
  }
  return options;
}

async function run(argv = process.argv, fetcher = globalThis.fetch) {
  const options = parseArgs(argv);
  const config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
  const payload = JSON.parse(fs.readFileSync(options.collections, 'utf8'));
  const collections = Array.isArray(payload) ? payload : payload.collections;
  if (!config.enabled) return { accepted: [], rejected: [], summary: [], applied: false, disabled: true };

  const sourceContents = {};
  const fetchFailures = [];
  for (const source of config.sources || []) {
    if (source.enabled === false) continue;
    const check = validateSource(source);
    if (!check.valid) {
      sourceContents[source.id] = '';
      fetchFailures.push({ source: source.id, reason: check.reason });
      continue;
    }
    try {
      sourceContents[source.id] = await fetchSourceText(source.dataUrl, fetcher);
    } catch (error) {
      sourceContents[source.id] = '';
      fetchFailures.push({ source: source.id, reason: `source fetch failed: ${error.message}` });
    }
  }

  const now = new Date().toISOString();
  const result = importApprovedCommerceSources({ sources: config.sources || [], sourceContents, collections, now });
  result.rejected.push(...fetchFailures);
  result.summary = result.summary.map(item => ({
    ...item,
    ...(fetchFailures.find(failure => failure.source === item.source) ? { error: fetchFailures.find(failure => failure.source === item.source).reason } : {})
  }));

  if (fetchFailures.length) {
    const detail = fetchFailures.map(item => `${item.source}: ${item.reason}`).join('; ');
    throw new Error(`public commerce source sync failed: ${detail}`);
  }

  if (options.apply && result.accepted.length) {
    payload.collections = [...result.accepted, ...collections];
    payload.updatedAt = now;
    fs.writeFileSync(options.collections, `${JSON.stringify(payload, null, 2)}\n`);
  }

  const output = {
    sources: result.summary,
    accepted: result.accepted.length,
    rejected: result.rejected.length,
    applied: options.apply && result.accepted.length > 0
  };
  console.log(JSON.stringify(output, null, 2));
  return { ...result, ...output };
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  COMMERCE_SIGNALS,
  MIN_PROMPT_LENGTH,
  fetchSourceText,
  importApprovedCommerceSources,
  isCommerceCandidate,
  toCommerceCollection,
  validateCollection,
  validateSource
};
