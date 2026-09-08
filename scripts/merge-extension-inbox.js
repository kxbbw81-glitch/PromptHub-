const fs = require('node:fs');
const path = require('node:path');
const { classifyCollection, classifyCommerceType } = require('./category-rules');

const DEFAULT_COLLECTIONS_PATH = path.join(__dirname, '..', 'data', 'collections.json');
const DEFAULT_INBOX_DIR = path.join(__dirname, '..', 'data', 'inbox');
const MIN_PROMPT_LENGTH = 70;
const LONG_PROMPT_LENGTH = 160;

const SOCIAL_TEASER_RE = /(提示词|prompt).{0,20}(评论区|见评论|放评论|私信|主页|置顶|关注|转发|点赞|回复|领取|下载|链接|付费|购买|课程|教程)|老规矩|返图|谁出的不好看|私信已经爆|加群|扫码|vx|微信|公众号/i;
const CHINESE_VISUAL_CUES = [
  '构图', '镜头', '机位', '画面', '焦点', '背景', '前景', '主体', '人物', '产品',
  '场景', '色彩', '光线', '灯光', '逆光', '侧光', '柔光', '阴影', '质感', '材质',
  '浅景深', '虚化', '写实', '摄影', '拍摄', '肖像', '海报', '壁纸', '插画', '风格'
];
const ENGLISH_VISUAL_RE = /\b(?:cinematic|photorealistic|editorial|portrait|product|composition|lighting|camera|lens|background|foreground|subject|style|texture|depth of field|no text|no logo|no watermark)\b/i;
const TECHNICAL_VISUAL_RE = /\b(?:24mm|35mm|50mm|85mm|100mm|f\/\d|ISO\s*\d+|\d+\s*:\s*\d+)\b/i;

function cleanText(value, max = 30000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function promptFingerprint(value) {
  return cleanText(value).normalize('NFKC').toLowerCase();
}

function normalizeSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString();
  } catch {
    return '';
  }
}

function collectionSourceKey(item) {
  const sourceUrl = normalizeSourceUrl(item?.sourceUrl || item?.url);
  if (!sourceUrl) return '';
  try {
    const parsed = new URL(sourceUrl);
    const statusMatch = parsed.hostname === 'x.com' && parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
    if (statusMatch) return `x:${statusMatch[1].toLowerCase()}:${statusMatch[2]}`;
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return '';
  }
}

function isHttps(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isPromptLikeText(prompt) {
  const text = cleanText(prompt);
  if (text.length < MIN_PROMPT_LENGTH) return false;
  if (SOCIAL_TEASER_RE.test(text)) return false;
  if (text.length >= LONG_PROMPT_LENGTH) return true;
  const chineseCueCount = CHINESE_VISUAL_CUES.reduce((count, cue) => count + (text.includes(cue) ? 1 : 0), 0);
  const technicalCueCount = (ENGLISH_VISUAL_RE.test(text) ? 1 : 0) + (TECHNICAL_VISUAL_RE.test(text) ? 1 : 0);
  return chineseCueCount + technicalCueCount >= 3;
}

function sanitizeInboxItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = cleanText(item.id, 120);
  const title = cleanText(item.title, 180);
  const prompt = cleanText(item.prompt);
  const sourceUrl = normalizeSourceUrl(item.sourceUrl || item.url);
  const imageList = Array.isArray(item.images) ? item.images : [item.image];
  const images = [...new Set(imageList.map(url => cleanText(url, 2048)).filter(isHttps))].slice(0, 12);
  if (!id || !title || !isPromptLikeText(prompt) || !sourceUrl || !images.length) return null;
  return {
    ...item,
    id,
    title,
    prompt,
    category: cleanText(item.category, 32),
    tags: Array.isArray(item.tags) ? item.tags.map(tag => cleanText(tag, 48)).filter(Boolean).slice(0, 12) : [],
    image: images[0],
    images,
    rawImages: images,
    referenceImages: Array.isArray(item.referenceImages) ? item.referenceImages.map(url => cleanText(url, 2048)).filter(isHttps).slice(0, 12) : [],
    aspectRatio: cleanText(item.aspectRatio, 32),
    model: cleanText(item.model, 100),
    mediaType: item.mediaType === 'video' ? 'video' : 'image',
    source: cleanText(item.source, 100) || '插件扫描',
    sourceUrl,
    url: sourceUrl,
    domain: cleanText(item.domain, 80) || domainFromUrl(sourceUrl),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? item.date : new Date().toISOString().slice(0, 10),
    timestamp: Number(item.timestamp) || Date.now()
  };
}

function inboxItemsFromPayload(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (payload?.item) return [payload.item];
  if (Array.isArray(payload)) return payload;
  return [];
}

function readInboxFiles(inboxDir = DEFAULT_INBOX_DIR) {
  if (!fs.existsSync(inboxDir)) return [];
  return fs.readdirSync(inboxDir)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .sort()
    .map(name => {
      const filePath = path.join(inboxDir, name);
      try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
        return { filePath, name, items: inboxItemsFromPayload(payload) };
      } catch (error) {
        return { filePath, name, items: [], error: error.message };
      }
    });
}

function existingKeys(collections) {
  return {
    ids: new Set(collections.map(item => cleanText(item.id, 120)).filter(Boolean)),
    prompts: new Set(collections.map(item => promptFingerprint(item.prompt)).filter(Boolean)),
    sources: new Set(collections.map(collectionSourceKey).filter(Boolean))
  };
}

function toCollection(item, now) {
  const commerceType = classifyCommerceType(item);
  return {
    ...item,
    category: classifyCollection(item),
    ...(commerceType ? { commerceType } : {}),
    collectedAt: item.collectedAt || now,
    githubSyncedAt: now,
    domesticSyncedAt: null
  };
}

function mergeExtensionInbox({ collectionsPayload, inboxFiles, now = new Date().toISOString() }) {
  const collections = Array.isArray(collectionsPayload) ? collectionsPayload : collectionsPayload.collections;
  if (!Array.isArray(collections)) throw new Error('collections.json format is invalid');

  const keys = existingKeys(collections);
  const accepted = [];
  const rejected = [];
  const processedFiles = [];

  for (const file of inboxFiles) {
    processedFiles.push(file.filePath);
    if (file.error) {
      rejected.push({ file: file.name, reason: 'invalid inbox JSON' });
      continue;
    }
    for (const rawItem of file.items) {
      const item = sanitizeInboxItem(rawItem);
      if (!item) {
        rejected.push({ file: file.name, id: cleanText(rawItem?.id, 120), reason: 'incomplete collection item' });
        continue;
      }
      const id = cleanText(item.id, 120);
      const sourceKey = collectionSourceKey(item);
      const fingerprint = promptFingerprint(item.prompt);
      if (keys.ids.has(id) || keys.sources.has(sourceKey) || keys.prompts.has(fingerprint)) {
        rejected.push({ file: file.name, id, reason: 'duplicate collection' });
        continue;
      }
      keys.ids.add(id);
      keys.sources.add(sourceKey);
      keys.prompts.add(fingerprint);
      accepted.push(toCollection(item, now));
    }
  }

  if (accepted.length) {
    collectionsPayload.collections = [...accepted.reverse(), ...collections];
    collectionsPayload.updatedAt = now;
  }

  return { payload: collectionsPayload, accepted, rejected, processedFiles };
}

function parseArgs(argv) {
  const options = { apply: false, collectionsPath: DEFAULT_COLLECTIONS_PATH, inboxDir: DEFAULT_INBOX_DIR };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--collections') options.collectionsPath = path.resolve(argv[++index]);
    else if (arg === '--inbox') options.inboxDir = path.resolve(argv[++index]);
  }
  return options;
}

function run(argv = process.argv) {
  const options = parseArgs(argv);
  const collectionsPayload = JSON.parse(fs.readFileSync(options.collectionsPath, 'utf8'));
  const inboxFiles = readInboxFiles(options.inboxDir);
  const result = mergeExtensionInbox({ collectionsPayload, inboxFiles });

  if (options.apply && (result.accepted.length || result.processedFiles.length)) {
    fs.writeFileSync(options.collectionsPath, `${JSON.stringify(result.payload, null, 2)}\n`);
    for (const filePath of result.processedFiles) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  console.log(JSON.stringify({
    accepted: result.accepted.length,
    rejected: result.rejected.length,
    processedFiles: result.processedFiles.length,
    applied: options.apply
  }, null, 2));
  return result;
}

if (require.main === module) run();

module.exports = {
  mergeExtensionInbox,
  readInboxFiles,
  sanitizeInboxItem,
  promptFingerprint,
  collectionSourceKey
};
