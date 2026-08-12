const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const parser = require('../extension/prompt-parser');
const { classifyCollection, classifyCommerceType } = require('./category-rules');
const { normalizeSourceUrl, promptFingerprint } = require('./grok-x-discovery');

const PROJECT_ROOT = path.join(__dirname, '..');
const FEED_URL = 'https://jimeng.jianying.com/jsonp/mweb/v1/get_explore';
const HOME_URL = 'https://jimeng.jianying.com/ai-tool/home';
const SITE_ASSET_BASE = 'https://kxbbw81-glitch.github.io/PromptHub-/assets/jimeng/';
const DEFAULT_LIMIT = 30;
const DEFAULT_PAGES = 8;
const PAGE_SIZE = 20;
const MIN_PROMPT_LENGTH = 80;
const JIMENG_TITLE_RULES = [
  ['故障人影抽象海报', /VHS故障|故障风格|模糊人影/],
  ['Q版孙悟空背影', /孙悟空[\s\S]{0,80}背部特写/],
  ['书法佛经空间', /书法和佛经|佛经[\s\S]{0,80}小人/],
  ['赛博妖刀将军', /妖刀将军|银红色妖刀/],
  ['Q萌猫咪宝宝', /猫咪宝宝/],
  ['粒子鱼尾海报', /鱼尾轮廓|渐变粒子/],
  ['Q萌苍蝇特写', /绿头苍蝇|苍蝇脸部/],
  ['举人赶考插画', /京城二举人赶考|二举人赶考/],
  ['古檐文字瀑布海报', /文字创意排版|文字构成瀑布/],
  ['机械姬人像', /机械姬|仿生机械肌肤/],
  ['机器人牛仔设定', /机器人牛仔|科幻西部/],
  ['榴莲精灵设计稿', /榴莲精灵|榴莲.*设计草图/],
  ['宙斯遗迹神殿', /宙斯|科技废墟|未知遗迹/],
  ['山水书法道士', /道士[\s\S]{0,80}书法|山水国画/],
  ['京剧戏魔设定', /京剧戏魔|华夏民俗恐怖/],
  ['市井水彩写生', /钢笔水彩写生|柴米油盐|市井百态/],
  ['符文服饰角色', /魔幻服饰|符文和经文/],
  ['暗黑小丑海报', /暗黑版小丑|小丑/]
];

function jimengTitleFromPrompt(prompt, fallbackTitle) {
  const value = cleanText(prompt);
  const matched = JIMENG_TITLE_RULES.find(([, pattern]) => pattern.test(value));
  if (matched) return matched[0];
  return parser.normalizeAutoTitle(fallbackTitle || '', value);
}
function refineJimengCategory(prompt, category) {
  const value = cleanText(prompt);
  if (/(文字创意排版|文字构成瀑布|海报|粒子.*鱼尾|丝网印刷|招贴|字体|书法字体)/.test(value)) return '品牌视觉';
  if (/(猫咪宝宝|绿头苍蝇|皮毛质感|绒毛材质)/.test(value)) return '动物';
  if (/(机械姬|赛博朋克|科幻|机器人|未来主义)/.test(value)) return category === '赛博朋克' ? '赛博朋克' : '科幻';
  if (/(孙悟空|京城二举人赶考|榴莲精灵|机器人牛仔|角色设定|人物线条)/.test(value)) return '角色';
  if (/(宙斯|未知遗迹|道士|京剧戏魔|玄幻|魔幻服饰|符文和经文)/.test(value)) return '奇幻';
  return category;
}

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

function buildFeedUrl(offset) {
  const url = new URL(FEED_URL);
  url.searchParams.set('category_id', '11222');
  url.searchParams.set('_callback', 'cb');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('count', String(PAGE_SIZE));
  url.searchParams.set('feed_refer', 'feed_enterauto');
  url.searchParams.set('filter', JSON.stringify({ work_type_list: ['video', 'image', 'canvas'] }));
  url.searchParams.set('image_info', JSON.stringify({ width: 2048, height: 2048, format: 'webp' }));
  return url.toString();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      referer: HOME_URL,
      'user-agent': 'Mozilla/5.0 PromptHub public importer'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function parseJsonp(value) {
  const json = String(value || '')
    .replace(/^var __get_explore_result = /, '')
    .replace(/;typeof cb==='function'&&cb\(\);?\s*$/, '')
    .trim();
  return JSON.parse(json);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function walk(value, visitor) {
  if (!value || typeof value !== 'object') return;
  visitor(value);
  if (Array.isArray(value)) {
    value.forEach(item => walk(item, visitor));
    return;
  }
  Object.values(value).forEach(item => walk(item, visitor));
}

function extractPrompt(item) {
  const candidates = [];
  const params = item.aigc_image_params || item.aigcImageParams || {};
  if (params.text2imageParams?.actualPrompt) candidates.push(params.text2imageParams.actualPrompt);
  if (params.text2imageParams?.prompt) candidates.push(params.text2imageParams.prompt);
  if (params.text2videoParams?.videoGenInputs?.[0]?.prompt) candidates.push(params.text2videoParams.videoGenInputs[0].prompt);

  const draft = parseJson(item.aigc_draft?.content);
  walk(draft, node => {
    if (typeof node.prompt === 'string') candidates.push(node.prompt);
    if (typeof node.actual_prompt === 'string') candidates.push(node.actual_prompt);
    if (typeof node.actualPrompt === 'string') candidates.push(node.actualPrompt);
  });

  candidates.push(item.common_attr?.description);
  return cleanText(candidates.find(candidate => cleanText(candidate).length >= MIN_PROMPT_LENGTH) || '');
}

function extractModel(item) {
  const candidates = [];
  const params = item.aigc_image_params || item.aigcImageParams || {};
  candidates.push(params.text2imageParams?.modelConfig?.modelName);
  candidates.push(params.text2videoParams?.modelConfig?.modelName);
  candidates.push(params.text2videoParams?.videoModelConfig?.modelName);

  const draft = parseJson(item.aigc_draft?.content);
  walk(draft, node => {
    if (typeof node.model === 'string') candidates.push(node.model);
    if (typeof node.model_name === 'string') candidates.push(node.model_name);
    if (typeof node.modelName === 'string') candidates.push(node.modelName);
  });

  const raw = cleanText(candidates.find(Boolean));
  if (/v46|4\.6|general_v4\.6/i.test(raw)) return '即梦 图片 4.6';
  if (/v41|4\.1|general_v4\.1/i.test(raw)) return '即梦 图片 4.1';
  if (/v40|4\.0|general_v4\.0/i.test(raw)) return '即梦 图片 4.0';
  if (/v30|3\.0|general_v3\.0/i.test(raw)) return '即梦 图片 3.0';
  if (/video|seedance|视频/i.test(raw)) return '即梦 视频模型';
  return raw ? `即梦 ${raw}` : '即梦AI';
}

function extractCoverUrl(item) {
  const map = item.common_attr?.cover_url_map || {};
  return map['2048'] || map['1080'] || map['720'] || item.common_attr?.cover_url || '';
}

function toAspectRatio(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  const known = [
    [1, '1:1'],
    [0.75, '3:4'],
    [0.5625, '9:16'],
    [1.7777777778, '16:9'],
    [1.3333333333, '4:3'],
    [0.6666666667, '2:3'],
    [1.5, '3:2']
  ];
  const matched = known.find(([candidate]) => Math.abs(candidate - ratio) < 0.02);
  return matched ? matched[1] : ratio.toFixed(2);
}

function mediaTypeFor(item) {
  return Number(item.common_attr?.effect_type) === 53 ? 'video' : 'image';
}

function sourceUrlFor(item) {
  const id = cleanText(item.common_attr?.id || item.common_attr?.published_item_id);
  const mediaType = mediaTypeFor(item);
  const itemType = mediaType === 'video' ? 53 : 9;
  const detailType = mediaType === 'video' ? 'AiVideo' : 'Image';
  return id ? `https://jimeng.jianying.com/ai-tool/work-detail/${id}?itemType=${itemType}&workDetailType=${detailType}` : HOME_URL;
}

function pickExtension(url, mediaType) {
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  })();
  const ext = path.extname(pathname).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  return mediaType === 'video' ? '.webp' : '.webp';
}

async function downloadAsset(url, id, mediaType, assetsDir) {
  if (!isHttpsUrl(url)) throw new Error(`invalid media url for ${id}`);
  fs.mkdirSync(assetsDir, { recursive: true });
  const ext = pickExtension(url, mediaType);
  const fileName = `${id}${ext}`;
  const filePath = path.join(assetsDir, fileName);
  if (!fs.existsSync(filePath)) {
    const response = await fetch(url, {
      headers: {
        referer: HOME_URL,
        'user-agent': 'Mozilla/5.0 PromptHub public importer'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${id}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1024) throw new Error(`downloaded asset too small for ${id}`);
    fs.writeFileSync(filePath, buffer);
  }
  return `${SITE_ASSET_BASE}${encodeURIComponent(fileName)}`;
}

function makeTags(item, mediaType, category, commerceType) {
  return [...new Set([
    '即梦AI',
    mediaType === 'video' ? '视频提示词' : '图片提示词',
    category,
    commerceType,
    cleanText(item.common_attr?.title)
  ].filter(Boolean))].slice(0, 10);
}

function toCollection(item, prompt, image, now) {
  const mediaType = mediaTypeFor(item);
  const id = `jimeng_${cleanText(item.common_attr?.id || item.common_attr?.published_item_id)}`;
  const title = jimengTitleFromPrompt(prompt, item.common_attr?.title || '');
  const base = {
    id,
    title,
    prompt,
    image,
    images: [image],
    rawImages: [image],
    referenceImages: [],
    aspectRatio: toAspectRatio(item.common_attr?.aspect_ratio),
    mediaType,
    model: extractModel(item),
    source: '即梦AI公开页面',
    sourceUrl: sourceUrlFor(item),
    url: sourceUrlFor(item),
    domain: 'jimeng.jianying.com',
    sourceAuthor: cleanText(item.author?.name || item.author?.nickname),
    sourceAuthorUrl: '',
    date: now.slice(0, 10),
    collectedAt: now,
    githubSyncedAt: now,
    domesticSyncedAt: null,
    timestamp: Date.parse(now)
  };
  const category = refineJimengCategory(prompt, classifyCollection(base));
  const commerceType = classifyCommerceType({ ...base, category });
  return {
    ...base,
    category,
    ...(commerceType ? { commerceType } : {}),
    tags: makeTags(item, mediaType, category, commerceType)
  };
}

function parseArgs(argv) {
  const options = {
    collections: path.join(PROJECT_ROOT, 'data', 'collections.json'),
    assetsDir: path.join(PROJECT_ROOT, 'assets', 'jimeng'),
    report: path.join(PROJECT_ROOT, 'reports', 'jimeng_batch_collection_report.html'),
    limit: DEFAULT_LIMIT,
    pages: DEFAULT_PAGES,
    apply: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--limit') options.limit = Number(argv[++index]);
    else if (arg === '--pages') options.pages = Number(argv[++index]);
    else if (arg === '--collections') options.collections = path.resolve(argv[++index]);
    else if (arg === '--report') options.report = path.resolve(argv[++index]);
  }
  options.limit = Math.max(1, Number.isFinite(options.limit) ? options.limit : DEFAULT_LIMIT);
  options.pages = Math.max(1, Number.isFinite(options.pages) ? options.pages : DEFAULT_PAGES);
  return options;
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function writeReport(filePath, summary, accepted, rejected) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rows = accepted.map(item => `
    <tr>
      <td><img src="${htmlEscape(item.image)}" alt=""></td>
      <td>${htmlEscape(item.title)}</td>
      <td>${htmlEscape(item.category)}${item.commerceType ? ` / ${htmlEscape(item.commerceType)}` : ''}</td>
      <td>${htmlEscape(item.aspectRatio || '-')}</td>
      <td><a href="${htmlEscape(item.sourceUrl)}">公开详情页</a></td>
    </tr>`).join('');
  const rejectRows = rejected.slice(0, 80).map(item => `
    <tr><td>${htmlEscape(item.id || '-')}</td><td>${htmlEscape(item.reason)}</td></tr>`).join('');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>即梦批量采集报告</title>
<style>
body{margin:0;background:#f6f7f9;color:#171a1f;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px}
.hero{background:#111;border-radius:18px;color:#fff;padding:28px 32px}
.hero h1{margin:0 0 8px;font-size:30px}
.hero p{margin:0;color:#c9cdd4}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px}
.num{font-size:28px;font-weight:800}
.label{color:#667085;margin-top:4px}
section{background:#fff;border:1px solid #e5e7eb;border-radius:14px;margin-top:18px;padding:18px}
h2{font-size:18px;margin:0 0 14px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #edf0f3;padding:12px;text-align:left;vertical-align:middle}
th{color:#667085;font-size:13px}
img{width:88px;height:88px;object-fit:cover;border-radius:10px;background:#eee}
a{color:#155eef;text-decoration:none}
.note{color:#667085;line-height:1.8}
</style>
</head>
<body><div class="wrap">
<div class="hero"><h1>即梦AI公开 Feed · 批量采集报告</h1><p>来源: ${HOME_URL} | 时间: ${htmlEscape(summary.now)} | 只采集公开接口中提示词完整且媒体可用的作品</p></div>
<div class="stats">
  <div class="card"><div class="num">${summary.scanned}</div><div class="label">扫描作品</div></div>
  <div class="card"><div class="num">${summary.accepted}</div><div class="label">新增入库</div></div>
  <div class="card"><div class="num">${summary.rejected}</div><div class="label">跳过/拒绝</div></div>
  <div class="card"><div class="num">${summary.applied ? '已写入' : '预览'}</div><div class="label">执行模式</div></div>
</div>
<section><h2>处理说明</h2><p class="note">即梦首页展示很多作品，但首页 HTML 不直接包含详情链接；本次使用其公开 JSONP Feed 分页读取。原始封面 URL 带过期签名，所以已下载到仓库 <strong>assets/jimeng/</strong> 后再写入收藏，避免图片后续失效。</p></section>
<section><h2>本次新增</h2><table><thead><tr><th>图片</th><th>标题</th><th>分类</th><th>比例</th><th>来源</th></tr></thead><tbody>${rows || '<tr><td colspan="5">无新增</td></tr>'}</tbody></table></section>
<section><h2>跳过原因样本</h2><table><thead><tr><th>ID</th><th>原因</th></tr></thead><tbody>${rejectRows || '<tr><td colspan="2">无</td></tr>'}</tbody></table></section>
</div></body></html>`;
  fs.writeFileSync(filePath, html, 'utf8');
}

async function run(argv = process.argv) {
  const options = parseArgs(argv);
  const payload = JSON.parse(fs.readFileSync(options.collections, 'utf8'));
  const collections = Array.isArray(payload) ? payload : payload.collections;
  const existingIds = new Set(collections.map(item => item.id));
  const existingPrompts = new Set(collections.map(item => promptFingerprint(item.prompt)).filter(Boolean));
  const existingSources = new Set(collections.map(item => normalizeSourceUrl(item.sourceUrl || item.url)).filter(Boolean));
  const now = new Date().toISOString();
  const accepted = [];
  const rejected = [];
  let offset = 0;
  let scanned = 0;

  for (let page = 0; page < options.pages && accepted.length < options.limit; page += 1) {
    const feed = parseJsonp(await fetchText(buildFeedUrl(offset)));
    const list = Array.isArray(feed.data?.item_list) ? feed.data.item_list : [];
    if (!list.length) break;
    for (const item of list) {
      scanned += 1;
      const rawId = cleanText(item.common_attr?.id || item.common_attr?.published_item_id);
      const id = `jimeng_${rawId}`;
      if (!rawId) {
        rejected.push({ id: '', reason: 'missing item id' });
        continue;
      }
      if (existingIds.has(id)) {
        rejected.push({ id, reason: 'duplicate id' });
        continue;
      }

      const prompt = extractPrompt(item);
      if (!parser.isAutoCollectablePrompt(prompt)) {
        rejected.push({ id, reason: 'prompt incomplete or low quality' });
        continue;
      }

      const sourceUrl = sourceUrlFor(item);
      const sourceKey = normalizeSourceUrl(sourceUrl);
      if (existingSources.has(sourceKey)) {
        rejected.push({ id, reason: 'duplicate source URL' });
        continue;
      }
      const fingerprint = promptFingerprint(prompt);
      if (existingPrompts.has(fingerprint)) {
        rejected.push({ id, reason: 'duplicate prompt' });
        continue;
      }

      const coverUrl = extractCoverUrl(item);
      if (!isHttpsUrl(coverUrl)) {
        rejected.push({ id, reason: 'missing HTTPS media' });
        continue;
      }

      try {
        const image = await downloadAsset(coverUrl, id, mediaTypeFor(item), options.assetsDir);
        const collection = toCollection(item, prompt, image, now);
        accepted.push(collection);
        existingIds.add(id);
        existingSources.add(sourceKey);
        existingPrompts.add(fingerprint);
        if (accepted.length >= options.limit) break;
      } catch (error) {
        rejected.push({ id, reason: error.message });
      }
    }
    if (!feed.data?.has_more) break;
    offset = Number(feed.data?.next_offset);
    if (!Number.isFinite(offset)) break;
  }

  if (options.apply && accepted.length) {
    payload.collections = [...accepted, ...collections];
    payload.updatedAt = now;
    fs.writeFileSync(options.collections, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  const summary = {
    now,
    scanned,
    accepted: accepted.length,
    rejected: rejected.length,
    applied: options.apply,
    report: options.report
  };
  writeReport(options.report, summary, accepted, rejected);
  console.log(JSON.stringify(summary, null, 2));
  return { summary, accepted, rejected };
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildFeedUrl,
  extractModel,
  extractPrompt,
  parseJsonp,
  run,
  toAspectRatio,
  toCollection
};




