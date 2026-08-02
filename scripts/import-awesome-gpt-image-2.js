const fs = require('node:fs');
const path = require('node:path');
const { classifyCollection, classifyCommerceType } = require('./category-rules');
const { normalizeSourceUrl, promptFingerprint } = require('./grok-x-discovery');

const MIN_PROMPT_LENGTH = 160;
const REPOSITORY = 'freestylefly/awesome-gpt-image-2';
const RAW_IMAGE_BASE = `https://raw.githubusercontent.com/${REPOSITORY}/main/data/images/`;
const IMAGE_PAGE_BASE = `https://github.com/${REPOSITORY}/blob/main/data/images/`;

const SOURCE_CATEGORY_TAGS = {
  'Architecture & Spaces': '建筑空间',
  'Brand & Logos': '品牌标志',
  'Characters & People': '角色人物',
  'Charts & Infographics': '信息图',
  'Documents & Publishing': '文档出版',
  'History & Classical Themes': '历史国风',
  'Illustration & Art': '插画艺术',
  'Other Use Cases': '其他创意',
  'Photography & Realism': '摄影写实',
  'Posters & Typography': '海报排版',
  'Products & E-commerce': '电商视觉',
  'Scenes & Storytelling': '场景叙事',
  'UI & Interfaces': '界面设计'
};

const TITLE_OVERRIDES = new Map([
  [512, '粗野自由式角色设定表'],
  [510, '比熊商店拟物App图标'],
  [416, '土象星座角色剪贴簿'],
  [389, '健身补剂品牌广告'],
  [370, '褶皱椅概念研发板']
]);

function cleanText(value) {
  return String(value || '')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
}

function imageFileName(item) {
  const fileName = path.posix.basename(String(item.image || ''));
  return /^[A-Za-z0-9._-]+$/.test(fileName) ? fileName : `case${Number(item.id)}.jpg`;
}

function normalizeTitle(item, prompt) {
  const override = TITLE_OVERRIDES.get(Number(item.id));
  if (override) return override;
  const title = cleanText(item.title).replace(/^例\s*\d+\s*[：:]\s*/, '');
  if (title && [...title].length <= 20) return title;
  const fallback = cleanText(prompt).split(/[。.!?！？\n]/)[0].slice(0, 20);
  return fallback || `GPT Image 2 案例 ${Number(item.id)}`;
}

function extractAspectRatio(prompt) {
  const match = cleanText(prompt).match(/(?:aspect\s*ratio|image\s*ratio|--ar|宽高比|画幅比?|图片比例|比例)\s*[:：=]?\s*(\d{1,2})\s*[:xX×]\s*(\d{1,2})|\b(\d{1,2})\s*[:xX×]\s*(\d{1,2})\s*(?:vertical|horizontal|portrait|landscape|竖版|横版|比例|画幅)/i);
  const width = Number(match?.[1] || match?.[3]);
  const height = Number(match?.[2] || match?.[4]);
  return width && height ? `${width}:${height}` : '';
}

function fallbackCommerceType(item) {
  const detected = classifyCommerceType(item);
  if (detected) return detected;
  const text = [item.title, item.prompt].join(' ').toLowerCase();
  if (/(detail page|详情页|卖点|功能展示)/i.test(text)) return '商品详情页';
  if (/(model wearing|try[- ]?on|模特|试穿|穿着)/i.test(text)) return '模特展示';
  if (/(poster|campaign|advertis|海报|广告|营销)/i.test(text)) return '广告海报';
  if (/(brand|logo|packaging|品牌|标志|包装)/i.test(text)) return '品牌视觉';
  if (/(lifestyle|in use|生活方式|使用场景|场景种草)/i.test(text)) return '场景种草';
  return '产品主图';
}

function mapCategory(item, tags) {
  if (item.category === 'Products & E-commerce' || item.category === 'Brand & Logos') return '电商视觉';
  if (item.category === 'Architecture & Spaces') return '建筑';

  const classified = classifyCollection({ title: item.title, prompt: item.prompt, tags });
  if (classified !== '抽象') return classified;
  if (item.category === 'Characters & People' || item.category === 'History & Classical Themes') return '角色';
  return '抽象';
}

function buildTags(item) {
  return [...new Set([
    SOURCE_CATEGORY_TAGS[item.category],
    ...(Array.isArray(item.styles) ? item.styles : []),
    ...(Array.isArray(item.scenes) ? item.scenes : []),
    'GPT Image 2'
  ].map(cleanText).filter(Boolean))].slice(0, 10);
}

function toCollection(item, now) {
  const prompt = cleanText(item.prompt);
  const fileName = imageFileName(item);
  const image = `${RAW_IMAGE_BASE}${encodeURIComponent(fileName)}`;
  const sourceUrl = `${IMAGE_PAGE_BASE}${encodeURIComponent(fileName)}`;
  const tags = buildTags(item);
  const category = mapCategory(item, tags);
  const commerceType = category === '电商视觉' ? fallbackCommerceType({ ...item, tags }) : '';
  const originalSourceUrl = isHttpsUrl(item.sourceUrl) ? String(item.sourceUrl).trim() : '';

  return {
    id: `awesome_gpt_image_2_case_${Number(item.id)}`,
    title: normalizeTitle(item, prompt),
    prompt,
    category,
    ...(commerceType ? { commerceType } : {}),
    tags,
    model: 'GPT Image 2',
    mediaType: 'image',
    image,
    images: [image],
    rawImages: [image],
    referenceImages: [],
    aspectRatio: extractAspectRatio(prompt),
    source: 'awesome-gpt-image-2 画廊',
    sourceUrl,
    url: sourceUrl,
    archiveUrl: isHttpsUrl(item.githubUrl) ? String(item.githubUrl).trim() : '',
    ...(originalSourceUrl ? { originalSourceUrl } : {}),
    sourceLabel: cleanText(item.sourceLabel),
    sourceRepository: REPOSITORY,
    license: 'MIT',
    domain: 'github.com',
    date: now.slice(0, 10),
    timestamp: Date.parse(now),
    collectedAt: now,
    githubSyncedAt: now,
    domesticSyncedAt: null
  };
}

function importCases(sourcePayload, collections, now = new Date().toISOString()) {
  const existingPrompts = new Set(collections.map(item => promptFingerprint(item.prompt)).filter(Boolean));
  const existingSources = new Set(collections.map(item => normalizeSourceUrl(item.sourceUrl || item.url)).filter(Boolean));
  const accepted = [];
  const rejected = [];

  for (const item of Array.isArray(sourcePayload?.cases) ? sourcePayload.cases : []) {
    const prompt = cleanText(item.prompt);
    if (prompt.length < MIN_PROMPT_LENGTH) {
      rejected.push({ id: item.id, reason: 'prompt shorter than 160 characters' });
      continue;
    }
    if (!item.image) {
      rejected.push({ id: item.id, reason: 'missing result image' });
      continue;
    }

    const collection = toCollection(item, now);
    const fingerprint = promptFingerprint(collection.prompt);
    const sourceKey = normalizeSourceUrl(collection.sourceUrl);
    if (existingPrompts.has(fingerprint)) {
      rejected.push({ id: item.id, reason: 'duplicate prompt' });
      continue;
    }
    if (existingSources.has(sourceKey)) {
      rejected.push({ id: item.id, reason: 'duplicate source URL' });
      continue;
    }

    existingPrompts.add(fingerprint);
    existingSources.add(sourceKey);
    accepted.push(collection);
  }

  return { accepted, rejected };
}

function parseArgs(argv) {
  const projectRoot = path.join(__dirname, '..');
  const options = {
    input: path.join(projectRoot, 'staging', 'awesome-gpt-image-2-cases.json'),
    collections: path.join(projectRoot, 'data', 'collections.json'),
    apply: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--input') options.input = path.resolve(argv[++index]);
    else if (argv[index] === '--collections') options.collections = path.resolve(argv[++index]);
    else if (argv[index] === '--apply') options.apply = true;
  }
  return options;
}

function run(argv = process.argv) {
  const options = parseArgs(argv);
  const sourcePayload = JSON.parse(fs.readFileSync(options.input, 'utf8'));
  const destinationPayload = JSON.parse(fs.readFileSync(options.collections, 'utf8'));
  const collections = Array.isArray(destinationPayload) ? destinationPayload : destinationPayload.collections;
  const now = new Date().toISOString();
  const result = importCases(sourcePayload, collections, now);

  if (options.apply && result.accepted.length) {
    destinationPayload.collections = [...result.accepted, ...collections];
    destinationPayload.updatedAt = now;
    fs.writeFileSync(options.collections, `${JSON.stringify(destinationPayload, null, 2)}\n`);
  }

  const rejectedByReason = result.rejected.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});
  const summary = {
    sourceCases: Array.isArray(sourcePayload?.cases) ? sourcePayload.cases.length : 0,
    accepted: result.accepted.length,
    rejected: result.rejected.length,
    rejectedByReason,
    applied: options.apply
  };
  console.log(JSON.stringify(summary, null, 2));
  return { ...result, summary };
}

if (require.main === module) run();

module.exports = {
  MIN_PROMPT_LENGTH,
  buildTags,
  extractAspectRatio,
  importCases,
  mapCategory,
  normalizeTitle,
  toCollection
};
