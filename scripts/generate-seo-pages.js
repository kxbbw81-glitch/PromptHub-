const fs = require('node:fs');
const path = require('node:path');
const { CATEGORIES, PROMPTS } = require('../js/data.js');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://prompthub.kxbbw81.workers.dev';
const TODAY = new Date().toISOString().slice(0, 10);

const CATEGORY_SLUGS = {
  '人像': 'portrait-prompts',
  '风景': 'landscape-prompts',
  '建筑': 'architecture-prompts',
  '科幻': 'sci-fi-prompts',
  '赛博朋克': 'cyberpunk-prompts',
  '奇幻': 'fantasy-prompts',
  '动物': 'animal-prompts',
  '静物': 'still-life-prompts',
  '美食': 'food-photography-prompts',
  '时尚': 'fashion-prompts',
  '角色': 'character-prompts',
  '抽象': 'abstract-prompts',
  '自然': 'nature-prompts',
  '城市': 'cityscape-prompts'
};

function assertInsideRoot(target) {
  const resolved = path.resolve(ROOT, target);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new Error(`Refusing to write outside project root: ${target}`);
  }
  return resolved;
}

function resetDir(name) {
  const dir = assertInsideRoot(name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function excerpt(value, length = 155) {
  const text = stripText(value);
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function promptPath(prompt) {
  return `/prompt/${encodeURIComponent(prompt.id)}/`;
}

function categorySlug(category) {
  return CATEGORY_SLUGS[category] || `${slugify(category)}-prompts`;
}

function categoryPath(category) {
  return `/category/${categorySlug(category)}/`;
}

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function pageShell({ title, description, canonical, image, body, structuredData }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonical = escapeHtml(canonical);
  const safeImage = escapeHtml(image || `${SITE_URL}/images/og-default.png`);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />
  <link rel="canonical" href="${safeCanonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:url" content="${safeCanonical}" />
  <meta property="og:image" content="${safeImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />
  <link rel="stylesheet" href="../../css/style.css?v=20260728b" />
  <style>
    body { background: #f7f8fa; }
    .seo-page { padding: 28px 0 70px; }
    .seo-layout { display: grid; grid-template-columns: minmax(0, 420px) minmax(0, 1fr); gap: 34px; align-items: start; }
    .seo-media { position: sticky; top: 86px; }
    .seo-media img { width: 100%; border-radius: 22px; object-fit: cover; box-shadow: 0 18px 50px rgba(0,0,0,.12); }
    .seo-card { background: #fff; border: 1px solid #eaeaea; border-radius: 22px; padding: 30px; box-shadow: 0 8px 28px rgba(0,0,0,.06); }
    .seo-kicker { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .seo-chip { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 999px; background: #fff5bf; color: #1a1a1a; font-size: 13px; font-weight: 800; }
    .seo-page h1 { font-size: clamp(32px, 5vw, 56px); line-height: 1.08; letter-spacing: 0; margin-bottom: 16px; }
    .seo-page h2 { font-size: 22px; margin: 28px 0 12px; }
    .seo-summary { color: #555; font-size: 17px; margin-bottom: 22px; }
    .seo-prompt { white-space: pre-wrap; line-height: 1.85; color: #333; background: #fbfbfa; border: 1px solid #eaeaea; border-radius: 16px; padding: 18px; }
    .seo-actions { display: flex; gap: 12px; flex-wrap: wrap; margin: 22px 0; }
    .seo-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 999px; background: #ffd93d; color: #1a1a1a; font-weight: 800; }
    .seo-btn.secondary { background: #1a1a1a; color: #fff; }
    .seo-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
    .seo-meta div { border: 1px solid #eaeaea; border-radius: 14px; padding: 12px; background: #fff; }
    .seo-meta span { display: block; color: #999; font-size: 12px; font-weight: 800; }
    .seo-meta strong { display: block; margin-top: 4px; font-size: 14px; }
    .seo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 18px; }
    .seo-grid-card { background:#fff; border:1px solid #eaeaea; border-radius:18px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.05); }
    .seo-grid-card img { width:100%; aspect-ratio: 4 / 3; object-fit:cover; }
    .seo-grid-card div { padding:14px; }
    .seo-grid-card strong { display:block; line-height:1.35; }
    .seo-grid-card span { color:#777; font-size:13px; }
    @media (max-width: 820px) { .seo-layout { grid-template-columns: 1fr; } .seo-media { position: static; } .seo-meta { grid-template-columns: 1fr; } .seo-card { padding: 22px; } }
  </style>
  ${structuredData.map(jsonLd).join('\n  ')}
</head>
<body>
  <header class="header">
    <div class="container">
      <a class="logo" href="../../">
        <div class="logo-icon">🍌</div>
        <span>PromptHub</span>
      </a>
      <nav class="nav">
        <a href="../../">首页</a>
        <a href="../../#/explore">探索提示词</a>
        <a href="../../#/import">📥 导入</a>
        <a href="../../#/collections">❤️ 我的收藏</a>
      </nav>
    </div>
  </header>
  ${body}
  <script src="../../js/seo-page.js?v=20260728a"></script>
</body>
</html>`;
}

function writePromptPage(prompt) {
  const canonical = `${SITE_URL}${promptPath(prompt)}`;
  const title = `${prompt.title} - ${prompt.category} AI 提示词 | PromptHub`;
  const description = excerpt(`${prompt.title}：${prompt.prompt}`);
  const tags = prompt.tags || [];
  const body = `
  <main class="seo-page">
    <div class="container seo-layout">
      <aside class="seo-media">
        <img src="${escapeHtml(prompt.image || `https://picsum.photos/seed/${prompt.id}/720/720`)}" alt="${escapeHtml(prompt.title)}" />
      </aside>
      <article class="seo-card">
        <div class="seo-kicker">
          <a class="seo-chip" href="../../category/${categorySlug(prompt.category)}/">${escapeHtml(prompt.category)} Prompts</a>
          ${tags.slice(0, 4).map(tag => `<span class="seo-chip">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <h1>${escapeHtml(prompt.title)}</h1>
        <p class="seo-summary">${escapeHtml(description)}</p>
        <div class="seo-actions">
          <button class="seo-btn" type="button" data-copy-target="prompt-text">Copy Prompt</button>
          <a class="seo-btn secondary" href="../../#/prompt/${encodeURIComponent(prompt.id)}">打开互动详情</a>
        </div>
        <div class="seo-meta">
          <div><span>Category</span><strong>${escapeHtml(prompt.category)}</strong></div>
          <div><span>Model</span><strong>${escapeHtml(prompt.model || '通用 AI 图像模型')}</strong></div>
          <div><span>Aspect Ratio</span><strong>${escapeHtml(prompt.aspectRatio || '未标注')}</strong></div>
        </div>
        <h2>Prompt</h2>
        <div class="seo-prompt" id="prompt-text">${escapeHtml(prompt.prompt)}</div>
      </article>
    </div>
  </main>`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: prompt.title,
      description,
      image: prompt.image,
      url: canonical,
      keywords: [...tags, prompt.category, 'AI prompt', 'AI image prompt'].join(', '),
      datePublished: prompt.date || TODAY,
      creator: { '@type': 'Organization', name: 'PromptHub' }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'PromptHub', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: `${prompt.category} Prompts`, item: `${SITE_URL}${categoryPath(prompt.category)}` },
        { '@type': 'ListItem', position: 3, name: prompt.title, item: canonical }
      ]
    }
  ];

  const file = assertInsideRoot(path.join('prompt', prompt.id, 'index.html'));
  ensureDir(file);
  fs.writeFileSync(file, pageShell({ title, description, canonical, image: prompt.image, body, structuredData }));
}

function writeCategoryPage(category) {
  const prompts = PROMPTS.filter(prompt => prompt.category === category.name);
  const canonical = `${SITE_URL}${categoryPath(category.name)}`;
  const title = `${category.name} AI 提示词合集 | ${categorySlug(category.name).replace(/-/g, ' ')} | PromptHub`;
  const description = `${category.name} Prompts 合集，收录 ${prompts.length} 条可直接复制的 AI 图像生成提示词，覆盖具体风格、图片参考、模型信息和标签。`;
  const body = `
  <main class="seo-page">
    <div class="container">
      <article class="seo-card">
        <div class="seo-kicker"><span class="seo-chip">${escapeHtml(category.icon || '🍌')} ${escapeHtml(category.name)}</span></div>
        <h1>${escapeHtml(category.name)} AI 提示词合集</h1>
        <p class="seo-summary">${escapeHtml(description)}</p>
        <div class="seo-actions">
          <a class="seo-btn" href="../../#/category/${encodeURIComponent(category.name)}">查看互动分类</a>
          <a class="seo-btn secondary" href="../../#/explore">Explore all prompts</a>
        </div>
      </article>
      <section style="margin-top:28px" class="seo-grid">
        ${prompts.map(prompt => `
          <a class="seo-grid-card" href="../../prompt/${encodeURIComponent(prompt.id)}/">
            <img src="${escapeHtml(prompt.image || `https://picsum.photos/seed/${prompt.id}/500/500`)}" alt="${escapeHtml(prompt.title)}" />
            <div><strong>${escapeHtml(prompt.title)}</strong><span>${escapeHtml((prompt.tags || []).slice(0, 3).join(' · '))}</span></div>
          </a>
        `).join('')}
      </section>
    </div>
  </main>`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      hasPart: prompts.map(prompt => ({ '@type': 'CreativeWork', name: prompt.title, url: `${SITE_URL}${promptPath(prompt)}` }))
    }
  ];

  const file = assertInsideRoot(path.join('category', categorySlug(category.name), 'index.html'));
  ensureDir(file);
  fs.writeFileSync(file, pageShell({ title, description, canonical, image: prompts[0]?.image, body, structuredData }));
}

function writeSitemap() {
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0' },
    { loc: `${SITE_URL}/#/explore`, priority: '0.8' },
    ...CATEGORIES.map(category => ({ loc: `${SITE_URL}${categoryPath(category.name)}`, priority: '0.8' })),
    ...PROMPTS.map(prompt => ({ loc: `${SITE_URL}${promptPath(prompt)}`, priority: '0.7' }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(assertInsideRoot('sitemap.xml'), xml);
}

function writeRobots() {
  fs.writeFileSync(assertInsideRoot('robots.txt'), `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);
}

resetDir('prompt');
resetDir('category');
PROMPTS.forEach(writePromptPage);
CATEGORIES.forEach(writeCategoryPage);
writeSitemap();
writeRobots();

console.log(`Generated ${PROMPTS.length} prompt pages and ${CATEGORIES.length} category pages for ${SITE_URL}`);
