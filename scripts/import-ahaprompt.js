const fs = require('node:fs');
const path = require('node:path');
const parser = require('../extension/prompt-parser.js');
const { classifyCollection, classifyCommerceType } = require('./category-rules');
const { normalizeSourceUrl, promptFingerprint } = require('./grok-x-discovery');

const SOURCE = 'AhaPrompt';
const BASE_URL = 'https://ahaprompt.app';
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const LICENSE = 'AhaPrompt Community Terms';
const LICENSE_URL = `${BASE_URL}/terms-of-service`;
const MIN_PROMPT_LENGTH = 160;
const REQUEST_TIMEOUT_MS = 30000;
const RESTRICTED_IP = /copyrighted characters|disney|dreamworks|pixar|marvel|thanos|spider[- ]?man|star wars|harry potter|pokemon|nintendo|ghibli|minecraft|league of legends|dragon ball|tournament of power|naruto|one piece|zhen huan|甄嬛|迪士尼|皮克斯|漫威|蜘蛛侠|星球大战|哈利波特|宝可梦|任天堂|吉卜力|我的世界|英雄联盟/i;
const UNSUPPORTED_MEDIA = /AudioObject/i;

function cleanText(value) {
  return String(value || '')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isHttps(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function decodeFlightString(raw) {
  try {
    return JSON.parse(`"${String(raw || '').replace(/\r?\n/g, '\\n')}"`);
  } catch {
    return String(raw || '');
  }
}

function extractPromptUrls(sitemap) {
  return [...new Set([...String(sitemap || '').matchAll(/<loc>(https:\/\/ahaprompt\.app\/prompt\/[^<]+)<\/loc>/g)]
    .map(match => cleanText(match[1]))
    .filter(Boolean))];
}

function extractFlightStrings(html) {
  return [...String(html || '').matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)]
    .map(match => cleanText(decodeFlightString(match[1])))
    .filter(Boolean);
}

function parseJsonPayload(value) {
  try {
    return JSON.parse(decodeHtml(value));
  } catch {
    return null;
  }
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value === 'object') return [value];
  return [];
}

function extractJsonLdObjects(html) {
  const direct = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap(match => flattenJsonLd(parseJsonPayload(match[1])));
  const fromFlight = extractFlightStrings(html)
    .filter(text => text.includes('"@context"') && text.includes('schema.org'))
    .flatMap(text => flattenJsonLd(parseJsonPayload(text)));
  return [...direct, ...fromFlight];
}

function mainWorkObject(html) {
  return extractJsonLdObjects(html).find(item => {
    const type = String(item['@type'] || '');
    return /ImageObject|VideoObject/i.test(type) && cleanText(item.name) && cleanText(item.url);
  });
}

function isPromptCandidate(text) {
  if (cleanText(text).length < MIN_PROMPT_LENGTH) return false;
  if (/^[0-9a-f]+:\s*[\[{"$]/i.test(text) || /^[\[{]/.test(text)) return false;
  if (text.includes('/_next/static') || text.includes('$Sreact') || text.includes('NEXT_REDIRECT')) return false;
  if (text.includes('"$"') || text.includes('className') || text.includes('children')) return false;
  if (/How to use this prompt|Frequently asked questions|More .* prompts|Browse all|Copy Prompt|All Prompts/i.test(text)) return false;
  return true;
}

function cleanPrompt(value) {
  return cleanText(value)
    .replace(/^(?:nano\s+banana(?:\s+pro)?|banana)\s*prompt\s*[👇⬇️]?\s*/i, '')
    .replace(/^(?:copy\s+prompt|prompt|提示词)\s*[👇⬇️]?\s*[:：-]?\s*/i, '')
    .trim();
}

function extractPrompt(html) {
  const candidates = extractFlightStrings(html)
    .map(cleanPrompt)
    .filter(isPromptCandidate);
  return candidates[0] || '';
}

function sourceSlug(url) {
  return new URL(url).pathname.split('/').filter(Boolean).pop() || 'prompt';
}

function entryId(url) {
  return `ahaprompt_${sourceSlug(url).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 88)}`;
}

function extractOriginalSourceUrl(html) {
  const match = String(html || '').match(/https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+/);
  return match ? match[0] : '';
}

function mediaTypeFromWork(work) {
  return /VideoObject/i.test(String(work?.['@type'] || '')) ? 'video' : 'image';
}

function primaryImage(work, mediaType) {
  if (mediaType === 'video') return cleanText(work.thumbnailUrl);
  return cleanText(work.contentUrl || work.thumbnailUrl);
}

function modelName(work) {
  return cleanText(work?.about?.name || '').replace(/\s+prompt$/i, '') || '通用 AI 生成模型';
}

function normalizeTitle(work, prompt) {
  const title = cleanText(work.name).replace(/\s+\|\s*AhaPrompt$/i, '');
  if (title && !/^(?:AI\s+)?(?:image|video|audio)?\s*prompt$/i.test(title) && [...title].length <= 60) return title;
  return parser.normalizeAutoTitle(title, prompt);
}

function keywordTags(work) {
  return cleanText(work.keywords)
    .split(',')
    .map(item => cleanText(item).replace(/\s+prompt$/i, ''))
    .filter(item => item && !/^AI (?:image|video|audio)$/i.test(item))
    .slice(0, 8);
}

function gcd(left, right) {
  let a = Math.abs(Number(left));
  let b = Math.abs(Number(right));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function aspectRatio(work, prompt) {
  const textMatch = cleanText(prompt).match(/(?:aspect\s*ratio|image\s*ratio|--ar|宽高比|画幅比?|比例)\s*[:：=]?\s*(\d{1,2})\s*[:xX×]\s*(\d{1,2})|\b(\d{1,2})\s*[:xX×]\s*(\d{1,2})\s*(?:vertical|horizontal|portrait|landscape|竖版|横版|比例|画幅)/i);
  const textWidth = Number(textMatch?.[1] || textMatch?.[3]);
  const textHeight = Number(textMatch?.[2] || textMatch?.[4]);
  if (textWidth && textHeight) return `${textWidth}:${textHeight}`;
  const width = Number(work.width);
  const height = Number(work.height);
  if (!width || !height) return '';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function sourceDate(work, now) {
  const value = cleanText(work.uploadDate || work.dateModified);
  return value ? value.slice(0, 10) : now.slice(0, 10);
}

function toCollection(entry, now) {
  const { url, html } = entry;
  const work = mainWorkObject(html);
  const prompt = extractPrompt(html);
  const mediaType = mediaTypeFromWork(work);
  const image = primaryImage(work, mediaType);
  const title = normalizeTitle(work, prompt);
  const tags = [...new Set([SOURCE, modelName(work), mediaType === 'video' ? '视频提示词' : '图像提示词', ...keywordTags(work)].filter(Boolean))].slice(0, 10);
  const category = classifyCollection({ title, prompt, mediaType, tags });
  const commerceType = category === '电商视觉' ? classifyCommerceType({ title, prompt, mediaType, tags }) : '';
  const date = sourceDate(work, now);
  const originalSourceUrl = extractOriginalSourceUrl(html);
  return {
    id: entryId(url),
    title,
    prompt,
    category,
    ...(commerceType ? { commerceType } : {}),
    tags,
    model: modelName(work),
    mediaType,
    image,
    images: [image],
    rawImages: [image],
    referenceImages: [],
    ...(mediaType === 'video' && isHttps(work.contentUrl) ? { videoUrl: cleanText(work.contentUrl) } : {}),
    aspectRatio: aspectRatio(work, prompt),
    source: SOURCE,
    sourceUrl: url,
    url,
    ...(originalSourceUrl ? { originalSourceUrl } : {}),
    sourceLicenseVerified: true,
    sourceLicenseUrl: LICENSE_URL,
    license: LICENSE,
    licenseUrl: LICENSE_URL,
    attribution: `${SOURCE} (${LICENSE})`,
    collectionOrigin: 'approved-public-prompt',
    domain: 'ahaprompt.app',
    date,
    timestamp: Date.parse(now),
    collectedAt: now,
    githubSyncedAt: now,
    domesticSyncedAt: null
  };
}

function validateEntry(entry) {
  const work = mainWorkObject(entry.html);
  if (!work) return 'missing schema.org media object';
  if (UNSUPPORTED_MEDIA.test(String(work['@type'] || ''))) return 'unsupported media type';
  const prompt = extractPrompt(entry.html);
  if (prompt.length < MIN_PROMPT_LENGTH || !parser.isCompletePrompt(prompt)) return 'incomplete prompt';
  const mediaType = mediaTypeFromWork(work);
  const image = primaryImage(work, mediaType);
  if (!isHttps(image)) return 'missing HTTPS result media';
  if (mediaType === 'video' && work.contentUrl && !isHttps(work.contentUrl)) return 'missing HTTPS video URL';
  if (RESTRICTED_IP.test(`${work.name}\n${prompt}`)) return 'restricted third-party IP';
  return '';
}

function importPages(pages, collections, now = new Date().toISOString()) {
  const existingPrompts = new Set(collections.map(item => promptFingerprint(item.prompt)).filter(Boolean));
  const existingSources = new Set(collections.map(item => normalizeSourceUrl(item.sourceUrl || item.url)).filter(Boolean));
  const existingIds = new Set(collections.map(item => item.id).filter(Boolean));
  const accepted = [];
  const rejected = [];

  for (const entry of pages) {
    const reason = validateEntry(entry);
    if (reason) {
      rejected.push({ url: entry.url, reason });
      continue;
    }

    const collection = toCollection(entry, now);
    const fingerprint = promptFingerprint(collection.prompt);
    const sourceKey = normalizeSourceUrl(collection.sourceUrl);
    if (existingPrompts.has(fingerprint)) {
      rejected.push({ url: entry.url, reason: 'duplicate prompt' });
      continue;
    }
    if (existingSources.has(sourceKey) || existingIds.has(collection.id)) {
      rejected.push({ url: entry.url, reason: 'duplicate source' });
      continue;
    }

    existingPrompts.add(fingerprint);
    existingSources.add(sourceKey);
    existingIds.add(collection.id);
    accepted.push(collection);
  }

  return { accepted, rejected };
}

async function fetchText(url, fetcher = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: { accept: 'text/html, application/xml;q=0.9, */*;q=0.5' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`request timed out: ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(argv) {
  const root = path.join(__dirname, '..');
  const options = {
    sitemapUrl: SITEMAP_URL,
    collections: path.join(root, 'data', 'collections.json'),
    apply: false,
    limit: 0
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--sitemap-url') options.sitemapUrl = argv[++index];
    else if (argv[index] === '--collections') options.collections = path.resolve(argv[++index]);
    else if (argv[index] === '--limit') options.limit = Number(argv[++index]);
    else if (argv[index] === '--apply') options.apply = true;
  }
  return options;
}

async function run(argv = process.argv, fetcher = globalThis.fetch) {
  const options = parseArgs(argv);
  const payload = JSON.parse(fs.readFileSync(options.collections, 'utf8'));
  const collections = Array.isArray(payload) ? payload : payload.collections;
  const sitemap = await fetchText(options.sitemapUrl, fetcher);
  const urls = extractPromptUrls(sitemap).slice(0, options.limit > 0 ? options.limit : undefined);
  const pages = [];
  for (const url of urls) {
    pages.push({ url, html: await fetchText(url, fetcher) });
  }
  const now = new Date().toISOString();
  const result = importPages(pages, collections, now);

  if (options.apply && result.accepted.length) {
    payload.collections = [...result.accepted, ...collections];
    payload.updatedAt = now;
    fs.writeFileSync(options.collections, `${JSON.stringify(payload, null, 2)}\n`);
  }

  const rejectedByReason = result.rejected.reduce((counts, entry) => {
    counts[entry.reason] = (counts[entry.reason] || 0) + 1;
    return counts;
  }, {});
  const summary = {
    sourcePages: urls.length,
    accepted: result.accepted.length,
    rejected: result.rejected.length,
    rejectedByReason,
    applied: options.apply && result.accepted.length > 0
  };
  console.log(JSON.stringify(summary, null, 2));
  return { ...result, summary };
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  LICENSE,
  MIN_PROMPT_LENGTH,
  extractFlightStrings,
  extractJsonLdObjects,
  extractPrompt,
  extractPromptUrls,
  importPages,
  toCollection,
  validateEntry
};
