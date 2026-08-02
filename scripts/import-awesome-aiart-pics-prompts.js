const fs = require('node:fs');
const path = require('node:path');
const parser = require('../extension/prompt-parser.js');
const { classifyCollection, classifyCommerceType } = require('./category-rules');
const { normalizeSourceUrl, promptFingerprint } = require('./grok-x-discovery');

const REPOSITORY = 'Jermic/awesome-aiart-pics-prompts';
const LICENSE = 'CC BY 4.0';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const MIN_PROMPT_LENGTH = 160;
const RESTRICTED_IP = /copyrighted characters|迪士尼|disney|dreamworks|皮克斯|pixar|marvel|漫威|star wars|星球大战|harry potter|哈利波特|pokemon|宝可梦|nintendo|任天堂|吉卜力|ghibli|米老鼠|minecraft|我的世界|英雄联盟|诡秘之主|inception|盗梦空间/i;
const TUTORIAL_TITLE = /教程|工作流|体验|使用指南|步骤|清单|合集|资源导航|安装|评测/i;

function cleanText(value) {
  return String(value || '')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/\r\n?/g, '\n')
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

function extractEntries(markdown) {
  const text = String(markdown || '');
  const headings = [...text.matchAll(/^### \[([^\]]+)\]\(([^)]+)\)\r?$/gm)];
  return headings.map((match, index) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = headings[index + 1]?.index ?? text.length;
    const body = text.slice(bodyStart, bodyEnd);
    const images = [...body.matchAll(/<img\s+src="(https:\/\/[^"\s]+)"[^>]*>/gi)].map(item => item[1]);
    const codeBlocks = [...body.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/g)].map(item => cleanText(item[1]));
    const authorMatch = body.match(/\*\*作者\*\*:\s*\[([^\]]+)\]\((https:\/\/[^)]+)\)/i);
    const sourceMatch = body.match(/\*\*来源\*\*:\s*\[[^\]]+\]\((https:\/\/[^)]+)\)/i);
    return {
      title: cleanText(match[1]),
      pageUrl: cleanText(match[2]),
      images: [...new Set(images.filter(isHttps))].slice(0, 5),
      codeBlocks,
      author: cleanText(authorMatch?.[1]),
      authorUrl: cleanText(authorMatch?.[2]),
      originalSourceUrl: cleanText(sourceMatch?.[1])
    };
  });
}

function cleanPrompt(value) {
  return cleanText(value)
    .replace(/^(?:nano\s+banana(?:\s+pro)?|banana)\s*prompt\s*[👇⬇️]?\s*/i, '')
    .replace(/^(?:prompt|提示词)\s*[👇⬇️]?\s*[:：-]?\s*/i, '')
    .trim();
}

function extractPrompt(entry) {
  const candidates = entry.codeBlocks
    .map(block => cleanPrompt(parser.parsePromptText(block, { titleCandidates: [entry.title] })?.prompt || block))
    .filter(prompt => parser.isCompletePrompt(prompt))
    .sort((left, right) => right.length - left.length);
  return candidates[0] || '';
}

function extractAspectRatio(text) {
  const match = String(text || '').match(/(?:aspect\s*ratio|image\s*ratio|--ar|宽高比|画幅比?|比例)\s*[:：=]?\s*(\d{1,2})\s*[:xX×]\s*(\d{1,2})|\b(\d{1,2})\s*[:xX×]\s*(\d{1,2})\s*(?:vertical|horizontal|portrait|landscape|竖版|横版|比例|画幅)/i);
  const width = Number(match?.[1] || match?.[3]);
  const height = Number(match?.[2] || match?.[4]);
  return width && height ? `${width}:${height}` : '';
}

function detectModel(text) {
  if (/gpt\s*image\s*2/i.test(text)) return 'GPT Image 2';
  if (/gpt\s*image/i.test(text)) return 'GPT Image';
  if (/nano\s*banana\s*pro/i.test(text)) return 'Nano Banana Pro';
  if (/nano\s*banana/i.test(text)) return 'Nano Banana';
  if (/midjourney|\bmj\b/i.test(text)) return 'Midjourney';
  return '通用 AI 图像模型';
}

function sourceDate(entry) {
  const date = entry.images[0]?.match(/\/images\/prompts\/(\d{4})(\d{2})(\d{2})\//);
  return date ? `${date[1]}-${date[2]}-${date[3]}` : '';
}

function entryId(entry) {
  const slug = new URL(entry.pageUrl).pathname.split('/').filter(Boolean).pop() || entry.title;
  return `awesome_aiart_pics_${slug.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 88) || 'prompt'}`;
}

function toCollection(entry, prompt, now) {
  const title = parser.normalizeAutoTitle(entry.title, prompt);
  const category = classifyCollection({ title, prompt, tags: ['AI Art Pics', detectModel(prompt)] });
  const commerceType = category === '电商视觉' ? classifyCommerceType({ title, prompt, tags: [] }) : '';
  const image = entry.images[0];
  const date = sourceDate(entry) || now.slice(0, 10);
  return {
    id: entryId(entry),
    title,
    prompt,
    category,
    ...(commerceType ? { commerceType } : {}),
    tags: [...new Set(['AI Art Pics', detectModel(prompt), entry.author.replace(/^@/, '')].filter(Boolean))].slice(0, 8),
    model: detectModel(prompt),
    mediaType: 'image',
    image,
    images: entry.images,
    rawImages: entry.images,
    referenceImages: [],
    aspectRatio: extractAspectRatio(prompt),
    source: 'awesome-aiart-pics-prompts',
    sourceUrl: entry.pageUrl,
    url: entry.pageUrl,
    archiveUrl: `https://github.com/${REPOSITORY}/blob/master/README.md`,
    ...(isHttps(entry.originalSourceUrl) ? { originalSourceUrl: entry.originalSourceUrl } : {}),
    ...(isHttps(entry.authorUrl) ? { sourceAuthorUrl: entry.authorUrl } : {}),
    sourceAuthor: entry.author,
    sourceRepository: REPOSITORY,
    license: LICENSE,
    licenseUrl: LICENSE_URL,
    attribution: `${REPOSITORY} (${LICENSE})`,
    domain: 'github.com',
    date,
    timestamp: Date.parse(now),
    collectedAt: now,
    githubSyncedAt: now,
    domesticSyncedAt: null
  };
}

function importEntries(markdown, collections, now = new Date().toISOString()) {
  const existingPrompts = new Set(collections.map(item => promptFingerprint(item.prompt)).filter(Boolean));
  const existingSources = new Set(collections.map(item => normalizeSourceUrl(item.sourceUrl || item.url)).filter(Boolean));
  const existingIds = new Set(collections.map(item => item.id).filter(Boolean));
  const accepted = [];
  const rejected = [];

  for (const entry of extractEntries(markdown)) {
    const prompt = extractPrompt(entry);
    if (!entry.images.length) {
      rejected.push({ title: entry.title, reason: 'missing result image' });
      continue;
    }
    if (!prompt) {
      rejected.push({ title: entry.title, reason: 'incomplete prompt' });
      continue;
    }
    if (TUTORIAL_TITLE.test(entry.title)) {
      rejected.push({ title: entry.title, reason: 'tutorial or workflow title' });
      continue;
    }
    if (RESTRICTED_IP.test(`${entry.title}\n${prompt}`)) {
      rejected.push({ title: entry.title, reason: 'restricted third-party IP' });
      continue;
    }
    const collection = toCollection(entry, prompt, now);
    const fingerprint = promptFingerprint(collection.prompt);
    const sourceKey = normalizeSourceUrl(collection.sourceUrl);
    if (existingPrompts.has(fingerprint)) {
      rejected.push({ title: entry.title, reason: 'duplicate prompt' });
      continue;
    }
    if (existingSources.has(sourceKey) || existingIds.has(collection.id)) {
      rejected.push({ title: entry.title, reason: 'duplicate source' });
      continue;
    }
    existingPrompts.add(fingerprint);
    existingSources.add(sourceKey);
    existingIds.add(collection.id);
    accepted.push(collection);
  }
  return { accepted, rejected };
}

function parseArgs(argv) {
  const root = path.join(__dirname, '..');
  const options = {
    input: path.join(root, 'staging', 'upstream-awesome-aiart', 'README.md'),
    collections: path.join(root, 'data', 'collections.json'),
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
  const source = fs.readFileSync(options.input, 'utf8');
  const payload = JSON.parse(fs.readFileSync(options.collections, 'utf8'));
  const collections = Array.isArray(payload) ? payload : payload.collections;
  const now = new Date().toISOString();
  const result = importEntries(source, collections, now);
  if (options.apply && result.accepted.length) {
    payload.collections = [...result.accepted, ...collections];
    payload.updatedAt = now;
    fs.writeFileSync(options.collections, `${JSON.stringify(payload, null, 2)}\n`);
  }
  const rejectedByReason = result.rejected.reduce((counts, entry) => {
    counts[entry.reason] = (counts[entry.reason] || 0) + 1;
    return counts;
  }, {});
  const summary = { sourceEntries: extractEntries(source).length, accepted: result.accepted.length, rejected: result.rejected.length, rejectedByReason, applied: options.apply };
  console.log(JSON.stringify(summary, null, 2));
  return { ...result, summary };
}

if (require.main === module) run();

module.exports = { LICENSE, MIN_PROMPT_LENGTH, extractEntries, extractPrompt, importEntries, toCollection };
