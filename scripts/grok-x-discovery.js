const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIN_PROMPT_LENGTH = 160;
const X_STATUS_URL = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+\/?(?:\?.*)?$/i;
const PLATFORM_PREFIX = /^(?:gpt\s*image\s*2(?:\s+on\s+chatgpt)?|nano\s+banana(?:\s+prompt)?|prompt\s*[:：])\s*/i;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.search = '';
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString();
  } catch {
    return '';
  }
}

function promptFingerprint(value) {
  return crypto.createHash('sha256').update(normalizeText(value).toLowerCase()).digest('hex');
}

function extractPostId(sourceUrl) {
  return normalizeSourceUrl(sourceUrl).match(/\/status\/(\d+)/i)?.[1] || '';
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function stripPlatformPrefix(value) {
  return String(value || '').replace(PLATFORM_PREFIX, '').trim();
}

function firstPromptLine(prompt) {
  return normalizeText(prompt).split(/[。.!?]/)[0].slice(0, 60).trim() || 'AI 生成提示词';
}

function buildDiscoveryPrompt(config) {
  const queries = config.discoveryQueries.map((query, index) => `${index + 1}. ${query}`).join('\n');
  const signals = config.recognitionSignals.join(', ');
  const excluded = config.excludedSignals.join(', ');

  return `Use only the built-in X Search tool to discover public posts. Do not open, read, or infer any private bookmarks, home timelines, cookies, accounts, or browser state.\n\nSearch window: the last ${config.lookbackDays} days.\nMaximum accepted candidates per query: ${config.maxCandidatesPerQuery}.\nMaximum accepted candidates across this entire run: ${config.maxCandidatesTotal}.\nRecognition signals: ${signals}.\nReject signals: ${excluded}.\n\nQueries:\n${queries}\n\nA candidate is valid only when it has all of the following: (1) a specific x.com/<handle>/status/<id> source URL, (2) a complete reusable image-generation or video-generation prompt of at least ${MIN_PROMPT_LENGTH} characters after removing social/model labels, and (3) a direct HTTPS result image URL, or for video a direct HTTPS poster URL. Skip tutorials, product promotions, incomplete prompts, repost-only content, and posts without result media.\n\nReturn at most ${config.maxCandidatesTotal} candidates total as JSON only, with no Markdown or explanatory prose. Use this exact handoff schema. Do not include githubSyncedAt or domesticSyncedAt:\n{"schemaVersion":1,"generatedAt":"ISO 8601 UTC timestamp","count":1,"producer":"grok-cli-public-x-search","candidates":[{"id":"x_status_id","sourceUrl":"https://x.com/handle/status/id","url":"https://x.com/handle/status/id","domain":"x.com","source":"x_search","title":"short title","prompt":"full prompt only","mediaType":"image or video","images":["https://..."],"image":"https://...","videoPoster":"https://... or empty string","videoUrl":"https://...mp4 or empty string","aspectRatio":"4:5 or empty string","category":"category","tags":["tag"],"model":"model or empty string","collectedAt":"ISO 8601 UTC timestamp","signals":["matched signal"]}]}`;
}

function findJsonCandidate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const possibilities = [text, fenced?.[1]].filter(Boolean);
  for (const candidate of possibilities) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed?.candidates)) return parsed;
    } catch {}
  }
  const start = text.indexOf('{"candidates"');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed?.candidates)) return parsed;
    } catch {}
  }
  return null;
}

function extractCandidatePayload(rawOutput) {
  if (rawOutput && typeof rawOutput === 'object' && Array.isArray(rawOutput.candidates)) return rawOutput;
  if (rawOutput && typeof rawOutput === 'object' && Array.isArray(rawOutput.collections)) {
    return { candidates: rawOutput.collections };
  }
  const direct = findJsonCandidate(rawOutput);
  if (direct) return direct;
  const queue = [rawOutput];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (value && typeof value === 'object') {
      if (seen.has(value)) continue;
      seen.add(value);
      if (Array.isArray(value)) queue.push(...value);
      else queue.push(...Object.values(value));
      continue;
    }
    const parsed = findJsonCandidate(value);
    if (parsed) return parsed;
  }
  throw new Error('Grok output does not contain a candidates JSON object');
}

function selectCandidatesForImport(rawOutput, payload, maxCandidates) {
  const candidates = payload.candidates;
  if (rawOutput && typeof rawOutput === 'object' && Array.isArray(rawOutput.collections)) return candidates;
  return candidates.slice(0, maxCandidates || 10);
}

function parseCliOutputText(value) {
  return JSON.parse(String(value || '').replace(/^\uFEFF/, ''));
}

function validateCandidate(candidate) {
  const sourceUrl = normalizeSourceUrl(candidate.sourceUrl);
  const prompt = stripPlatformPrefix(String(candidate.prompt || '')).trim();
  const rawImageUrls = [
    ...(Array.isArray(candidate.imageUrls) ? candidate.imageUrls : []),
    ...(Array.isArray(candidate.images) ? candidate.images : []),
    candidate.image
  ];
  const imageUrls = [...new Set(rawImageUrls.filter(isHttpsUrl))];
  const mediaType = candidate.mediaType === 'video' ? 'video' : 'image';
  const videoPoster = isHttpsUrl(candidate.videoPoster) ? candidate.videoPoster : '';
  const videoUrl = isHttpsUrl(candidate.videoUrl) ? candidate.videoUrl : '';

  if (!X_STATUS_URL.test(sourceUrl)) return { valid: false, reason: 'missing concrete X status URL' };
  if (prompt.length < MIN_PROMPT_LENGTH) return { valid: false, reason: 'prompt shorter than 160 characters' };
  if (!imageUrls.length && !(mediaType === 'video' && videoPoster)) return { valid: false, reason: 'missing HTTPS result media' };

  return {
    valid: true,
    candidate: {
      ...candidate,
      sourceUrl,
      prompt,
      imageUrls: [...new Set(imageUrls)],
      mediaType,
      videoPoster,
      videoUrl,
      title: normalizeText(candidate.title) || firstPromptLine(prompt),
      category: normalizeText(candidate.category) || (mediaType === 'video' ? '视频' : '图像'),
      tags: Array.isArray(candidate.tags) ? candidate.tags.map(normalizeText).filter(Boolean).slice(0, 8) : [],
      model: normalizeText(candidate.model),
      aspectRatio: normalizeText(candidate.aspectRatio)
    }
  };
}

function existingKeys(collections) {
  const sourceUrls = new Set();
  const prompts = new Set();
  for (const item of collections) {
    const source = normalizeSourceUrl(item.sourceUrl || item.url);
    if (source) sourceUrls.add(source);
    const fingerprint = promptFingerprint(item.prompt);
    if (fingerprint) prompts.add(fingerprint);
  }
  return { sourceUrls, prompts };
}

function toCollection(candidate, now = new Date().toISOString()) {
  const postId = extractPostId(candidate.sourceUrl);
  const images = candidate.imageUrls.length ? candidate.imageUrls : [candidate.videoPoster];
  return {
    id: `grok_x_${postId}`,
    title: candidate.title,
    category: candidate.category,
    tags: [...new Set([...candidate.tags, candidate.mediaType === 'video' ? '文生视频' : '文生图', 'Grok X 公开搜索'])],
    prompt: candidate.prompt,
    image: images[0],
    images,
    rawImages: images,
    referenceImages: [],
    aspectRatio: candidate.aspectRatio,
    model: candidate.model,
    mediaType: candidate.mediaType,
    ...(candidate.mediaType === 'video' ? { videoPoster: candidate.videoPoster || images[0], videoSourceUrl: candidate.videoUrl || candidate.sourceUrl } : {}),
    source: 'Grok X 公开搜索',
    sourceUrl: candidate.sourceUrl,
    url: candidate.sourceUrl,
    domain: 'x.com',
    date: now.slice(0, 10),
    timestamp: Date.parse(now),
    collectedAt: now,
    githubSyncedAt: now,
    domesticSyncedAt: null
  };
}

function acceptCandidates(candidates, collections, now = new Date().toISOString()) {
  const keys = existingKeys(collections);
  const accepted = [];
  const rejected = [];

  for (const rawCandidate of candidates) {
    const result = validateCandidate(rawCandidate);
    if (!result.valid) {
      rejected.push({ candidate: rawCandidate, reason: result.reason });
      continue;
    }
    const candidate = result.candidate;
    const source = candidate.sourceUrl;
    const fingerprint = promptFingerprint(candidate.prompt);
    if (keys.sourceUrls.has(source)) {
      rejected.push({ candidate, reason: 'duplicate source URL' });
      continue;
    }
    if (keys.prompts.has(fingerprint)) {
      rejected.push({ candidate, reason: 'duplicate prompt' });
      continue;
    }
    keys.sourceUrls.add(source);
    keys.prompts.add(fingerprint);
    accepted.push(toCollection(candidate, now));
  }

  return { accepted, rejected };
}

function parseArgs(argv) {
  const options = { config: path.join(__dirname, '..', 'config', 'grok-x-discovery.json'), input: '', apply: false };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--config') options.config = argv[++index];
    else if (value === '--input') options.input = argv[++index];
    else if (value === '--apply') options.apply = true;
  }
  return options;
}

function run(argv = process.argv) {
  const options = parseArgs(argv);
  const config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
  if (!options.input) {
    console.log(buildDiscoveryPrompt(config));
    return { mode: 'prompt' };
  }

  const rawOutput = parseCliOutputText(fs.readFileSync(options.input, 'utf8'));
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'collections.json'), 'utf8'));
  const collections = Array.isArray(payload) ? payload : payload.collections;
  const candidates = selectCandidatesForImport(rawOutput, extractCandidatePayload(rawOutput), config.maxCandidatesTotal);
  const result = acceptCandidates(candidates, collections);

  if (options.apply && result.accepted.length) {
    payload.collections = [...result.accepted, ...collections];
    payload.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'collections.json'), `${JSON.stringify(payload, null, 2)}\n`);
  }
  console.log(JSON.stringify({ accepted: result.accepted, rejected: result.rejected.map(item => item.reason), applied: options.apply }, null, 2));
  return result;
}

if (require.main === module) run();

module.exports = {
  MIN_PROMPT_LENGTH,
  acceptCandidates,
  buildDiscoveryPrompt,
  extractCandidatePayload,
  normalizeSourceUrl,
  parseCliOutputText,
  promptFingerprint,
  selectCandidatesForImport,
  validateCandidate
};
