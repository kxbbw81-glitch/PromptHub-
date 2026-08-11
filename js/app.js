// ==========================================
// PromptHub - Application Logic
// ==========================================

(function () {
  'use strict';

  // --- State ---
  let currentRoute = 'home';
  let currentCategory = 'All';
  let currentCommerceType = 'All';
  let currentContentType = 'All';
  let currentStyle = 'All';
  let currentScene = 'All';
  let currentSearch = '';
  let currentPage = 1;
  let detailReturnContext = null;
  let exploreVisibleCount = 0;
  let exploreLoadObserver = null;
  const EXPLORE_INITIAL_BATCH = 36;
  const EXPLORE_BATCH_SIZE = 24;

  // --- Collections (GitHub is the canonical source) ---
  const PRIMARY_COLLECTIONS_URL = 'data/collections.json';
  const DOMESTIC_COLLECTIONS_URL = '/data/collections.json?v=20260729b';
  const DOMESTIC_HOST = 'prompthub.kxbbw81.workers.dev';
  let collectionsCache = [];
  let collectionsLoading = null;
  let extensionBridgeReady = false;
  const security = window.PromptHubSecurity;
  const { escapeHtml, sanitizeImageUrl, sanitizeImageUrls } = security || {};
  const exploreFacets = window.PromptHubExploreFacets;
  const dailyCuration = window.PromptHubDailyCuration;

  if (!security || !exploreFacets || !dailyCuration) {
    throw new Error('PromptHubSecurity, PromptHubExploreFacets, and PromptHubDailyCuration are required before app.js');
  }

  // --- 分类旧英文名称映射到中文（兼容已有收藏数据）---
  const CATEGORY_LEGACY_MAP = {
    'Portrait': '人像',
    'Landscape': '风景',
    'Architecture': '建筑',
    'Sci-Fi': '科幻',
    'Cyberpunk': '赛博朋克',
    'Fantasy': '奇幻',
    'Animals': '动物',
    'Still Life': '静物',
    'Food': '美食',
    'Fashion': '时尚',
    'Character': '角色',
    'Abstract': '抽象',
    'Nature': '自然',
    'Cityscape': '城市',
    'Video': '视频提示词',
    '视频': '视频提示词',
    'portrait': '人像',
    'fashion': '时尚',
    'product': '静物',
    'cinematic': '人像',
    'video': '视频提示词',
    'ecommerce': '电商视觉',
    'e-commerce': '电商视觉',
    '电商': '电商视觉'
  };

  const COMMERCE_TYPES = [
    { name: '产品主图', signals: ['product hero', 'product shot', 'packshot', 'white background', '产品主图', '白底图', '商品主图'] },
    { name: '场景种草', signals: ['lifestyle product', 'product in use', '场景种草', '使用场景', '生活方式产品'] },
    { name: '广告海报', signals: ['product ad', 'advertising poster', '广告海报', '商品广告', '营销海报'] },
    { name: '商品详情页', signals: ['product detail page', 'product feature', '详情页', '商品卖点', '功能展示'] },
    { name: '模特展示', signals: ['model wearing', 'product try-on', '模特展示', '试穿', '商品展示模特'] },
    { name: 'UGC / 口碑', signals: ['ugc', 'unboxing', 'product review', 'testimonial', '开箱', '测评', '口碑'] },
    { name: '品牌视觉', signals: ['brand campaign', 'brand visual', 'key visual', 'brand identity', 'visual identity', 'logo design', 'logo proposal', 'vi proposal', '品牌视觉', '品牌广告', '品牌活动', '品牌识别', '视觉识别', '标志设计', 'logo提案', 'vi提案'] },
    { name: '电商视频', signals: ['ecommerce video', 'product video', 'video ad', '电商视频', '商品视频', '短视频广告'] }
  ];

  const COMMERCE_FILTERS = [
    { id: 'AllCommerce', label: '全部电商' },
    ...COMMERCE_TYPES.map(type => ({ id: type.name, label: type.name }))
  ];

  const LEGACY_CATEGORY_FACETS = {
    '电商视觉': { commerceType: 'AllCommerce' },
    '人像': { contentType: 'people' },
    '角色': { contentType: 'people' },
    '风景': { contentType: 'nature' },
    '自然': { contentType: 'nature' },
    '动物': { contentType: 'nature' },
    '建筑': { contentType: 'architecture' },
    '静物': { contentType: 'photography' },
    '视频提示词': { contentType: 'video' },
    '科幻': { style: 'future' },
    '赛博朋克': { style: 'future' },
    '奇幻': { style: 'fantasy' },
    '抽象': { style: 'abstract' },
    '美食': { scene: 'food' },
    '时尚': { scene: 'fashion' },
    '城市': { scene: 'city' }
  };

  function detectCommerceType(item = {}) {
    if (COMMERCE_TYPES.some(type => type.name === item.commerceType)) return item.commerceType;
    const text = [item.title, item.prompt, ...(Array.isArray(item.tags) ? item.tags : [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return COMMERCE_TYPES.find(type => type.signals.some(signal => text.includes(signal)))?.name || '';
  }

  function normalizeCategory(cat) {
    if (!cat) return '抽象';
    const value = String(cat).trim();
    return CATEGORY_LEGACY_MAP[value] || CATEGORY_LEGACY_MAP[value.toLowerCase()] || value;
  }

  function mergeLegacyCategoryIntoExplore(category) {
    const mapping = LEGACY_CATEGORY_FACETS[normalizeCategory(category)];
    if (!mapping) return;
    currentCategory = 'All';
    if (currentContentType === 'All' && mapping.contentType) currentContentType = mapping.contentType;
    if (currentStyle === 'All' && mapping.style) currentStyle = mapping.style;
    if (currentScene === 'All' && mapping.scene) currentScene = mapping.scene;
    if (currentCommerceType === 'All' && mapping.commerceType) currentCommerceType = mapping.commerceType;
  }

  function limitedText(value, maxLength) {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  function collectionFingerprint(item) {
    return String(item?.prompt ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findDuplicateCollection(items, item) {
    const fingerprint = collectionFingerprint(item);
    if (!fingerprint) return null;
    return items.find(entry => collectionFingerprint(entry) === fingerprint) || null;
  }

  function normalizeTags(tags) {
    const values = Array.isArray(tags) ? tags : [];
    return [...new Set(values
      .map(tag => limitedText(tag, 48))
      .filter(Boolean))]
      .slice(0, 12);
  }

  function fallbackImage(id, size = 500) {
    return `https://picsum.photos/seed/${encodeURIComponent(limitedText(id, 120) || 'fallback')}/${size}/${size}`;
  }

  function normalizeCollectionItem(item) {
    if (!item || typeof item !== 'object') return null;

    const prompt = limitedText(item.prompt, 30000);
    const tags = normalizeTags(item.tags);
    const commerceType = detectCommerceType({ ...item, prompt, tags });
    const requestedCategory = normalizeCategory(limitedText(item.category, 32));
    const categoryText = [item.title, ...tags, prompt].filter(Boolean).join(' ');
    const category = commerceType
      ? '电商视觉'
      : item.mediaType === 'video'
      ? '视频提示词'
      : CATEGORIES.some(option => option.name === requestedCategory)
        ? requestedCategory
        : autoCategorize(categoryText);
    const images = sanitizeImageUrls([
      ...(Array.isArray(item.images) ? item.images : []),
      item.image
    ]);

    return {
      ...item,
      id: limitedText(item.id, 120),
      title: limitedText(item.title, 180),
      prompt,
      category,
      commerceType,
      tags,
      image: images[0] || '',
      images,
      rawImages: images,
      referenceImages: sanitizeImageUrls(item.referenceImages),
      aspectRatio: limitedText(item.aspectRatio, 32),
      model: limitedText(item.model, 100),
      source: limitedText(item.source, 100),
      sourceUrl: sanitizeImageUrl(item.sourceUrl),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? item.date : ''
    };
  }

  function isDomesticSite() {
    return window.location.hostname === DOMESTIC_HOST;
  }

  function getCollectionsUrl() {
    // The domestic deployment already contains the released data. Avoid making
    // visitors wait for external GitHub raw endpoints from inside mainland China.
    return isDomesticSite() ? DOMESTIC_COLLECTIONS_URL : PRIMARY_COLLECTIONS_URL;
  }

  function getCollectionsRequestUrl() {
    const url = new URL(getCollectionsUrl(), window.location.href);
    if (!isDomesticSite()) url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }

  function getCollectionSortTime(item) {
    const candidates = [item?.collectedAt, item?.githubSyncedAt, item?.timestamp, item?.date];
    for (const value of candidates) {
      const time = typeof value === 'number' ? value : Date.parse(String(value || ''));
      if (Number.isFinite(time)) return time;
    }
    return 0;
  }

  function getCollections() {
    return collectionsCache
      .map(normalizeCollectionItem)
      .filter(item => item?.id && item.title && item.prompt)
      .filter(item => !isDomesticSite() || Boolean(item.domesticSyncedAt))
      .sort((left, right) => getCollectionSortTime(right) - getCollectionSortTime(left));
  }

  async function loadCollections({ force = false } = {}) {
    if (collectionsLoading && !force) return collectionsLoading;

    const request = (async () => {
      const response = await fetch(getCollectionsRequestUrl(), {
        // The primary site needs the latest GitHub write immediately. The
        // domestic site revalidates its local, released asset instead.
        cache: isDomesticSite() ? 'no-cache' : 'no-store'
      });
      if (!response.ok) throw new Error(`Unable to load collections (${response.status})`);
      const payload = await response.json();
      const list = Array.isArray(payload) ? payload : payload?.collections;
      collectionsCache = Array.isArray(list) ? list : [];
      return getCollections();
    })();

    collectionsLoading = request;
    try {
      return await request;
    } finally {
      if (collectionsLoading === request) collectionsLoading = null;
    }
  }

  function requestCollectionMutation(operation, item) {
    if (!extensionBridgeReady) {
      showToast('请先安装并配置 PromptHub 浏览器插件，再保存收藏');
      return false;
    }
    window.postMessage({ source: 'prompthub-site', operation, item }, window.location.origin);
    return true;
  }

  function saveCollection(item) {
    const safeItem = normalizeCollectionItem(item);
    if (!safeItem?.id || !safeItem.title || !safeItem.prompt) return false;
    if (getCollections().some(c => c.id === safeItem.id) || findDuplicateCollection(getCollections(), safeItem)) return false;
    const collectedItem = { ...safeItem, collectedAt: safeItem.collectedAt || new Date().toISOString() };
    if (!requestCollectionMutation('create', collectedItem)) return false;
    collectionsCache = [collectedItem, ...collectionsCache.filter(c => c?.id !== collectedItem.id)];
    return true;
  }

  function updateCollection(id, patch) {
    const index = collectionsCache.findIndex(c => c?.id === id);
    if (index === -1) return null;

    const now = new Date().toISOString();
    const previous = normalizeCollectionItem(collectionsCache[index]);
    const next = normalizeCollectionItem({
      ...previous,
      ...patch,
      id: previous.id,
      date: previous.date || now.slice(0, 10),
      updatedAt: now
    });
    if (!next?.title || !next.prompt || !requestCollectionMutation('update', next)) return null;
    collectionsCache[index] = next;
    return next;
  }

  function deleteCollection(id) {
    const item = collectionsCache.find(c => c?.id === id);
    if (!item || !requestCollectionMutation('delete', { id })) return false;
    collectionsCache = collectionsCache.filter(c => c?.id !== id);
    return true;
  }

  function saveOrUpdateCollection(item, patch) {
    const existing = collectionsCache.find(entry => entry?.id === item.id);
    if (existing) return updateCollection(item.id, patch);

    const now = new Date().toISOString();
    const next = normalizeCollectionItem({
      ...item,
      ...patch,
      id: item.id,
      date: item.date || now.slice(0, 10),
      source: item.source || 'PromptHub 编辑',
      updatedAt: now
    });
    return next && saveCollection(next) ? next : null;
  }

  function isCollected(id) {
    return getCollections().some(c => c.id === id);
  }

  function generateId() {
    return 'col_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  // --- Auto-categorize & auto-tag (shared) ---
  // 分类依据：根据提示词词根（英文原词 + 中文同义词）判断
  const CAT_KEYWORDS = {
    '人像': ['portrait', 'face', 'model', 'person', 'woman', 'man', 'selfie', 'headshot', 'girl', 'boy', 'people', 'human',
             '人像', '人物', '肖像', '人脸', '女性', '男性', '女孩', '男孩', '少女', '模特', '自拍'],
    '风景': ['landscape', 'mountain', 'sunrise', 'sunset', 'valley', 'horizon', 'forest', 'lake', 'ocean', 'scene', 'scenery',
             '风景', '风光', '山', '日出', '日落', '山谷', '湖泊', '海洋', '地平线', '景色'],
    '建筑': ['architecture', 'building', 'interior', 'facade', 'modern house', 'skyscraper', 'structure',
             '建筑', '室内', '摩天大楼', '房屋', '立面', '现代建筑', '空间'],
    '科幻': ['sci-fi', 'space', 'futuristic', 'robot', 'alien', 'spaceship', 'cyber', 'galaxy', 'mars', 'spacecraft', 'astronaut',
             '科幻', '太空', '未来', '机器人', '外星人', '飞船', '星系', '火星', '宇航员'],
    '赛博朋克': ['cyberpunk', 'neon', 'cyber', 'hologram', 'dystopian', 'night city', 'megacity',
                 '赛博朋克', '赛博', '霓虹', '全息', '反乌托邦', '夜之城'],
    '奇幻': ['fantasy', 'dragon', 'wizard', 'magic', 'elf', 'dungeon', 'castle', 'knight', 'mythical', 'fairy',
             '奇幻', '龙', '巫师', '魔法', '精灵', '城堡', '骑士', '神话', '童话'],
    '动物': ['animal', 'dog', 'cat', 'lion', 'wolf', 'bird', 'wildlife', 'fox', 'tiger', 'eagle', 'puppy', 'kitten',
             '动物', '狗', '猫', '狮子', '狼', '鸟', '野生动物', '狐狸', '老虎', '鹰'],
    '静物': ['still life', 'vase', 'fruit', 'flowers arrangement', 'tabletop', 'bouquet',
             '静物', '花瓶', '水果', '花卉', '摆盘', '花束'],
    '美食': ['food', 'dish', 'cuisine', 'restaurant', 'sushi', 'pizza', 'coffee', 'dessert', 'cake', 'beverage', 'cocktail',
             '美食', '食物', '料理', '餐厅', '寿司', '披萨', '咖啡', '甜点', '蛋糕', '饮品'],
    '时尚': ['fashion', 'outfit', 'runway', 'couture', 'dress', 'streetwear', 'apparel', 'model wearing',
             '时尚', '服装', '穿搭', '走秀', '礼服', '街拍', '时装'],
    '角色': ['character', 'concept art', 'hero', 'villain', 'npc', 'warrior', 'samurai', 'protagonist', 'avatar',
             '角色', '概念艺术', '英雄', '反派', '战士', '武士', '主角'],
    '抽象': ['abstract', 'swirl', 'geometric', 'pattern', 'texture', 'fractal', 'minimalist', 'gradient',
             '抽象', '几何', '图案', '纹理', '分形', '极简', '渐变'],
    '自然': ['forest', 'flower', 'tree', 'ocean', 'river', 'leaf', 'butterfly', 'garden', 'waterfall', 'meadow', 'rainforest',
             '自然', '森林', '花', '树', '河流', '叶子', '蝴蝶', '花园', '瀑布', '草地', '雨林'],
    '城市': ['city', 'urban', 'skyline', 'street', 'cityscape', 'downtown', 'avenue', 'metropolis',
             '城市', '都市', '天际线', '街道', '市中心', '都会', '城景']
  };

  const TAG_KEYWORDS = [
    'cinematic', 'photorealistic', 'oil painting', 'watercolor', 'digital art',
    'anime', 'minimalist', 'dark', 'dreamy', 'vintage', 'macro', 'bokeh',
    'golden hour', 'studio lighting', '8k', 'ultra detailed', 'hyperrealistic',
    'concept art', 'octane render', 'unreal engine', 'trending on artstation',
    'cyberpunk', 'steampunk', 'low poly', 'pixel art'
  ];

  function autoCategorize(text) {
    if (detectCommerceType({ prompt: text })) return '电商视觉';
    const lower = (text || '').toLowerCase();
    let category = '抽象';
    let maxScore = 0;
    for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
      const score = keywords.reduce((s, kw) => s + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
      if (score > maxScore) { maxScore = score; category = cat; }
    }
    return category;
  }

  function autoDetectTags(text) {
    const lower = (text || '').toLowerCase();
    const tags = TAG_KEYWORDS.filter(t => lower.includes(t));
    return tags.length > 0 ? tags.slice(0, 5) : ['AI生成'];
  }

  // --- DOM Helpers ---
  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => parent.querySelectorAll(sel);

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const key in attrs) {
      if (key === 'class') node.className = attrs[key];
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    }
    children.flat().forEach(child => {
      if (child == null) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  // --- Toast ---
  let toastTimer = null;
  function showToast(message) {
    let toast = $('#toast');
    if (!toast) {
      toast = el('div', { id: 'toast', class: 'toast' });
      document.body.appendChild(toast);
    }
    toast.replaceChildren(
      el('span', { class: 'toast-icon' }, '✓'),
      document.createTextNode(String(message ?? ''))
    );
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // --- Copy to Clipboard ---
  function copyPrompt(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('提示词已复制到剪贴板');
      if (btn) {
        const original = btn.textContent;
        btn.classList.add('copied');
        btn.textContent = '已复制 ✓';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = original;
        }, 2000);
      }
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('提示词已复制到剪贴板');
    });
  }

  function getAllPromptItems() {
    const collections = getCollections().map(c => ({ ...c, isCollection: true, verified: false, likes: 0 }));
    return [...collections, ...PROMPTS];
  }

  function findPromptById(id, isCollection) {
    if (isCollection) return getCollections().find(c => c.id === id);
    return PROMPTS.find(p => p.id === id) || getCollections().find(c => c.id === id);
  }

  function escapeJsString(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, ' ');
  }

  function getExploreHash() {
    const params = new URLSearchParams();
    if (currentCategory !== 'All') params.set('category', currentCategory);
    if (currentCommerceType !== 'All') params.set('commerceType', currentCommerceType);
    if (currentContentType !== 'All') params.set('type', currentContentType);
    if (currentStyle !== 'All') params.set('style', currentStyle);
    if (currentScene !== 'All') params.set('scene', currentScene);
    if (currentSearch.trim()) params.set('q', currentSearch.trim());
    const query = params.toString();
    return query ? `#/explore?${query}` : '#/explore';
  }

  function syncExploreHash(replace = true) {
    if (currentRoute !== 'explore') return;
    const targetHash = getExploreHash();
    if (window.location.hash === targetHash) return;
    const method = replace ? 'replaceState' : 'pushState';
    history[method]({ route: 'explore', category: currentCategory, commerceType: currentCommerceType, contentType: currentContentType, style: currentStyle, scene: currentScene, search: currentSearch, page: currentPage }, '', targetHash);
  }

  function setNavActive(route) {
    $$('.nav a').forEach(a => { a.style.color = ''; });
    const activeNav = $(`.nav a[data-route="${route}"]`);
    if (activeNav) activeNav.style.color = 'var(--text)';
  }

  function getBrowseContextLabel(route) {
    if (route === 'collections') return '返回我的收藏';
    if (route === 'home') return '返回首页精选';
    if (currentSearch.trim()) return `返回「${currentSearch.trim()}」结果`;
    if (currentCommerceType !== 'All') return `返回${currentCommerceType}内容`;
    if (currentContentType !== 'All') return `返回${exploreFacets.CONTENT_TYPES.find(item => item.id === currentContentType)?.label || '筛选'}内容`;
    if (currentStyle !== 'All') return `返回${exploreFacets.STYLES.find(item => item.id === currentStyle)?.label || '风格'}内容`;
    if (currentScene !== 'All') return `返回${exploreFacets.SCENES.find(item => item.id === currentScene)?.label || '场景'}内容`;
    if (currentCategory !== 'All') return `返回${currentCategory}分类`;
    return '返回探索';
  }

  function captureDetailReturnContext(isCollection) {
    if (currentRoute === 'detail' && detailReturnContext) return;
    const route = isCollection && currentRoute !== 'explore'
      ? 'collections'
      : (currentRoute === 'home' || currentRoute === 'collections' ? currentRoute : 'explore');
    detailReturnContext = {
      route,
      category: currentCategory,
      commerceType: currentCommerceType,
      contentType: currentContentType,
      style: currentStyle,
      scene: currentScene,
      search: currentSearch,
      page: currentPage,
      label: getBrowseContextLabel(route)
    };
  }

  function showExploreWithState({ category = 'All', commerceType = 'All', contentType = 'All', style = 'All', scene = 'All', search = '', page = 1, hash = '#/explore' } = {}) {
    currentRoute = 'explore';
    currentCategory = category;
    currentCommerceType = commerceType;
    currentContentType = contentType;
    currentStyle = style;
    currentScene = scene;
    mergeLegacyCategoryIntoExplore(category);
    currentSearch = search;
    currentPage = 1;
    window.scrollTo(0, 0);
    renderExplore();
    setNavActive('explore');
    const targetHash = hash.startsWith('#/category/') ? getExploreHash() : hash;
    if (window.location.hash !== targetHash) {
      history.pushState({ route: 'explore', category: currentCategory, commerceType: currentCommerceType, contentType: currentContentType, style: currentStyle, scene: currentScene, search: currentSearch, page: currentPage }, '', targetHash);
    }
  }

  function parsePromptSections(promptText) {
    const text = (promptText || '').trim();
    if (!text) return [];

    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const sections = [];
    let current = null;
    const headingPattern = /^(Core Concept|Subject Reference and Styling|Outfit and Pose|Environment and Lighting|Composition and Image Quality|Mood and Atmosphere|Prompt|Negative Prompt|核心概念|主体与造型|服装与姿态|环境与光照|构图与画质|情绪与氛围|提示词|反向提示词)$/i;

    lines.forEach(line => {
      if (headingPattern.test(line) || (line.length <= 42 && !/[,.，。]/.test(line) && /^[A-Z\u4e00-\u9fff]/.test(line))) {
        current = { title: line, body: [] };
        sections.push(current);
      } else if (current) {
        current.body.push(line);
      } else {
        current = { title: '完整提示词', body: [line] };
        sections.push(current);
      }
    });

    return sections.length ? sections : [{ title: '完整提示词', body: [text] }];
  }

  // --- Smart Parse: extract prompt from pasted text ---
  function smartParse(rawText) {
    const text = rawText.trim();
    if (!text) return null;

    const sharedParser = window.PromptHubParser;
    if (sharedParser?.parsePromptText) {
      const parsed = sharedParser.parsePromptText(rawText);
      if (parsed?.prompt) {
        const imageUrls = parsed.imageUrls || [];
        return {
          title: parsed.title || '未命名提示词',
          prompt: parsed.prompt,
          category: autoCategorize(parsed.prompt),
          tags: autoDetectTags(parsed.prompt),
          image: imageUrls[0] || '',
          images: imageUrls,
          rawImages: imageUrls,
          source: '粘贴导入'
        };
      }
    }

    // Try to find image URLs
    const imgRegex = /https?:\/\/[^\s\"<>]+\.(?:jpg|jpeg|png|gif|webp|bmp)(?:\?[^\s\"<>]*)?/gi;
    const imageUrls = text.match(imgRegex) || [];

    // 移除图片URL行后的文本行（用于提示词提取）
    const allLines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);

    // 放宽条件：行长度 > 10 即可作为候选
    const lines = allLines.filter(l => l.length > 10);

    let promptText = '';
    let title = '';

    // AI 提示词特征词（英文 + 中文）
    const promptIndicators = [
      // 英文特征词
      'portrait', 'cinematic', 'photorealistic', '8k', 'lighting', 'style', 'camera', 'shot on',
      'dslr', 'render', 'digital art', 'oil painting', 'watercolor', 'hyperrealistic', 'bokeh',
      'depth of field', 'studio lighting', 'golden hour', 'ultra detailed', 'octane render',
      'unreal engine', 'trending on artstation', 'midjourney', 'stable diffusion', 'dall-e',
      'prompt', '--ar', '--v', '--s', '--q', 'negative', 'steps', 'cfg', 'sampler', 'seed',
      'wide angle', 'telephoto', 'macro', 'close-up', 'full body', 'half body',
      'highly detailed', 'intricate', 'masterpiece', 'best quality', 'high resolution',
      'film grain', 'lens flare', 'volumetric', 'ray tracing', 'ambient occlusion',
      // 中文特征词
      '提示词', '提示', '正面提示', '负面提示', '反向提示', '画质', '高清', '超高清',
      '电影感', '写实', '超写实', '极简', '暗黑', '梦幻', '复古', '赛博朋克',
      '光影', '光照', '逆光', '顺光', '侧光', '柔光', '硬光', '自然光',
      '景深', '虚化', '广角', '长焦', '微距', '特写', '全身', '半身',
      '风格', '质感', '细节', '4K', '8K', '16K', '杰作', '高质量',
      '机器人', '未来', '科幻', '奇幻', '魔法', '城堡', '风景', '人像',
      '建筑', '动物', '美食', '时尚', '穿搭', '城市', '自然', '抽象'
    ];

    // Strategy 1: 找包含提示词特征最多的行（阈值降低到 1）
    for (const line of lines) {
      const lower = line.toLowerCase();
      const score = promptIndicators.reduce((s, ind) => s + (lower.includes(ind.toLowerCase()) ? 1 : 0), 0);
      if (score >= 1 && line.length > promptText.length) {
        promptText = line;
      }
    }

    // Strategy 2: 找最长的英文行（降低阈值到 25）
    if (!promptText) {
      const englishLines = lines.filter(l => /^[\x00-\x7F\s,.;:!?'"\-—–()#/]+$/.test(l) && l.length > 25);
      if (englishLines.length > 0) {
        promptText = englishLines.reduce((a, b) => a.length > b.length ? a : b);
      }
    }

    // Strategy 3: 找包含逗号分隔描述的行（典型提示词格式 "word1, word2, word3"）
    if (!promptText) {
      for (const line of lines) {
        if (line.split(',').length >= 3 && line.length > 15) {
          promptText = line;
          break;
        }
      }
    }

    // Strategy 4: 找包含 Midjourney 参数的行 (--ar, --v 等)
    if (!promptText) {
      for (const line of lines) {
        if (/--(ar|v|s|q|niji|style|chaos|tile|seed)/i.test(line)) {
          promptText = line;
          break;
        }
      }
    }

    // Strategy 5: 如果文本整体不长（< 500字符），直接用整段文本
    if (!promptText && text.length < 500 && text.length > 5) {
      // 排除纯 URL 行
      const nonUrlLines = allLines.filter(l => !/^https?:\/\//.test(l));
      if (nonUrlLines.length > 0) {
        promptText = nonUrlLines.join(' ');
      }
    }

    // Strategy 6: fallback to first line > 10 chars
    if (!promptText && lines.length > 0) {
      promptText = lines[0];
    }

    // Strategy 7: 最后兜底：用整段文本（去除空行）
    if (!promptText && allLines.length > 0) {
      promptText = allLines.join(' ');
    }

    // 如果最终没有提取到任何文本，返回 null
    if (!promptText) return null;

    // Extract title from text
    // Look for Chinese title or first short line
    const shortLines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 2 && l.length < 60);
    const chineseLine = shortLines.find(l => /[\u4e00-\u9fff]/.test(l) && !l.includes('提示词') && !l.includes('提示'));
    if (chineseLine) {
      title = chineseLine;
    } else if (shortLines.length > 0) {
      // Use first few words of prompt as title
      const words = promptText.split(/[\s,]+/).filter(w => w.length > 0).slice(0, 6);
      title = words.join(' ');
    }

    // Clean up title
    title = title.replace(/^["'""'']|["'""'']$/g, '').trim();
    if (!title) title = '未命名提示词';

    // Detect category from prompt text
    const catKeywords = {
      '人像': ['portrait', 'face', 'model', 'person', 'woman', 'man', 'selfie', 'headshot', 'girl', 'boy',
               '人像', '人物', '肖像', '人脸', '女性', '男性', '女孩', '男孩'],
      '风景': ['landscape', 'mountain', 'sunrise', 'sunset', 'valley', 'horizon', 'forest', 'lake', 'ocean',
               '风景', '风光', '山', '日出', '日落', '山谷', '湖泊', '海洋'],
      '建筑': ['architecture', 'building', 'interior', 'facade', 'modern house', 'skyscraper',
               '建筑', '室内', '摩天大楼', '房屋', '空间'],
      '科幻': ['sci-fi', 'space', 'futuristic', 'robot', 'alien', 'spaceship', 'cyber', 'galaxy', 'mars',
               '科幻', '太空', '未来', '机器人', '外星人', '飞船'],
      '赛博朋克': ['cyberpunk', 'neon', 'cyber', 'hologram', 'dystopian', 'night city',
                   '赛博朋克', '赛博', '霓虹', '全息', '反乌托邦'],
      '奇幻': ['fantasy', 'dragon', 'wizard', 'magic', 'elf', 'dungeon', 'castle', 'knight',
               '奇幻', '龙', '巫师', '魔法', '精灵', '城堡', '骑士'],
      '动物': ['animal', 'dog', 'cat', 'lion', 'wolf', 'bird', 'wildlife', 'fox', 'tiger', 'eagle',
               '动物', '狗', '猫', '狮子', '狼', '鸟', '野生动物', '狐狸', '老虎', '鹰'],
      '静物': ['still life', 'vase', 'fruit', 'flowers arrangement', 'tabletop',
               '静物', '花瓶', '水果', '花卉', '摆盘'],
      '美食': ['food', 'dish', 'cuisine', 'restaurant', 'sushi', 'pizza', 'coffee', 'dessert', 'cake',
               '美食', '食物', '料理', '餐厅', '寿司', '披萨', '咖啡', '甜点', '蛋糕'],
      '时尚': ['fashion', 'outfit', 'runway', 'couture', 'dress', 'streetwear',
               '时尚', '服装', '穿搭', '走秀', '礼服', '街拍'],
      '角色': ['character', 'concept art', 'hero', 'villain', 'npc', 'warrior', 'samurai',
               '角色', '概念艺术', '英雄', '反派', '战士', '武士'],
      '抽象': ['abstract', 'swirl', 'geometric', 'pattern', 'texture',
               '抽象', '几何', '图案', '纹理'],
      '自然': ['forest', 'flower', 'tree', 'ocean', 'river', 'leaf', 'butterfly', 'garden', 'waterfall',
               '自然', '森林', '花', '树', '河流', '叶子', '蝴蝶', '花园', '瀑布'],
      '城市': ['city', 'urban', 'skyline', 'street', 'cityscape', 'downtown', 'avenue',
               '城市', '都市', '天际线', '街道', '市中心', '城景']
    };

    let category = '抽象';
    let maxScore = 0;
    const promptLower = promptText.toLowerCase();
    for (const [cat, keywords] of Object.entries(catKeywords)) {
      const score = keywords.reduce((s, kw) => s + (promptLower.includes(kw.toLowerCase()) ? 1 : 0), 0);
      if (score > maxScore) {
        maxScore = score;
        category = cat;
      }
    }

    // Extract tags
    const tags = [];
    const tagKeywords = ['电影感', '写实', '超写实', '油画', '水彩', '数字艺术', '3D', '动漫', '赛博朋克', '蒸汽朋克', '复古', '极简', '华丽', '暗黑', '梦幻', 'cinematic', 'photorealistic', 'oil painting', 'watercolor', 'digital art', 'anime', 'minimalist', 'dark', 'dreamy', 'vintage', 'macro', 'bokeh', 'golden hour', 'studio lighting'];
    for (const kw of tagKeywords) {
      if (promptLower.includes(kw.toLowerCase())) tags.push(kw);
    }
    if (tags.length === 0) tags.push('AI生成');

    return {
      title: title.slice(0, 50),
      prompt: promptText,
      category: category,
      tags: tags.slice(0, 5),
      image: imageUrls[0] || '',
      images: imageUrls,
      rawImages: imageUrls,
      source: '粘贴导入'
    };
  }

  // --- Prompt Card ---
  function createPromptCard(prompt, opts = {}) {
    const isCollection = opts.isCollection || prompt.isCollection;
    const card = el('div', { class: 'prompt-card', onclick: () => openPromptDetail(prompt.id, isCollection) });
    const imageUrl = sanitizeImageUrl(prompt.image)
      || sanitizeImageUrl(prompt.images?.[0])
      || fallbackImage(prompt.id);
    const ratioMatch = String(prompt.aspectRatio || '').match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
    const imageRatio = ratioMatch ? `${ratioMatch[1]} / ${ratioMatch[2]}` : '4 / 5';

    // 来源标记：收藏 / 已验证 / 待验证
    let sourceHTML;
    if (isCollection) {
      sourceHTML = '<span style="font-size:11px;color:var(--red);font-weight:600;">❤ 我的收藏</span>';
    } else if (prompt.verified) {
      sourceHTML = '<span class="verified-badge">已验证</span>';
    } else if (prompt.source) {
      sourceHTML = `<span style="font-size:11px;color:var(--purple)">${escapeHtml(prompt.source)}</span>`;
    } else {
      sourceHTML = '<span style="font-size:11px;color:#999">待验证</span>';
    }

    // 多图角标
    const imgCount = (prompt.images && prompt.images.length) || (prompt.image ? 1 : 0);
    const multiImgBadge = imgCount > 1 ? `<span class="card-img-count">📁 ${imgCount}</span>` : '';

    // 宽高比 + 模型徽章
    const arBadge = prompt.aspectRatio ? `<span class="card-ar-badge">${escapeHtml(prompt.aspectRatio)}</span>` : '';
    const modelBadge = prompt.model ? `<span class="card-model-badge">${escapeHtml(prompt.model)}</span>` : '';

    card.innerHTML = `
      <div class="prompt-card-img-wrap">
        <img class="prompt-card-img" style="--prompt-image-ratio: ${imageRatio}" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(prompt.title)}" loading="lazy" />
        ${multiImgBadge}
        ${arBadge}
      </div>
      <div class="prompt-card-body">
        <div class="prompt-card-top">
          <span class="prompt-card-category">${escapeHtml(prompt.category)}</span>
          ${sourceHTML}
        </div>
        <div class="prompt-card-title">${escapeHtml(prompt.title)}</div>
        <div class="prompt-card-tags">
          ${(prompt.tags || []).slice(0, 3).map(t => `<span class="prompt-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="prompt-card-footer">
          <div class="prompt-card-stats">
            <span>${isCollection ? '📅 ' + escapeHtml(prompt.date || '未知') : '❤ ' + Number(prompt.likes || 0)}</span>
            ${modelBadge}
          </div>
          <div class="prompt-card-actions">
            <button class="card-detail-btn">详情</button>
            <button class="copy-btn-mini">复制</button>
          </div>
        </div>
      </div>
    `;

    const image = card.querySelector('.prompt-card-img');
    image.addEventListener('error', () => { image.src = fallbackImage('fallback'); }, { once: true });

    const detailBtn = card.querySelector('.card-detail-btn');
    detailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPromptDetail(prompt.id, isCollection);
    });

    const copyBtn = card.querySelector('.copy-btn-mini');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyPrompt(prompt.prompt);
      copyBtn.textContent = '已复制 ✓';
      setTimeout(() => copyBtn.textContent = '复制', 2000);
    });

    return card;
  }

  // --- Prompt Modal ---
  function openPromptModal(id, isCollection) {
    let prompt;
    if (isCollection) {
      prompt = getCollections().find(c => c.id === id);
    } else {
      prompt = PROMPTS.find(p => p.id === id);
    }
    if (!prompt) return;

    const overlay = $('#modal-overlay');
    const verifiedHTML = prompt.verified
      ? '<span class="verified-badge">已验证</span>'
      : (prompt.source ? `<span style="font-size:12px;color:var(--purple)">${escapeHtml(prompt.source)}</span>` : '<span style="font-size:12px;color:#999">待验证</span>');

    const isCol = isCollected(prompt.id);
    const collectBtnHTML = isCollection
      ? `<button class="copy-btn" id="modal-delete-btn" style="background:var(--red)">🗑 删除</button>`
      : `<button class="copy-btn" id="modal-collect-btn" style="background:${isCol ? 'var(--green)' : 'var(--purple)'}">${isCol ? '❤ 已收藏' : '☆ 收藏'}</button>`;

    // 多图支持：弹窗画廊
    const rawImages = (prompt.images && prompt.images.length > 0)
      ? prompt.images
      : (prompt.image ? [prompt.image] : []);
    const allImages = sanitizeImageUrls(rawImages);

    const mainImg = allImages[0] || fallbackImage(prompt.id);
    const thumbsHTML = allImages.length > 1
      ? `<div class="modal-gallery-thumbs">
           ${allImages.map((url, i) => `
             <img class="modal-gallery-thumb ${i === 0 ? 'active' : ''}" 
                  src="${escapeHtml(url)}" data-index="${i}" />
           `).join('')}
         </div>`
      : '';

    overlay.innerHTML = `
      <div class="modal">
        <button class="modal-close" type="button" aria-label="关闭">×</button>
        <div class="modal-gallery" id="modal-gallery">
          <img class="modal-img" id="modal-main-img" src="${escapeHtml(mainImg)}" alt="${escapeHtml(prompt.title)}" />
          ${allImages.length > 1 ? `<span class="modal-gallery-count">${allImages.length} 张图片</span>` : ''}
        </div>
        ${thumbsHTML}
        <div class="modal-body">
          <div class="modal-category-row">
            <span class="modal-category-badge">${escapeHtml(prompt.category)}</span>
            ${verifiedHTML}
          </div>
          <h2 class="modal-title">${escapeHtml(prompt.title)}</h2>
          
          <div class="modal-meta-grid">
            ${prompt.aspectRatio ? `<div class="modal-meta-item"><span class="modal-meta-label">宽高比</span><span class="modal-meta-value">${escapeHtml(prompt.aspectRatio)}</span></div>` : ''}
            ${prompt.model ? `<div class="modal-meta-item"><span class="modal-meta-label">模型</span><span class="modal-meta-value">${escapeHtml(prompt.model)}</span></div>` : ''}
            <div class="modal-meta-item"><span class="modal-meta-label">${isCollection ? '收藏日期' : '热度'}</span><span class="modal-meta-value">${isCollection ? escapeHtml(prompt.date || '未知') : Number(prompt.likes || 0) + ' 人喜欢'}</span></div>
            ${prompt.source ? `<div class="modal-meta-item"><span class="modal-meta-label">来源</span><span class="modal-meta-value">${escapeHtml(prompt.source)}</span></div>` : ''}
          </div>

          <div class="modal-prompt-section">
            <div class="modal-prompt-label">
              <span>提示词</span>
              <div style="display:flex;gap:8px;">
                ${collectBtnHTML}
                <button class="copy-btn" id="modal-copy-btn">📋 复制提示词</button>
              </div>
            </div>
            <div class="modal-prompt-text">${escapeHtml(prompt.prompt || '')}</div>
          </div>

          <div class="modal-tags-section">
            <span class="modal-tags-label">标签</span>
            <div class="modal-tags">
              ${(prompt.tags || []).map(t => `<button class="prompt-tag modal-tag-clickable" type="button" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
            </div>
          </div>

          <div class="modal-footer-info">
            <span>🏷 #${escapeHtml(prompt.id)}</span>
          </div>
        </div>
      </div>
    `;

    overlay.classList.add('active');

    // 存储弹窗图片列表
    window._modalGalleryImages = allImages;

    const modalMainImage = $('#modal-main-img');
    modalMainImage?.addEventListener('error', () => { modalMainImage.src = fallbackImage('fallback'); }, { once: true });
    $('.modal-close', overlay)?.addEventListener('click', () => overlay.classList.remove('active'));
    $$('.modal-gallery-thumb', overlay).forEach((thumb, index) => {
      thumb.addEventListener('error', () => { thumb.style.display = 'none'; }, { once: true });
      thumb.addEventListener('click', () => window.switchModalImage(index));
    });
    $$('.modal-tag-clickable', overlay).forEach(tag => {
      tag.addEventListener('click', () => window.filterByTag(tag.dataset.tag || ''));
    });

    // Wire copy
    $('#modal-copy-btn').addEventListener('click', function () {
      copyPrompt(prompt.prompt, this);
    });

    // Wire collect
    const collectBtn = $('#modal-collect-btn');
    if (collectBtn) {
      collectBtn.addEventListener('click', () => {
        if (isCollected(prompt.id)) {
          showToast('该提示词已在收藏中');
        } else {
          const item = {
            ...prompt,
            id: prompt.id,
            date: new Date().toISOString().slice(0, 10),
            source: '网站收藏'
          };
          if (saveCollection(item)) {
            showToast('已收藏到「我的收藏」');
            collectBtn.textContent = '❤ 已收藏';
            collectBtn.style.background = 'var(--green)';
          }
        }
      });
    }

    // Wire delete for collections
    const deleteBtn = $('#modal-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        deleteCollection(prompt.id);
        showToast('已从收藏中删除');
        overlay.classList.remove('active');
        if (currentRoute === 'collections') renderCollections();
      });
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    };
  }

  function openPromptDetail(id, isCollection, updateHash = true) {
    const localCollection = getCollections().find(c => c.id === id);
    const displayPrompt = isCollection ? localCollection : (localCollection || findPromptById(id, false));
    const isSavedCollection = Boolean(localCollection);
    const canEdit = true;
    if (!displayPrompt) return;

    if (updateHash) {
      captureDetailReturnContext(isSavedCollection);
    } else if (!detailReturnContext) {
      detailReturnContext = { route: 'explore', category: 'All', search: '', page: 1, label: '返回探索' };
    }
    currentRoute = 'detail';
    window.scrollTo(0, 0);
    renderPromptDetail(displayPrompt, isSavedCollection, canEdit);

    setNavActive('');

    if (updateHash) {
      const targetHash = `${isSavedCollection ? '#/collection/' : '#/prompt/'}${encodeURIComponent(displayPrompt.id)}`;
      if (window.location.hash !== targetHash) {
        history.pushState({ route: 'detail', id: displayPrompt.id, isCollection: isSavedCollection }, '', targetHash);
      }
    }
  }

  function renderPromptDetail(prompt, isCollection, canEdit = true) {
    const app = $('#app');
    const rawImages = (prompt.images && prompt.images.length > 0)
      ? prompt.images
      : (prompt.image ? [prompt.image] : []);
    const allImages = sanitizeImageUrls(rawImages);
    const mainImg = allImages[0] || fallbackImage(prompt.id, 720);
    const sections = parsePromptSections(prompt.prompt);
    const related = getAllPromptItems()
      .filter(p => p.id !== prompt.id && normalizeCategory(p.category) === normalizeCategory(prompt.category))
      .slice(0, 4);
    const isCol = isCollected(prompt.id) || isCollection;
    const verifiedLabel = prompt.verified ? '已验证' : (prompt.source ? prompt.source : '待验证');
    const referenceImages = sanitizeImageUrls(prompt.referenceImages);
    const returnLabel = detailReturnContext?.label || '返回探索';
    const editableImagesText = allImages.join('\n');
    const editableReferenceImagesText = referenceImages.join('\n');
    const editableImageRows = Math.min(Math.max(allImages.length, 2), 5);
    const editableReferenceRows = Math.min(Math.max(referenceImages.length, 2), 4);
    const categoryOptions = CATEGORIES.map(c => `
      <option value="${escapeHtml(c.name)}" ${normalizeCategory(c.name) === normalizeCategory(prompt.category) ? 'selected' : ''}>${escapeHtml(`${c.icon} ${c.name}`)}</option>
    `).join('');
    const sourceUrl = sanitizeImageUrl(prompt.sourceUrl);
    const sourceLink = sourceUrl
      ? `<a class="detail-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">打开来源</a>`
      : '';
    const editPanel = canEdit ? `
      <div class="detail-edit-panel" id="detail-edit-panel" hidden>
        <div class="detail-edit-head">
          <div>
            <strong>校正收藏内容</strong>
            <p>系统自动获取的内容如有异常，可以自行编辑。按 Enter 保存，Shift + Enter 换行。</p>
          </div>
          <button class="detail-edit-close" id="detail-cancel-edit-icon" type="button" aria-label="取消编辑">×</button>
        </div>
        <div class="detail-edit-grid">
          <label class="detail-edit-field">
            标题
            <input id="detail-edit-title" type="text" value="${escapeHtml(prompt.title)}" />
          </label>
          <label class="detail-edit-field">
            分类
            <select id="detail-edit-category">${categoryOptions}</select>
          </label>
          <label class="detail-edit-field">
            宽高比
            <input id="detail-edit-aspect" type="text" value="${escapeHtml(prompt.aspectRatio || '')}" placeholder="如 3:4" />
          </label>
          <label class="detail-edit-field">
            模型
            <input id="detail-edit-model" type="text" value="${escapeHtml(prompt.model || '')}" placeholder="通用 AI 图像模型" />
          </label>
          <label class="detail-edit-field detail-edit-field-wide">
            标签
            <input id="detail-edit-tags" type="text" value="${escapeHtml((prompt.tags || []).join(', '))}" placeholder="逗号分隔" />
          </label>
          <label class="detail-edit-field detail-edit-field-wide">
            结果图片链接
            <textarea id="detail-edit-images" rows="${editableImageRows}" placeholder="每行一个图片 URL">${escapeHtml(editableImagesText)}</textarea>
          </label>
          <label class="detail-edit-field detail-edit-field-wide">
            参考图片链接
            <textarea id="detail-edit-reference-images" rows="${editableReferenceRows}" placeholder="每行一个图片 URL">${escapeHtml(editableReferenceImagesText)}</textarea>
          </label>
          <label class="detail-edit-field detail-edit-field-wide">
            完整提示词
            <textarea id="detail-edit-prompt" rows="8">${escapeHtml(prompt.prompt)}</textarea>
          </label>
        </div>
        <div class="detail-edit-actions">
          <button class="copy-btn detail-primary-action" id="detail-save-edit-btn" type="button">保存修改</button>
          <button class="detail-cancel-edit-btn" id="detail-cancel-edit-btn" type="button">取消</button>
        </div>
      </div>
    ` : '';

    app.innerHTML = `
      <section class="detail-page">
        <div class="container">
          <div class="detail-breadcrumb">
            <button class="detail-back" type="button" data-action="return-browse">← ${escapeHtml(returnLabel)}</button>
            <span>PromptHub</span>
            <span>/</span>
            <button class="detail-category-filter" type="button" data-category="${escapeHtml(prompt.category)}">${escapeHtml(prompt.category)}</button>
            <span>/</span>
            <strong>${escapeHtml(prompt.title)}</strong>
          </div>

          <div class="detail-layout">
            <aside class="detail-media-panel">
              <div class="detail-media-label">Result Image</div>
              <div class="detail-media">
                <img id="detail-main-img" src="${escapeHtml(mainImg)}" alt="${escapeHtml(prompt.title)}" />
                ${allImages.length > 1 ? `<span class="detail-image-count">${allImages.length} 张图片</span>` : ''}
              </div>
              ${allImages.length > 1 ? `
                <div class="detail-thumbs">
                  ${allImages.map((url, i) => `
                    <img class="detail-thumb ${i === 0 ? 'active' : ''}" src="${escapeHtml(url)}" data-index="${i}" />
                  `).join('')}
                </div>
              ` : ''}
              ${referenceImages.length ? `
                <div class="detail-reference-block">
                  <div class="detail-media-label">Reference Images</div>
                  <div class="detail-reference-grid">
                    ${referenceImages.map((url, i) => `
                      <img class="detail-reference-image" src="${escapeHtml(url)}" alt="Reference ${i + 1}" />
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </aside>

            <article class="detail-main">
              <div class="detail-kicker">
                <span class="detail-category">${escapeHtml(prompt.category)}</span>
                <span class="detail-status">${escapeHtml(verifiedLabel)}</span>
              </div>
              <h1>${escapeHtml(prompt.title)}</h1>
              <p class="detail-summary">把图片参考、结构化提示词、模型参数和下一步动作放在同一个任务页面里。</p>

              <div class="detail-actions">
                <button class="copy-btn detail-primary-action" id="detail-copy-btn">📋 一键复制提示词</button>
                ${isCollection
                  ? `<button class="copy-btn detail-danger-action" id="detail-delete-btn">🗑 删除收藏</button>
                     <button class="copy-btn detail-edit-action" id="detail-edit-btn" type="button">✎ 编辑内容</button>`
                  : `<button class="copy-btn detail-secondary-action" id="detail-collect-btn">${isCol ? '❤ 已收藏' : '☆ 收藏'}</button>`}
                ${!isCollection && canEdit ? '<button class="copy-btn detail-edit-action" id="detail-edit-btn" type="button">编辑内容</button>' : ''}
                ${sourceLink}
              </div>

              ${editPanel}

              <div class="detail-meta-grid">
                <div class="detail-meta-card"><span>分类</span><strong>${escapeHtml(prompt.category)}</strong></div>
                <div class="detail-meta-card"><span>宽高比</span><strong>${escapeHtml(prompt.aspectRatio || '未标注')}</strong></div>
                <div class="detail-meta-card"><span>模型</span><strong>${escapeHtml(prompt.model || '通用 AI 图像模型')}</strong></div>
                <div class="detail-meta-card"><span>${isCollection ? '收藏日期' : '热度'}</span><strong>${isCollection ? escapeHtml(prompt.date || '未知') : `${prompt.likes || 0} 人喜欢`}</strong></div>
              </div>

              <div class="detail-section-list">
                ${sections.map((section, index) => `
                  <section class="detail-prompt-section">
                    <div class="detail-section-head">
                      <span>${String(index + 1).padStart(2, '0')}</span>
                      <h2>${escapeHtml(section.title)}</h2>
                    </div>
                    <p>${escapeHtml(section.body.join('\n\n'))}</p>
                  </section>
                `).join('')}
              </div>

              <div class="detail-tags-block">
                <span>标签筛选</span>
                <div class="modal-tags">
                  ${(prompt.tags || []).map(t => `<button class="prompt-tag modal-tag-clickable" type="button" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
                </div>
              </div>
            </article>
          </div>

          <section class="detail-related">
            <div class="detail-related-head">
              <h2>相关提示词</h2>
              <button class="btn btn-outline detail-category-filter" type="button" data-category="${escapeHtml(prompt.category)}">查看 ${escapeHtml(prompt.category)} 分类</button>
            </div>
            <div class="prompts-grid" id="detail-related-grid"></div>
          </section>
        </div>
      </section>
    `;

    window._detailGalleryImages = allImages;

    const detailMainImage = $('#detail-main-img');
    detailMainImage?.addEventListener('error', () => { detailMainImage.src = fallbackImage('fallback', 720); }, { once: true });
    $$('.detail-thumb', app).forEach((thumb, index) => {
      thumb.addEventListener('error', () => { thumb.style.display = 'none'; }, { once: true });
      thumb.addEventListener('click', () => window.switchDetailImage(index));
    });
    $$('.detail-reference-image', app).forEach(image => {
      image.addEventListener('error', () => { image.style.display = 'none'; }, { once: true });
    });
    $$('.detail-category-filter', app).forEach(button => {
      button.addEventListener('click', () => window.filterByCategoryAndOpen(button.dataset.category || '抽象'));
    });
    $$('.modal-tag-clickable', app).forEach(tag => {
      tag.addEventListener('click', () => window.filterByTag(tag.dataset.tag || ''));
    });

    $('#detail-copy-btn')?.addEventListener('click', function () {
      copyPrompt(prompt.prompt, this);
    });

    const collectBtn = $('#detail-collect-btn');
    if (collectBtn) {
      collectBtn.addEventListener('click', () => {
        if (isCollected(prompt.id)) {
          showToast('该提示词已在收藏中');
          return;
        }
        if (saveCollection({ ...prompt, id: prompt.id, date: new Date().toISOString().slice(0, 10), source: '网站收藏' })) {
          showToast('已收藏到「我的收藏」');
          collectBtn.textContent = '❤ 已收藏';
          collectBtn.classList.remove('detail-secondary-action');
          collectBtn.classList.add('detail-primary-action');
        }
      });
    }

    const deleteBtn = $('#detail-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        deleteCollection(prompt.id);
        showToast('已从收藏中删除');
        returnToBrowse();
      });
    }

    const editBtn = $('#detail-edit-btn');
    const editPanelEl = $('#detail-edit-panel');
    if (editBtn && editPanelEl) {
      const parseLines = value => String(value || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      const closeEdit = () => {
        editPanelEl.hidden = true;
        editBtn.textContent = '✎ 编辑内容';
        editBtn.setAttribute('aria-expanded', 'false');
      };
      const openEdit = () => {
        editPanelEl.hidden = false;
        editBtn.textContent = '正在编辑';
        editBtn.setAttribute('aria-expanded', 'true');
        $('#detail-edit-title')?.focus();
      };
      const saveDetailEdit = () => {
        const title = ($('#detail-edit-title')?.value || '').trim();
        const promptText = ($('#detail-edit-prompt')?.value || '').trim();

        if (!title || !promptText) {
          showToast('标题和提示词不能为空');
          return;
        }

        const images = parseLines($('#detail-edit-images')?.value || '');
        const referenceImagesNext = parseLines($('#detail-edit-reference-images')?.value || '');
        const tags = ($('#detail-edit-tags')?.value || '').trim()
          ? ($('#detail-edit-tags').value).split(/[,，]/).map(t => t.trim()).filter(Boolean)
          : autoDetectTags(promptText);
        const updated = saveOrUpdateCollection(prompt, {
          title,
          ...(title !== prompt.title ? { titleSource: 'manual' } : {}),
          prompt: promptText,
          category: $('#detail-edit-category')?.value || prompt.category,
          aspectRatio: ($('#detail-edit-aspect')?.value || '').trim(),
          model: ($('#detail-edit-model')?.value || '').trim(),
          tags,
          image: images[0] || '',
          images,
          rawImages: images,
          referenceImages: referenceImagesNext
        });

        if (!updated) {
          showToast('未找到可编辑的收藏');
          return;
        }

        showToast('修改已保存');
        renderPromptDetail({ ...updated, isCollection: true }, true, true);
      };

      editBtn.setAttribute('aria-expanded', 'false');
      editBtn.setAttribute('aria-controls', 'detail-edit-panel');
      editBtn.addEventListener('click', () => {
        if (editPanelEl.hidden) openEdit();
        else closeEdit();
      });
      $('#detail-save-edit-btn')?.addEventListener('click', saveDetailEdit);
      $('#detail-cancel-edit-btn')?.addEventListener('click', closeEdit);
      $('#detail-cancel-edit-icon')?.addEventListener('click', closeEdit);
      editPanelEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeEdit();
          editBtn.focus();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveDetailEdit();
        }
      });
    }

    const relatedGrid = $('#detail-related-grid');
    if (relatedGrid) {
      if (related.length) {
        related.forEach(item => relatedGrid.appendChild(createPromptCard(item, { isCollection: item.isCollection })));
      } else {
        relatedGrid.innerHTML = '<div class="no-results"><div class="no-results-icon">🔎</div><p>这个分类暂时没有更多相关提示词</p></div>';
      }
    }
  }

  window.switchDetailImage = function (index) {
    const images = window._detailGalleryImages || [];
    if (!images[index]) return;
    const mainImg = $('#detail-main-img');
    if (mainImg) mainImg.src = images[index];
    document.querySelectorAll('.detail-thumb').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
    });
  };

  window.returnToBrowse = function () {
    const context = detailReturnContext || { route: 'explore', category: 'All', commerceType: 'All', contentType: 'All', style: 'All', scene: 'All', search: '', page: 1 };
    detailReturnContext = null;

    if (context.route === 'home') {
      navigate('home');
      if (window.location.hash !== '#/home') history.pushState({ route: 'home' }, '', '#/home');
      return;
    }

    if (context.route === 'collections') {
      navigate('collections');
      if (window.location.hash !== '#/collections') history.pushState({ route: 'collections' }, '', '#/collections');
      return;
    }

    currentRoute = 'explore';
    currentCategory = context.category || 'All';
    currentCommerceType = context.commerceType || 'All';
    currentContentType = context.contentType || 'All';
    currentStyle = context.style || 'All';
    currentScene = context.scene || 'All';
    currentSearch = context.search || '';
    currentPage = context.page || 1;
    window.scrollTo(0, 0);
    renderExplore();
    setNavActive('explore');
    const targetHash = getExploreHash();
    if (window.location.hash !== targetHash) history.pushState({ route: 'explore' }, '', targetHash);
  };

  window.filterByCategoryAndOpen = function (catName) {
    detailReturnContext = null;
    showExploreWithState({
      category: catName,
      commerceType: 'All',
      contentType: 'All',
      style: 'All',
      scene: 'All',
      search: '',
      page: 1,
      hash: `#/category/${encodeURIComponent(catName)}`
    });
  };

  // --- Render: Home ---
  function renderHome() {
    const app = $('#app');
    const allPromptItems = getAllPromptItems();
    const dailyCuratedPrompts = dailyCuration.getDailyCuratedPrompts(allPromptItems, 16);
    const todayTop = dailyCuratedPrompts.slice(0, 6);
    const heroPrompts = dailyCuratedPrompts;
    const heroColumns = [0, 1, 2, 3].map(columnIndex =>
      heroPrompts.filter((_, index) => index % 4 === columnIndex)
    );
    const catCounts = {};
    CATEGORIES.forEach(c => { catCounts[c.name] = 0; });
    getAllPromptItems().forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
    catCounts['视频提示词'] = getAllPromptItems().filter(p => p.mediaType === 'video' || p.category === '视频提示词').length;

    app.innerHTML = `
      <section class="hero hero-gallery" aria-label="PromptHub prompt gallery">
        <h1 class="sr-only">PromptHub AI 提示词收藏库</h1>
        <div class="hero-intro" aria-hidden="false">
          <h2>探索高品质纳米提示词库。</h2>
          <p>高品质提示词库持续增长，每日更新，可直接复制粘贴，生成令人惊叹的 AI 图像。</p>
          <button class="hero-main-cta" type="button" data-action="open-explore">
            <span>查看所有提示</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div class="hero-gallery-shell">
          <div class="hero-gallery-grid">
            ${heroColumns.map((column, columnIndex) => {
              const loopedColumn = Array.from({ length: 18 }, () => column).flat();
              return `
                <div class="hero-gallery-column hero-gallery-column-${columnIndex + 1}">
                  <div class="hero-gallery-track">
                    ${loopedColumn.map((prompt, itemIndex) => {
                      const cardIndex = (itemIndex % column.length) + 1;
                      return `
                        <button
                          class="hero-gallery-card hero-gallery-card-${columnIndex + 1}-${cardIndex}"
                          type="button"
                          data-action="open-prompt"
                          data-prompt-id="${escapeHtml(prompt.id)}"
                          aria-label="查看提示词：${escapeHtml(prompt.title)}"
                        >
                          <img class="hero-gallery-image" src="${escapeHtml(sanitizeImageUrl(prompt.image) || fallbackImage(prompt.id))}" alt="${escapeHtml(prompt.title)}" loading="${columnIndex === 0 && itemIndex === 0 ? 'eager' : 'lazy'}" />
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="hero-gallery-vignette hero-gallery-vignette-top"></div>
          <div class="hero-gallery-vignette hero-gallery-vignette-bottom"></div>
          <button class="hero-explore-pill" type="button" data-action="open-explore" aria-label="探索全部提示词">
            <span class="hero-explore-icon">⌾</span>
            <span>Explore all prompts</span>
          </button>
        </div>
        <div class="container hero-content">
          <div class="hero-badge">每日更新 · 已验证 · 免费使用</div>
          <h1>发现高质量 <span class="highlight">AI 提示词</span><br>激发无限创作灵感</h1>
          <p>不断增长的提示词收藏库，每日更新，一键复制即可使用，助你生成惊艳的 AI 图像作品。</p>
          <div class="hero-actions">
            <button class="btn btn-yellow" type="button" data-action="open-explore">🚀 探索所有提示词</button>
            <button class="btn btn-outline" type="button" data-action="scroll" data-scroll-target="#categories-section">浏览分类</button>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><div class="hero-stat-num">${allPromptItems.length}+</div><div class="hero-stat-label">精选提示词</div></div>
            <div class="hero-stat"><div class="hero-stat-num">${CATEGORIES.length}</div><div class="hero-stat-label">主题分类</div></div>
            <div class="hero-stat"><div class="hero-stat-num">${PROMPTS.filter(p => p.verified).length}</div><div class="hero-stat-label">已验证</div></div>
            <div class="hero-stat"><div class="hero-stat-num">每日</div><div class="hero-stat-label">持续更新</div></div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="container">
          <h2 class="section-title">🔥 今日精选提示词</h2>
          <p class="section-subtitle">每日自动分析主站内容，优先展示当天新收集、资料完整且主题多样的高质量提示词。</p>
          <div class="top-prompts" id="top-prompts"></div>
          <div style="text-align:center;margin-top:32px;">
            <button class="btn btn-outline" type="button" data-action="open-explore">查看全部提示词 →</button>
          </div>
        </div>
      </section>
      <section class="section" style="background:#fff;" id="categories-section">
        <div class="container">
          <h2 class="section-title">📂 按主题探索</h2>
          <p class="section-subtitle">发现适合你下一个项目的完美提示词，涵盖最受欢迎的主题分类。</p>
          <div class="categories-grid" id="categories-grid"></div>
        </div>
      </section>
      <section class="section features">
        <div class="container">
          <h2 class="section-title">✨ 为什么选择 PromptHub</h2>
          <p class="section-subtitle">PromptHub 是优质 AI 提示词的首选平台，为创作者提供专业级资源。</p>
          <div class="features-grid">
            <div class="feature-card"><div class="feature-icon">📚</div><div class="feature-title">精选提示词库</div><div class="feature-desc">${PROMPTS.length}+ 经过严格筛选的提示词，覆盖各类风格与场景，专业级输出质量。</div></div>
            <div class="feature-card"><div class="feature-icon">⚡</div><div class="feature-title">一键复制工作流</div><div class="feature-desc">无需手动选择文本，点击即可复制完整提示词，简化你的创作流程。</div></div>
            <div class="feature-card"><div class="feature-icon">✅</div><div class="feature-title">验证与测试</div><div class="feature-desc">每个标记「已验证」的提示词都经过预渲染测试，确保生成效果稳定可靠。</div></div>
            <div class="feature-card"><div class="feature-icon">🔄</div><div class="feature-title">每日新鲜更新</div><div class="feature-desc">每天添加新的提示词内容，区别于其他平台的周更频率，总有新灵感。</div></div>
            <div class="feature-card"><div class="feature-icon">🏷️</div><div class="feature-title">智能标签系统</div><div class="feature-desc">通过光照、情绪、镜头等标签快速筛选，精准定位你需要的提示词风格。</div></div>
            <div class="feature-card"><div class="feature-icon">🆓</div><div class="feature-title">完全免费使用</div><div class="feature-desc">所有提示词均可免费使用于个人或商业项目，无隐藏费用，无注册门槛。</div></div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="container">
          <h2 class="section-title">🎯 真实使用场景</h2>
          <p class="section-subtitle">解锁 AI 提示词的全部潜力，看看创作者们如何在不同领域使用它们。</p>
          <div class="usecases-grid">
            <div class="usecase-card"><img class="usecase-img" src="https://picsum.photos/seed/uc1/400/200" alt="电商" /><div class="usecase-body"><div class="usecase-title">🛒 电商与产品摄影</div><div class="usecase-desc">为 Shopify、淘宝、亚马逊等平台生成专业级产品图，替代昂贵的商业摄影。</div></div></div>
            <div class="usecase-card"><img class="usecase-img" src="https://picsum.photos/seed/uc2/400/200" alt="社交媒体" /><div class="usecase-body"><div class="usecase-title">📱 社交媒体与 AI 网红</div><div class="usecase-desc">创建角色一致的 AI 虚拟形象，生成小红书、Instagram 等平台的高质量视觉内容。</div></div></div>
            <div class="usecase-card"><img class="usecase-img" src="https://picsum.photos/seed/uc3/400/200" alt="营销" /><div class="usecase-body"><div class="usecase-title">📢 营销与视觉设计</div><div class="usecase-desc">电影分镜、海报设计、品牌视觉，用提示词快速产出多种风格方案供团队选择。</div></div></div>
            <div class="usecase-card"><img class="usecase-img" src="https://picsum.photos/seed/uc4/400/200" alt="教育" /><div class="usecase-body"><div class="usecase-title">📊 信息图表与教育内容</div><div class="usecase-desc">利用文字渲染能力生成信息图表、教学插画，让抽象概念变得直观易懂。</div></div></div>
            <div class="usecase-card"><img class="usecase-img" src="https://picsum.photos/seed/uc5/400/200" alt="建筑" /><div class="usecase-body"><div class="usecase-title">🏛️ 建筑与室内设计</div><div class="usecase-desc">照片级建筑可视化、室内方案预览，帮助客户直观感受设计意图与空间氛围。</div></div></div>
            <div class="usecase-card"><img class="usecase-img" src="https://picsum.photos/seed/uc6/400/200" alt="游戏" /><div class="usecase-body"><div class="usecase-title">🎮 游戏开发与概念艺术</div><div class="usecase-desc">快速构建世界观、角色概念、场景原画，加速游戏前期设计与美术迭代流程。</div></div></div>
          </div>
        </div>
      </section>
      <section class="section prompt-eng">
        <div class="container">
          <h2 class="section-title">🧪 完美提示词的艺术</h2>
          <p class="section-subtitle">掌握提示词工程的四大构建模块，让你的 AI 生成效果更上一层楼。</p>
          <div class="prompt-eng-grid">
            <div class="prompt-eng-card"><div class="prompt-eng-num">1</div><div class="prompt-eng-title">核心主体描述</div><div class="prompt-eng-desc">定义画面中的角色、物体或主要动作，这是提示词的基础。清晰描述主体外观、姿态与表情。</div></div>
            <div class="prompt-eng-card"><div class="prompt-eng-num">2</div><div class="prompt-eng-title">视觉风格关键词</div><div class="prompt-eng-desc">设定整体美学风格，从超写实到数字艺术，从油画到水彩，风格词决定画面的视觉基调。</div></div>
            <div class="prompt-eng-card"><div class="prompt-eng-num">3</div><div class="prompt-eng-title">光影与氛围词</div><div class="prompt-eng-desc">掌握光线方向、色温与环境氛围。黄金时刻、影棚光、体积光等关键词营造画面情绪。</div></div>
            <div class="prompt-eng-card"><div class="prompt-eng-num">4</div><div class="prompt-eng-title">质感与品质标签</div><div class="prompt-eng-desc">完善感官细节，添加 8K、超细节、锐利对焦等品质标签，提升生成图像的精细度。</div></div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="container">
          <h2 class="section-title">❓ 常见问题</h2>
          <p class="section-subtitle">关于 PromptHub 和 AI 提示词，你想知道的都在这里。</p>
          <div class="faq-list" id="faq-list"></div>
        </div>
      </section>
    `;

    $$('.hero-gallery-image', app).forEach(image => {
      image.addEventListener('error', () => {
        image.closest('.hero-gallery-card')?.remove();
      }, { once: true });
    });

    const topContainer = $('#top-prompts');
    todayTop.forEach(p => {
      const item = el('div', { class: 'top-prompt-item', onclick: () => openPromptDetail(p.id) });
      const selectionMeta = Number(p.likes) > 0 ? `<span>❤ ${p.likes}</span>` : '<span>新入库</span>';
      item.innerHTML = `<img class="top-prompt-thumb" src="${p.image}" alt="${p.title}" loading="lazy" /><div class="top-prompt-info"><div class="top-prompt-title">${p.title}</div><div class="top-prompt-meta"><span>${p.category}</span>${p.verified ? '<span class="verified-badge">已验证</span>' : ''}${selectionMeta}</div></div>`;
      topContainer.appendChild(item);
    });

    const catGrid = $('#categories-grid');
    CATEGORIES.forEach(cat => {
      const card = el('div', { class: 'category-card', onclick: () => filterByCategoryAndOpen(cat.name) });
      card.innerHTML = `<div class="category-icon">${cat.icon}</div><div class="category-name">${cat.name}</div><div class="category-desc">${cat.desc}</div><div class="category-count">${catCounts[cat.name] || 0} 个提示词</div>`;
      catGrid.appendChild(card);
    });

    const faqList = $('#faq-list');
    FAQS.forEach(faq => {
      const item = el('div', { class: 'faq-item' });
      item.innerHTML = `<button class="faq-question"><span>${faq.q}</span><span class="faq-toggle">+</span></button><div class="faq-answer">${faq.a}</div>`;
      item.querySelector('.faq-question').addEventListener('click', () => item.classList.toggle('open'));
      faqList.appendChild(item);
    });
  }

  function renderDisclaimer() {
    const app = $('#app');
    app.innerHTML = `
      <section class="legal-hero">
        <div class="container legal-hero-inner">
          <p class="legal-eyebrow">PromptHub</p>
          <h1>免责声明与免费使用说明</h1>
          <p>PromptHub 提供可检索、可复制的 AI 提示词参考内容。本页说明免费访问范围，以及使用内容前应了解的责任边界。</p>
        </div>
      </section>
      <section class="legal-section">
        <div class="container legal-layout">
          <nav class="legal-toc" aria-label="免责声明目录">
            <a href="#disclaimer-free">免费使用</a>
            <a href="#disclaimer-content">内容与来源</a>
            <a href="#disclaimer-output">AI 输出</a>
            <a href="#disclaimer-compliance">合规责任</a>
            <a href="#disclaimer-privacy">个人信息</a>
            <a href="#disclaimer-feedback">侵权反馈</a>
          </nav>
          <article class="legal-content">
            <section id="disclaimer-free">
              <h2>免费使用</h2>
              <p>PromptHub 对公开展示的提示词内容不收取访问、浏览或复制费用。本站并不代表任何第三方模型、素材平台或外部工具免费；使用这些服务时产生的订阅、算力、素材或其他费用，以对应服务商的规则为准。</p>
            </section>
            <section id="disclaimer-content">
              <h2>内容与来源</h2>
              <p>本站内容来自用户收藏、公开可访问来源与经整理的案例。提示词、参考图、视频封面、品牌元素和外部链接可能分别受到原作者、平台或权利人的规则约束。保留来源链接不等于取得原作品、人物肖像、商标或素材的全部授权。</p>
              <p>使用前请自行核对来源页面、模型条款和适用授权；将内容用于公开发布、广告投放、商品销售或客户项目时，尤其应先确认所需权利。</p>
            </section>
            <section id="disclaimer-output">
              <h2>AI 输出不作保证</h2>
              <p>提示词的效果会受模型版本、参数、输入素材、地区能力和平台策略影响。PromptHub 不保证任何提示词在特定模型中的生成效果、稳定性、可用性、适销性或适合特定用途。</p>
            </section>
            <section id="disclaimer-compliance">
              <h2>合规使用责任</h2>
              <p>用户应对自己的输入、生成结果、发布行为及商业用途负责。不得利用本站内容实施违法活动，或侵犯他人的著作权、商标权、肖像权、隐私权及其他合法权益。涉及真实人物、品牌、受保护作品或敏感场景时，请取得必要授权并遵守适用规则。</p>
              <p>本页是一般性使用说明，不构成法律意见。面对具体业务、跨境发行或争议情形，请向有资质的专业人士咨询。</p>
            </section>
            <section id="disclaimer-privacy">
              <h2>个人信息与凭证</h2>
              <p>本站不要求注册账号。浏览器插件中的 GitHub Token 仅用于用户自行发起的收藏同步，应由用户自行保管，切勿将 Token、密码、Cookie 或其他凭证粘贴到提示词、图片说明或公开页面中。</p>
            </section>
            <section id="disclaimer-feedback">
              <h2>侵权与内容反馈</h2>
              <p>如你认为本站内容侵犯了你的合法权益，或发现来源、提示词、图片信息有误，请通过 <a href="https://github.com/kxbbw81-glitch/PromptHub-/issues" target="_blank" rel="noreferrer noopener">PromptHub GitHub Issues</a> 提交内容链接、权利说明和可核验材料。收到后会进行核查，并视情况更正、下线或保留必要的说明记录。</p>
            </section>
          </article>
        </div>
      </section>
    `;
  }

  // --- Render: Explore ---
  function getExploreState(overrides = {}) {
    return {
      category: currentCategory,
      commerceType: currentCommerceType,
      contentType: currentContentType,
      style: currentStyle,
      scene: currentScene,
      search: currentSearch,
      ...overrides
    };
  }

  function matchesExploreState(prompt, state = getExploreState()) {
    if (state.category === '视频提示词') {
      if (prompt.mediaType !== 'video' && prompt.category !== '视频提示词') return false;
    } else if (state.category !== 'All' && prompt.category !== state.category) {
      return false;
    }
    if (state.commerceType === 'AllCommerce') {
      if (prompt.category !== '电商视觉' && !prompt.commerceType) return false;
    } else if (state.commerceType !== 'All' && prompt.commerceType !== state.commerceType) return false;
    if (!exploreFacets.matchesFacet(prompt, 'contentType', state.contentType)) return false;
    if (!exploreFacets.matchesFacet(prompt, 'style', state.style)) return false;
    if (!exploreFacets.matchesFacet(prompt, 'scene', state.scene)) return false;
    if (state.search.trim()) {
      const query = state.search.toLowerCase().trim();
      const text = [prompt.title, prompt.category, prompt.commerceType, ...(prompt.tags || []), prompt.prompt]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  }

  function getExploreItems() {
    const collections = getCollections().map(c => ({ ...c, isCollection: true, verified: false, likes: 0 }));
    return [...collections, ...PROMPTS];
  }

  function getFacetCount(items, group, id) {
    const state = getExploreState({ [group]: 'All' });
    return items.filter(prompt => {
      if (!matchesExploreState(prompt, state)) return false;
      if (id === 'All') return true;
      if (group === 'category') {
        return id === '视频提示词'
          ? prompt.mediaType === 'video' || prompt.category === '视频提示词'
          : prompt.category === id;
      }
      if (group === 'commerceType') {
        return id === 'AllCommerce'
          ? prompt.category === '电商视觉' || Boolean(prompt.commerceType)
          : prompt.commerceType === id;
      }
      return exploreFacets.matchesFacet(prompt, group, id);
    }).length;
  }

  function createExploreFacetChip({ label, count, active, onClick, disabled = false }) {
    const text = `${label} ${count}`;
    const attrs = {
      class: `filter-chip${active ? ' active' : ''}`,
      type: 'button',
      'aria-pressed': active ? 'true' : 'false'
    };
    if (disabled) attrs.disabled = 'disabled';
    const chip = el('button', attrs, text);
    chip.addEventListener('click', onClick);
    return chip;
  }

  function renderFacetChipRow(container, group, definitions, currentValue, allLabel, items) {
    if (!container) return;
    container.replaceChildren();
    const setValue = (value) => {
      if (group === 'category') currentCategory = value;
      else if (group === 'commerceType') currentCommerceType = value;
      else if (group === 'contentType') currentContentType = value;
      else if (group === 'style') currentStyle = value;
      else if (group === 'scene') currentScene = value;
      currentPage = 1;
      renderExploreFacets();
      renderPromptsGrid();
      syncExploreHash(false);
    };

    const allCount = getFacetCount(items, group, 'All');
    container.appendChild(createExploreFacetChip({
      label: allLabel,
      count: allCount,
      active: currentValue === 'All',
      onClick: () => setValue('All')
    }));

    definitions.forEach(definition => {
      const count = getFacetCount(items, group, definition.id || definition.name);
      container.appendChild(createExploreFacetChip({
        label: definition.label || definition.name,
        count,
        active: currentValue === (definition.id || definition.name),
        disabled: count === 0 && currentValue !== (definition.id || definition.name),
        onClick: () => setValue(definition.id || definition.name)
      }));
    });
  }

  function renderExploreFacets() {
    const items = getExploreItems();
    renderFacetChipRow($('#content-type-filter-chips'), 'contentType', exploreFacets.CONTENT_TYPES, currentContentType, '全部类型', items);
    renderFacetChipRow($('#style-filter-chips'), 'style', exploreFacets.STYLES, currentStyle, '全部风格', items);
    renderFacetChipRow($('#scene-filter-chips'), 'scene', exploreFacets.SCENES, currentScene, '全部场景', items);
    renderFacetChipRow($('#commerce-filter-chips'), 'commerceType', COMMERCE_FILTERS, currentCommerceType, '不限电商', items);
  }

  function renderExplore() {
    const app = $('#app');
    app.innerHTML = `
      <div class="explore-header">
        <div class="container">
          <h1>🔍 探索提示词</h1>
          <p>浏览全部 ${PROMPTS.length + getCollections().length} 个提示词（含 ${getCollections().length} 个我的收藏），按分类筛选或搜索关键词</p>
        </div>
      </div>
      <section class="section" style="padding-top:32px;">
        <div class="container explore-gallery-container">
          <div class="explore-toolbar">
            <div class="explore-search">
              <input type="text" id="explore-search-input" placeholder="搜索提示词标题、标签或内容..." value="${escapeHtml(currentSearch)}" />
            </div>
          </div>
          <section class="explore-facet-panel" aria-label="提示词筛选">
            <div class="explore-facet-row">
              <h2 class="explore-facet-label">内容类型</h2>
              <div class="filter-chips" id="content-type-filter-chips"></div>
            </div>
            <div class="explore-facet-row">
              <h2 class="explore-facet-label">视觉风格</h2>
              <div class="filter-chips" id="style-filter-chips"></div>
            </div>
            <div class="explore-facet-row">
              <h2 class="explore-facet-label">使用场景</h2>
              <div class="filter-chips" id="scene-filter-chips"></div>
            </div>
            <div class="explore-facet-row" id="commerce-filter-row">
              <h2 class="explore-facet-label">电商视觉</h2>
              <div class="filter-chips" id="commerce-filter-chips"></div>
            </div>
          </section>
          <div class="active-filter-bar" id="active-filter-bar"></div>
          <div style="margin:24px 0;font-size:14px;color:var(--text-muted);" id="result-count"></div>
          <div class="prompts-grid prompts-masonry" id="prompts-grid"></div>
          <div class="explore-load-sentinel" id="explore-load-sentinel" aria-hidden="true"></div>
          <div class="no-results" id="no-results" style="display:none;">
            <div class="no-results-icon">🔍</div>
            <p>没有找到匹配的提示词，试试其他关键词或分类吧</p>
          </div>
        </div>
      </section>
    `;

    $('#explore-search-input').addEventListener('input', (e) => {
      currentSearch = e.target.value;
      currentPage = 1;
      renderExploreFacets();
      renderPromptsGrid();
      syncExploreHash(true);
    });

    renderExploreFacets();
    renderPromptsGrid();
  }

  function updateChips() {
    renderExploreFacets();
  }

  function renderCommerceChips() {
    renderExploreFacets();
  }

  window.clearExploreFilters = function () {
    currentCategory = 'All';
    currentCommerceType = 'All';
    currentContentType = 'All';
    currentStyle = 'All';
    currentScene = 'All';
    currentSearch = '';
    currentPage = 1;
    const input = $('#explore-search-input');
    if (input) input.value = '';
    renderExploreFacets();
    renderPromptsGrid();
    syncExploreHash(false);
  };

  function stopExploreAutoLoad() {
    if (!exploreLoadObserver) return;
    exploreLoadObserver.disconnect();
    exploreLoadObserver = null;
  }

  function appendExploreCards(grid, prompts) {
    prompts.forEach(prompt => grid.appendChild(createPromptCard(prompt, { isCollection: prompt.isCollection })));
  }

  function watchExploreAutoLoad(filtered) {
    stopExploreAutoLoad();
    const sentinel = $('#explore-load-sentinel');
    if (!sentinel) return;
    if (exploreVisibleCount >= filtered.length) {
      sentinel.hidden = true;
      return;
    }

    sentinel.hidden = false;
    exploreLoadObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      const grid = $('#prompts-grid');
      if (!grid || !document.body.contains(sentinel)) return;
      const latestFiltered = getExploreItems().filter(prompt => matchesExploreState(prompt));
      const nextBatch = latestFiltered.slice(exploreVisibleCount, exploreVisibleCount + EXPLORE_BATCH_SIZE);
      if (!nextBatch.length) {
        sentinel.hidden = true;
        stopExploreAutoLoad();
        return;
      }
      exploreVisibleCount += nextBatch.length;
      appendExploreCards(grid, nextBatch);
      watchExploreAutoLoad(latestFiltered);
    }, { rootMargin: '900px 0px' });
    exploreLoadObserver.observe(sentinel);
  }

  function renderPromptsGrid() {
    const allPrompts = getExploreItems();
    const filtered = allPrompts.filter(prompt => matchesExploreState(prompt));
    const grid = $('#prompts-grid');
    const noResults = $('#no-results');
    const countEl = $('#result-count');
    const activeBar = $('#active-filter-bar');

    stopExploreAutoLoad();
    exploreVisibleCount = Math.min(EXPLORE_INITIAL_BATCH, filtered.length);
    currentPage = 1;

    if (countEl) {
      let countText = `找到 ${filtered.length} 个提示词`;
      if (currentContentType !== 'All') countText += ` · 类型: ${exploreFacets.CONTENT_TYPES.find(item => item.id === currentContentType)?.label || currentContentType}`;
      if (currentStyle !== 'All') countText += ` · 风格: ${exploreFacets.STYLES.find(item => item.id === currentStyle)?.label || currentStyle}`;
      if (currentScene !== 'All') countText += ` · 场景: ${exploreFacets.SCENES.find(item => item.id === currentScene)?.label || currentScene}`;
      if (currentCategory !== 'All') countText += ` · 分类: ${currentCategory}`;
      if (currentCommerceType !== 'All') countText += ` · 电商: ${currentCommerceType === 'AllCommerce' ? '全部电商' : currentCommerceType}`;
      if (currentSearch) countText += ` · 搜索: "${currentSearch}"`;
      countEl.textContent = countText;
    }

    if (activeBar) {
      const activeFilters = [];
      if (currentContentType !== 'All') activeFilters.push(`<span>类型：${escapeHtml(exploreFacets.CONTENT_TYPES.find(item => item.id === currentContentType)?.label || currentContentType)}</span>`);
      if (currentStyle !== 'All') activeFilters.push(`<span>风格：${escapeHtml(exploreFacets.STYLES.find(item => item.id === currentStyle)?.label || currentStyle)}</span>`);
      if (currentScene !== 'All') activeFilters.push(`<span>场景：${escapeHtml(exploreFacets.SCENES.find(item => item.id === currentScene)?.label || currentScene)}</span>`);
      if (currentCategory !== 'All') activeFilters.push(`<span>分类：${escapeHtml(currentCategory)}</span>`);
      if (currentCommerceType !== 'All') activeFilters.push(`<span>电商：${escapeHtml(currentCommerceType === 'AllCommerce' ? '全部电商' : currentCommerceType)}</span>`);
      if (currentSearch.trim()) activeFilters.push(`<span>关键词：${escapeHtml(currentSearch.trim())}</span>`);
      activeBar.innerHTML = activeFilters.length
        ? `${activeFilters.join('')}<button type="button" data-action="clear-explore-filters">清空筛选</button>`
        : '<span>选择分类、输入关键词，或从详情页点击标签继续探索。</span>';
    }

    if (filtered.length === 0) {
      if (grid) grid.innerHTML = '';
      if (noResults) noResults.style.display = 'block';
      return;
    }

    if (noResults) noResults.style.display = 'none';
    if (grid) {
      grid.innerHTML = '';
      appendExploreCards(grid, filtered.slice(0, exploreVisibleCount));
    }
    watchExploreAutoLoad(filtered);
  }

  function filterByCategory(catName) {
    currentCategory = catName;
    mergeLegacyCategoryIntoExplore(catName);
    currentPage = 1;
    if (currentRoute === 'explore') {
      updateChips();
      renderCommerceChips();
      renderPromptsGrid();
      syncExploreHash(false);
    }
  }

  function filterByTag(tag) {
    const overlay = $('#modal-overlay');
    if (overlay) overlay.classList.remove('active');
    detailReturnContext = null;
    showExploreWithState({
      category: 'All',
      search: tag,
      page: 1,
      hash: `#/tag/${encodeURIComponent(tag)}`
    });
    setTimeout(() => {
      const input = $('#explore-search-input');
      if (input) input.value = tag;
      renderPromptsGrid();
    }, 50);
  }

  // --- Render: Import ---
  let importMode = 'paste';
  let currentParsed = null;

  function renderImport() {
    const app = $('#app');
    const collections = getCollections();
    const tabs = [
      { key: 'paste',     icon: '📋', label: '粘贴识别', desc: '从社交媒体或微信公众号复制内容自动解析' },
      { key: 'manual',    icon: '✏️', label: '手动创建', desc: '直接填写提示词详细信息' },
      { key: 'extension', icon: '🧩', label: '浏览器插件', desc: '安装插件一键收藏网页提示词' }
    ];

    app.innerHTML = `
      <div class="imp-wrap">
        <div class="container">

          <!-- Page Header -->
          <div class="imp-head">
            <div class="imp-head-left">
              <div class="imp-head-avatar">📥</div>
              <div class="imp-head-text">
                <h1>导入提示词</h1>
                <p>收集你喜欢的 AI 提示词到个人收藏库</p>
              </div>
            </div>
            <a class="imp-head-stat" href="#/collections" data-action="navigate" data-route="collections">
              <span class="imp-head-stat-num">${collections.length}</span>
              <span class="imp-head-stat-label">已收藏</span>
            </a>
          </div>

          <!-- Segmented Tab Control -->
          <div class="imp-seg">
            ${tabs.map(t => `
              <button class="imp-seg-btn ${importMode === t.key ? 'on' : ''}" type="button" data-action="set-import-mode" data-mode="${escapeHtml(t.key)}">
                <span class="imp-seg-icon">${t.icon}</span>
                <span class="imp-seg-label">${t.label}</span>
              </button>
            `).join('')}
          </div>

          <!-- Paste Pane -->
          <div class="imp-pane ${importMode === 'paste' ? 'on' : ''}" id="imp-paste">
            <div class="imp-card">
              <div class="imp-card-top">
                <div class="imp-card-badge">STEP 1</div>
                <h2>粘贴帖子内容</h2>
                <p>从 Twitter / Reddit / Discord / 小红书 / 微信公众号复制帖子全文，智能算法自动提取提示词、图片和标题</p>
              </div>
              <div class="imp-paste-box">
                <textarea id="import-raw" class="imp-paste-area" placeholder="在此粘贴从社交媒体或微信公众号复制的帖子内容…&#10;&#10;系统会自动识别：&#10;• 完整提示词文本&#10;• 图片 URL&#10;• 公众号文章标题&#10;• 推荐分类与标签"></textarea>
              </div>
              <div class="imp-paste-bar">
                <div class="imp-chips">
                  <span class="imp-chip">Midjourney</span>
                  <span class="imp-chip">Stable Diffusion</span>
                  <span class="imp-chip">DALL·E</span>
                  <span class="imp-chip">微信公众号</span>
                  <span class="imp-chip">图片链接</span>
                </div>
                <div class="imp-paste-btns">
                  <button class="imp-btn-ghost" type="button" data-action="clear-import">清空</button>
                  <button class="imp-btn-primary" type="button" data-action="parse-and-preview">🔍 智能解析</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Manual Pane -->
          <div class="imp-pane ${importMode === 'manual' ? 'on' : ''}" id="imp-manual">
            <div class="imp-card">
              <div class="imp-card-top">
                <div class="imp-card-badge">FORM</div>
                <h2>手动创建提示词</h2>
                <p>直接填写提示词的标题、正文、分类和标签</p>
              </div>
              <div class="imp-form">
                <div class="imp-form-row">
                  <label>标题 <span class="imp-req">*</span></label>
                  <input type="text" id="manual-title" placeholder="给这个提示词起个名字" oninput="syncManualToEditor()" />
                </div>
                <div class="imp-form-row">
                  <label>提示词文本 <span class="imp-req">*</span></label>
                  <textarea id="manual-prompt" rows="5" placeholder="输入完整的英文提示词…" oninput="syncManualToEditor()"></textarea>
                </div>
                <div class="imp-form-grid2">
                  <div class="imp-form-row">
                    <label>分类</label>
                    <select id="manual-category" onchange="syncManualToEditor()">
                      ${CATEGORIES.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('')}
                    </select>
                  </div>
                  <div class="imp-form-row">
                    <label>标签</label>
                    <input type="text" id="manual-tags" placeholder="电影感, 写实, 8K" oninput="syncManualToEditor()" />
                  </div>
                </div>
                <div class="imp-form-row">
                  <label>图片链接（可选）</label>
                  <input type="text" id="manual-image" placeholder="https://example.com/image.jpg" oninput="syncManualToEditor()" />
                </div>
                <div class="imp-form-actions">
                  <button class="imp-btn-primary" type="button" data-action="save-manual">保存到收藏</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Extension Pane -->
          <div class="imp-pane ${importMode === 'extension' ? 'on' : ''}" id="imp-extension">
            <div class="imp-ext">
              <div class="imp-ext-hero">
                <div class="imp-ext-hero-icon">🧩</div>
                <div class="imp-ext-hero-text">
                  <h2>PromptHub 浏览器插件</h2>
                  <p>在任意网页检测到 AI 提示词，点击 🍌 香蕉按钮即可一键收藏</p>
                </div>
                <a class="imp-ext-download" href="https://github.com/kxbbw81-glitch/PromptHub-/raw/main/PromptHub-Extension-v3.29.0.zip" download="PromptHub-Extension-v3.29.0.zip" aria-label="下载 PromptHub 浏览器插件 v3.29.0">↓ 下载浏览器插件 <span>v3.29.0</span></a>
              </div>

              <div class="imp-ext-feats">
                <div class="imp-ext-feat">
                  <span class="imp-ext-feat-icon">🍌</span>
                  <strong>一键收藏</strong>
                  <p>自动检测网页上的提示词，点击即可保存</p>
                </div>
                <div class="imp-ext-feat">
                  <span class="imp-ext-feat-icon">🔍</span>
                  <strong>智能扫描</strong>
                  <p>识别 Midjourney / SD 等格式提示词及关联图片</p>
                </div>
                <div class="imp-ext-feat">
                  <span class="imp-ext-feat-icon">🔄</span>
                  <strong>批量同步</strong>
                  <p>收集的提示词一键同步到 PromptHub 收藏库</p>
                </div>
              </div>

              <div class="imp-ext-install">
                <h3>安装步骤</h3>
                <div class="imp-ext-steps">
                  <div class="imp-ext-step">
                    <span class="imp-ext-step-n">1</span>
                    <div><strong>打开扩展页面</strong><p>Chrome 输入 <code>chrome://extensions/</code>，Edge 输入 <code>edge://extensions/</code></p></div>
                  </div>
                  <div class="imp-ext-step">
                    <span class="imp-ext-step-n">2</span>
                    <div><strong>开启开发者模式</strong><p>打开页面右上角的「开发者模式」开关</p></div>
                  </div>
                  <div class="imp-ext-step">
                    <span class="imp-ext-step-n">3</span>
                    <div><strong>加载插件</strong><p>点击「加载已解压的扩展程序」，选择项目下的 <code>extension/</code> 文件夹</p></div>
                  </div>
                  <div class="imp-ext-step">
                    <span class="imp-ext-step-n">4</span>
                    <div><strong>开始使用</strong><p>工具栏出现 🍌 图标，在任意提示词页面点击即可收藏</p></div>
                  </div>
                </div>
              </div>

              <div class="imp-ext-sites">
                <span class="imp-ext-sites-label">🌐 支持网站</span>
                <div class="imp-ext-sites-list">
                  <span class="imp-ext-site">Twitter / X</span>
                  <span class="imp-ext-site">Reddit</span>
                  <span class="imp-ext-site">Discord</span>
                  <span class="imp-ext-site">Midjourney</span>
                  <span class="imp-ext-site">Civitai</span>
                  <span class="imp-ext-site">小红书</span>
                  <span class="imp-ext-site">任意网页</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Result / Editor (paste & manual) -->
          <div class="imp-result" id="imp-result" style="display:none;">
          </div>

        </div>
      </div>
    `;

    if (currentParsed) renderImportPreview(currentParsed);
    if (importMode === 'manual') setTimeout(syncManualToEditor, 50);
  }

  window.setImportMode = function (mode) {
    importMode = mode;
    currentParsed = null;
    renderImport();
  };

  window.syncManualToEditor = function () {
    if (importMode !== 'manual') return;
    const title = ($('#manual-title')?.value || '').trim();
    const prompt = ($('#manual-prompt')?.value || '').trim();

    // 自动分类：当提示词长度 > 30 时，根据内容自动选择分类
    if (prompt.length > 30) {
      const autoCat = autoCategorize(prompt);
      const catSelect = $('#manual-category');
      if (catSelect && catSelect.value !== autoCat) {
        catSelect.value = autoCat;
      }
    }

    if (!title && !prompt) {
      $('#imp-result').style.display = 'none';
      return;
    }
    // 多图：手动输入也支持多行图片链接
    const manualImages = ($('#manual-image')?.value || '').split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const item = {
      id: 'preview_manual',
      title: title || '(未命名)',
      prompt: prompt || '(请输入提示词)',
      category: $('#manual-category')?.value || autoCategorize(prompt),
      tags: ($('#manual-tags')?.value || '').trim()
        ? ($('#manual-tags')?.value).split(/[,，]/).map(t => t.trim()).filter(Boolean)
        : autoDetectTags(prompt),
      image: manualImages[0] || '',
      images: manualImages,
      date: new Date().toISOString().slice(0, 10),
      source: '手动录入'
    };
    renderImportPreview(item, true);
  };

  function renderImportPreview(item, isManual) {
    const box = $('#imp-result');
    if (!box) return;
    box.style.display = 'block';

    // 多图支持：images 数组优先，否则用单个 image
    const rawImages = item.images && item.images.length > 0
      ? item.images
      : (item.image ? [item.image] : []);
    const images = sanitizeImageUrls(rawImages);

    const source = isManual ? 'manual' : 'parsed';

    // 生成图片画廊 HTML
    let galleryHTML;
    if (images.length > 0) {
      galleryHTML = `
        <div class="imp-result-gallery" id="imp-gallery">
          <div class="imp-gallery-main">
            <img id="imp-gallery-main-img" src="${escapeHtml(images[0])}" alt="${escapeHtml(item.title)}" />
            <button class="imp-save-fab" id="imp-save-fab" type="button" title="收藏到库">
              <span>♡</span>
            </button>
            ${images.length > 1 ? `<span class="imp-gallery-count">${images.length} 张图片</span>` : ''}
          </div>
          ${images.length > 1 ? `
            <div class="imp-gallery-thumbs">
              ${images.map((url, i) => `
                <img class="imp-gallery-thumb ${i === 0 ? 'active' : ''}"
                     src="${escapeHtml(url)}"
                     data-index="${i}" />
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    } else {
      galleryHTML = `
        <div class="imp-result-gallery" id="imp-gallery">
          <div class="imp-gallery-main">
            <div class="imp-result-noimg">🖼️<br><span>未检测到图片</span></div>
            <button class="imp-save-fab" id="imp-save-fab" type="button" title="收藏到库">
              <span>♡</span>
            </button>
          </div>
        </div>
      `;
    }

    box.innerHTML = `
      <div class="imp-result-card">
        <div class="imp-result-head">
          <div class="imp-result-badge">${isManual ? '实时预览' : '解析结果'}</div>
          <h2>${isManual ? '编辑提示词信息' : '已自动提取，可直接收藏'}</h2>
          <p>所有字段均可编辑，确认无误后点击保存到收藏</p>
        </div>

        <div class="imp-result-body">
          ${galleryHTML}

          <div class="imp-result-fields">
            <div class="imp-field">
              <label>标题</label>
              <input type="text" id="edit-title" value="${escapeHtml(item.title)}" placeholder="提示词标题" />
            </div>
            <div class="imp-field-grid2">
              <div class="imp-field">
                <label>分类</label>
                <select id="edit-category">
                  ${CATEGORIES.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === item.category ? 'selected' : ''}>${escapeHtml(`${c.icon} ${c.name}`)}</option>`).join('')}
                </select>
              </div>
              <div class="imp-field">
                <label>标签</label>
                <input type="text" id="edit-tags" value="${escapeHtml((item.tags || []).join(', '))}" placeholder="逗号分隔" />
              </div>
            </div>
            <div class="imp-field">
              <div class="imp-field-label-row">
                <label>提示词文本</label>
                <button class="imp-mini-btn" id="imp-copy-preview" type="button">📋 复制</button>
              </div>
              <textarea id="edit-prompt" rows="5">${escapeHtml(item.prompt)}</textarea>
            </div>
            <div class="imp-field">
              <label>图片链接（多张图片请每行一个）</label>
              <textarea id="edit-image" rows="${Math.max(2, Math.min(images.length, 4))}" placeholder="https://…&#10;每行一个图片链接">${escapeHtml(images.join('\n'))}</textarea>
            </div>
          </div>
        </div>

        <div class="imp-result-foot imp-result-foot-subtle">
          <button class="imp-mini-btn" id="imp-cancel-preview" type="button">取消</button>
          <button class="imp-btn-primary imp-save-btn" id="imp-save-preview-btn" type="button">保存到收藏</button>
          <span class="imp-save-hint">快捷键 Ctrl + Enter 也可收藏</span>
        </div>
      </div>
    `;

    // 存储图片列表供切换使用
    window._impGalleryImages = images;
    window._impPreviewSource = source;
    const previewMainImage = $('#imp-gallery-main-img');
    previewMainImage?.addEventListener('error', () => {
      previewMainImage.replaceWith(el('div', { class: 'imp-result-noimg' }, '🖼️', el('br'), el('span', {}, '图片加载失败')));
    }, { once: true });
    $$('.imp-gallery-thumb', box).forEach((thumb, index) => {
      thumb.addEventListener('error', () => { thumb.style.display = 'none'; }, { once: true });
      thumb.addEventListener('click', () => window.switchGalleryImage(index));
    });
    $('#imp-save-fab')?.addEventListener('click', () => window.saveFromPreview(source));
    $('#imp-save-preview-btn')?.addEventListener('click', () => window.saveFromPreview(source));
    $('#imp-copy-preview')?.addEventListener('click', () => window.copyPreviewPrompt());
    $('#imp-cancel-preview')?.addEventListener('click', () => window.cancelResult());

    // 绑定快捷键：Ctrl/Cmd + Enter 收藏
    setTimeout(() => {
      const card = $('.imp-result-card');
      if (card) {
        card.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            saveFromPreview(source);
          }
        });
      }
      // 监听图片链接编辑，实时更新画廊
      const imgTextarea = $('#edit-image');
      if (imgTextarea) {
        imgTextarea.addEventListener('input', () => {
          const urls = sanitizeImageUrls(imgTextarea.value.split('\n'));
          window._impGalleryImages = urls;
          updateGalleryFromTextarea(urls);
        });
      }
    }, 0);
  }

  window.updatePreviewImage = function (url) {
    const img = $('.imp-gallery-main-img');
    const safeUrl = sanitizeImageUrl(url);
    if (img && safeUrl) { img.src = safeUrl; img.style.display = 'block'; }
  };

  // 画廊缩略图切换
  window.switchGalleryImage = function (index) {
    const images = window._impGalleryImages || [];
    if (!images[index]) return;
    const mainImg = $('#imp-gallery-main-img');
    if (mainImg) mainImg.src = images[index];
    document.querySelectorAll('.imp-gallery-thumb').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
    });
  };

  // 编辑图片链接时实时更新画廊
  function updateGalleryFromTextarea(urls) {
    const gallery = $('#imp-gallery');
    if (!gallery) return;
    const safeUrls = sanitizeImageUrls(urls);
    const source = window._impPreviewSource || 'parsed';

    if (safeUrls.length === 0) {
      gallery.innerHTML = `
        <div class="imp-gallery-main">
          <div class="imp-result-noimg">🖼️<br><span>未检测到图片</span></div>
          <button class="imp-save-fab" id="imp-save-fab" type="button" title="收藏到库"><span>♡</span></button>
        </div>
      `;
    } else {
      gallery.innerHTML = `
        <div class="imp-gallery-main">
          <img id="imp-gallery-main-img" src="${escapeHtml(safeUrls[0])}" alt="" />
          <button class="imp-save-fab" id="imp-save-fab" type="button" title="收藏到库"><span>♡</span></button>
          ${safeUrls.length > 1 ? `<span class="imp-gallery-count">${safeUrls.length} 张图片</span>` : ''}
        </div>
        ${safeUrls.length > 1 ? `
          <div class="imp-gallery-thumbs">
            ${safeUrls.map((url, i) => `
              <img class="imp-gallery-thumb ${i === 0 ? 'active' : ''}" src="${escapeHtml(url)}" data-index="${i}" />
            `).join('')}
          </div>
        ` : ''}
      `;
    }

    window._impGalleryImages = safeUrls;
    const mainImage = $('#imp-gallery-main-img');
    mainImage?.addEventListener('error', () => {
      mainImage.replaceWith(el('div', { class: 'imp-result-noimg' }, '🖼️', el('br'), el('span', {}, '图片加载失败')));
    }, { once: true });
    $('#imp-save-fab')?.addEventListener('click', () => window.saveFromPreview(source));
    $$('.imp-gallery-thumb', gallery).forEach((thumb, index) => {
      thumb.addEventListener('error', () => { thumb.style.display = 'none'; }, { once: true });
      thumb.addEventListener('click', () => window.switchGalleryImage(index));
    });
  }

  window.copyPreviewPrompt = function () {
    copyPrompt($('#edit-prompt')?.value || '');
  };

  window.cancelResult = function () {
    const box = $('#imp-result');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    currentParsed = null;
  };

  window.saveFromPreview = function (source) {
    const title = ($('#edit-title')?.value || '').trim();
    const prompt = ($('#edit-prompt')?.value || '').trim();
    if (!title || !prompt) { showToast('请填写标题和提示词'); return; }

    // 多图：按行分割图片链接
    const rawImages = sanitizeImageUrls(($('#edit-image')?.value || '').split('\n'));

    const item = {
      id: generateId(),
      title,
      prompt,
      category: $('#edit-category')?.value || autoCategorize(prompt),
      tags: ($('#edit-tags')?.value || '').trim()
        ? ($('#edit-tags').value).split(/[,，]/).map(t => t.trim()).filter(Boolean)
        : autoDetectTags(prompt),
      image: rawImages[0] || '',          // 兼容旧逻辑：第一张图
      images: rawImages,                   // 新字段：全部图片
      date: new Date().toISOString().slice(0, 10),
      source: source === 'manual' ? '手动录入' : '粘贴导入',
      ...(source === 'manual' ? { titleSource: 'manual' } : {})
    };

    if (saveCollection(item)) {
      showToast(`已收藏${rawImages.length > 1 ? `（${rawImages.length}张图片）` : ''}`);
      currentParsed = null;

      // 心形按钮视觉反馈
      const fab = $('.imp-save-fab');
      if (fab) {
        fab.classList.add('saved');
        fab.querySelector('span').textContent = '♥';
        fab.disabled = true;
      }

      setTimeout(() => navigate('collections'), 800);
    } else {
      showToast('已在收藏中，无需重复保存');
      const fab = $('.imp-save-fab');
      if (fab) {
        fab.classList.add('saved');
        fab.querySelector('span').textContent = '♥';
      }
    }
  };

  window.parseAndPreview = function () {
    const raw = $('#import-raw')?.value;
    if (!raw || !raw.trim()) { showToast('请先粘贴内容'); return; }

    const box = $('#imp-result');
    box.style.display = 'block';
    box.innerHTML = `
      <div class="imp-result-card imp-result-loading">
        <div class="imp-spinner"></div>
        <div class="imp-loading-text">正在智能解析…</div>
        <div class="imp-loading-hint">识别提示词、图片、标题和分类</div>
      </div>
    `;

    setTimeout(() => {
      const parsed = smartParse(raw);
      if (!parsed || !parsed.prompt) {
        box.innerHTML = `
          <div class="imp-result-card imp-result-error">
            <div class="imp-error-icon">😕</div>
            <div class="imp-error-title">未能解析出提示词</div>
            <div class="imp-error-desc">请确认内容包含英文提示词文本，或切换到「手动创建」</div>
            <button class="imp-btn-ghost" type="button" data-action="set-import-mode" data-mode="manual">→ 切换到手动创建</button>
          </div>
        `;
        return;
      }
      currentParsed = { ...parsed, id: generateId(), date: new Date().toISOString().slice(0, 10) };
      renderImportPreview(currentParsed, false);
      showToast('解析成功！可编辑后保存');
    }, 600);
  };

  window.clearImport = function () {
    const ta = $('#import-raw');
    if (ta) ta.value = '';
    const box = $('#imp-result');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    currentParsed = null;
  };

  window.saveManual = function () {
    syncManualToEditor();
    saveFromPreview('manual');
  };

  // 弹窗图片切换
  window.switchModalImage = function (index) {
    const images = window._modalGalleryImages || [];
    if (!images[index]) return;
    const mainImg = $('#modal-main-img');
    if (mainImg) mainImg.src = images[index];
    document.querySelectorAll('.modal-gallery-thumb').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
    });
  };


  // --- Render: Collections ---
  function renderCollections() {
    const app = $('#app');
    const collections = getCollections();

    app.innerHTML = `
      <div class="explore-header" style="background: linear-gradient(135deg, #fce4ec, #fff3e0);">
        <div class="container">
          <h1>❤️ 我的收藏</h1>
          <p>共收藏了 ${collections.length} 个提示词，随时查看、复制和管理</p>
        </div>
      </div>
      <section class="section" style="padding-top:32px;">
        <div class="container">
          <div class="collections-toolbar">
            <div class="filter-chips" id="collection-filter-chips"></div>
            ${collections.length > 0 ? `<button class="btn btn-outline" style="font-size:13px;padding:8px 16px;" type="button" data-action="export-collections">📤 导出 JSON</button>` : ''}
          </div>
          <div id="collections-content"></div>
        </div>
      </section>
    `;

    const content = $('#collections-content');

    if (collections.length === 0) {
      content.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">📭</div>
          <p style="font-size:16px;margin-bottom:8px;">还没有收藏任何提示词</p>
          <p style="font-size:14px;color:var(--text-muted);">去「导入」页面添加，或在浏览时点击卡片上的收藏按钮</p>
          <button class="btn btn-yellow" style="margin-top:20px;" type="button" data-action="navigate" data-route="import">📥 去导入</button>
        </div>
      `;
      return;
    }

    // Category filter for collections
    const colCats = ['全部', ...new Set(collections.map(c => c.category))];
    const chipsContainer = $('#collection-filter-chips');
    colCats.forEach(cat => {
      const chip = el('button', { class: 'filter-chip' + (cat === '全部' ? ' active' : '') }, cat === '全部' ? '全部' : cat);
      chip.addEventListener('click', () => {
        $$('#collection-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderCollectionGrid(cat);
      });
      chipsContainer.appendChild(chip);
    });

    renderCollectionGrid('全部');
  }

  function renderCollectionGrid(filterCat) {
    const content = $('#collections-content');
    let list = getCollections();
    if (filterCat !== '全部') list = list.filter(c => c.category === filterCat);

    if (list.length === 0) {
      content.innerHTML = '<div class="no-results"><div class="no-results-icon">🔍</div><p>该分类下暂无收藏</p></div>';
      return;
    }

    const grid = el('div', { class: 'prompts-grid' });
    list.forEach(p => grid.appendChild(createPromptCard(p, { isCollection: true })));

    // Re-append (clear previous)
    content.innerHTML = '';
    content.appendChild(grid);
  }

  window.exportCollections = function () {
    const data = getCollections();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompthub_collections_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('收藏数据已导出');
  };

  // --- Listen for extension imports ---
  function checkExtensionImport() {
    const raw = localStorage.getItem(EXT_IMPORT_KEY);
    if (raw) {
      try {
        const payload = JSON.parse(raw);
        const items = Array.isArray(payload) ? payload : payload?.items;
        const batchId = Array.isArray(payload) ? '' : limitedText(payload?.batchId, 120);
        if (Array.isArray(items) && items.length > 0) {
          let saved = 0;
          items.forEach(item => {
            const sharedParser = window.PromptHubParser;
            if (sharedParser?.parsePromptText && item.prompt) {
              const parsed = sharedParser.parsePromptText(item.prompt, {
                titleCandidates: [item.title],
                pageTitle: item.domain || item.source
              });
              if (parsed?.prompt) {
                if (!item.title || sharedParser.isGenericTitle(item.title) || sharedParser.titleLooksLikePrompt(item.title, item.prompt)) {
                  item.title = parsed.title;
                }
                item.prompt = parsed.prompt;
                if (parsed.imageUrls?.length) {
                  const mergedImages = [...(item.images || []), ...parsed.imageUrls];
                  item.images = [...new Set(mergedImages)];
                  item.image = item.image || item.images[0] || '';
                }
              }
            }
            item.id = item.id || generateId();
            item.date = item.date || new Date().toISOString().slice(0, 10);
            // 自动分类：如果分类为空或是默认值，根据提示词重新检测
            if (!item.category || item.category === 'Abstract' || item.category === '未分类' || item.category === '抽象') {
              item.category = autoCategorize(item.prompt || '');
            }
            // 自动标签：如果标签为空，根据提示词检测
            if (!item.tags || item.tags.length === 0) {
              item.tags = autoDetectTags(item.prompt || '');
            }
            // 多图兼容：确保 images 数组存在
            if (item.images && item.images.length > 0) {
              item.image = item.image || item.images[0];
            } else if (item.image) {
              item.images = [item.image];
            } else {
              item.images = [];
            }
            if (saveCollection(item)) saved++;
          });
          showToast(`浏览器插件导入了 ${saved} 个提示词`);
          localStorage.removeItem(EXT_IMPORT_KEY);
          if (batchId) {
            localStorage.setItem(EXT_SYNC_RECEIPT_KEY, JSON.stringify({
              batchId,
              total: items.length,
              saved,
              receivedAt: new Date().toISOString()
            }));
          }
          // 导入成功后自动跳转到收藏页面
          if (saved > 0) {
            navigate('collections');
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  // --- Router ---
  function navigate(route, opts = {}) {
    currentRoute = route;
    window.scrollTo(0, 0);

    if (route === 'home') renderHome();
    else if (route === 'explore') {
      if (!opts.preserve) {
        currentCategory = 'All';
        currentCommerceType = 'All';
        currentContentType = 'All';
        currentStyle = 'All';
        currentScene = 'All';
        currentSearch = '';
        currentPage = 1;
      }
      renderExplore();
    }
    else if (route === 'import') renderImport();
    else if (route === 'collections') renderCollections();
    else if (route === 'disclaimer') renderDisclaimer();

    setNavActive(route);
  }

  window.navigate = navigate;
  window.openExplore = () => showExploreWithState();
  window.openPromptModal = openPromptModal;
  window.openPromptDetail = openPromptDetail;
  window.filterByTag = filterByTag;

  function scrollToTarget(selector) {
    if (!selector) return;
    try {
      document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
    } catch { /* ignore invalid selectors */ }
  }

  function bindSafeActionDelegation() {
    document.addEventListener('click', (event) => {
      const control = event.target.closest('[data-action]');
      if (!control) return;

      const action = control.dataset.action;
      if (!action) return;
      event.preventDefault();

      if (action === 'navigate') {
        navigate(control.dataset.route || 'home');
        return;
      }
      if (action === 'navigate-scroll') {
        navigate(control.dataset.route || 'home');
        setTimeout(() => scrollToTarget(control.dataset.scrollTarget), 100);
        return;
      }
      if (action === 'scroll') {
        scrollToTarget(control.dataset.scrollTarget);
        return;
      }
      if (action === 'open-explore') {
        showExploreWithState();
        return;
      }
      if (action === 'open-prompt') {
        openPromptDetail(control.dataset.promptId || '');
        return;
      }
      if (action === 'return-browse') {
        window.returnToBrowse();
        return;
      }
      if (action === 'clear-explore-filters') {
        window.clearExploreFilters();
        return;
      }
      if (action === 'set-import-mode') {
        window.setImportMode(control.dataset.mode || 'paste');
        return;
      }
      if (action === 'clear-import') {
        window.clearImport();
        return;
      }
      if (action === 'parse-and-preview') {
        window.parseAndPreview();
        return;
      }
      if (action === 'save-manual') {
        window.saveManual();
        return;
      }
      if (action === 'export-collections') {
        window.exportCollections();
      }
    });
  }

  // --- Init ---
  function init() {
    bindSafeActionDelegation();
    const navSearchInput = $('#nav-search-input');
    if (navSearchInput) {
      navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          currentSearch = e.target.value;
          currentCategory = 'All';
          currentCommerceType = 'All';
          currentContentType = 'All';
          currentStyle = 'All';
          currentScene = 'All';
          currentPage = 1;
          navigate('explore', { preserve: true });
          syncExploreHash(false);
        }
      });
    }

    const overlay = el('div', { id: 'modal-overlay', class: 'modal-overlay' });
    document.body.appendChild(overlay);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.classList.remove('active');
    });

    // 支持 URL hash 路由（插件同步时打开 #/collections 等链接）
    function handleHashRoute() {
      const hash = window.location.hash.replace(/^#\/?/, '');
      const [path, queryString = ''] = hash.split('?');
      const detailMatch = hash.match(/^(prompt|collection)\/(.+)$/);
      if (detailMatch) {
        openPromptDetail(decodeURIComponent(detailMatch[2]), detailMatch[1] === 'collection', false);
        return true;
      }
      const categoryMatch = path.match(/^category\/(.+)$/);
      if (categoryMatch) {
        currentCategory = decodeURIComponent(categoryMatch[1]);
        currentCommerceType = 'All';
        currentContentType = 'All';
        currentStyle = 'All';
        currentScene = 'All';
        currentSearch = '';
        currentPage = 1;
        mergeLegacyCategoryIntoExplore(currentCategory);
        navigate('explore', { preserve: true });
        return true;
      }
      const tagMatch = path.match(/^tag\/(.+)$/);
      if (tagMatch) {
        currentCategory = 'All';
        currentCommerceType = 'All';
        currentContentType = 'All';
        currentStyle = 'All';
        currentScene = 'All';
        currentSearch = decodeURIComponent(tagMatch[1]);
        currentPage = 1;
        navigate('explore', { preserve: true });
        return true;
      }
      if (path === 'explore') {
        const params = new URLSearchParams(queryString);
        currentCategory = params.get('category') || 'All';
        currentCommerceType = params.get('commerceType') || 'All';
        currentContentType = params.get('type') || 'All';
        currentStyle = params.get('style') || 'All';
        currentScene = params.get('scene') || 'All';
        if (!exploreFacets.CONTENT_TYPES.some(item => item.id === currentContentType)) currentContentType = 'All';
        if (!exploreFacets.STYLES.some(item => item.id === currentStyle)) currentStyle = 'All';
        if (!exploreFacets.SCENES.some(item => item.id === currentScene)) currentScene = 'All';
        if (!COMMERCE_FILTERS.some(item => item.id === currentCommerceType) && currentCommerceType !== 'All') currentCommerceType = 'All';
        mergeLegacyCategoryIntoExplore(currentCategory);
        currentSearch = params.get('q') || '';
        currentPage = 1;
        navigate('explore', { preserve: true });
        return true;
      }
      if (path && ['home', 'import', 'collections', 'disclaimer'].includes(path)) {
        navigate(path);
        return true;
      }
      return false;
    }
    window.addEventListener('hashchange', handleHashRoute);
    window.addEventListener('popstate', handleHashRoute);

    // 页面加载时检查 hash 路由，没有 hash 则渲染首页
    if (!handleHashRoute()) {
      renderHome();
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== 'prompthub-extension') return;

      if (message.action === 'ready') {
        extensionBridgeReady = true;
        return;
      }

      if (message.action === 'collection-sync-result') {
        if (!message.success) {
          showToast(message.error || 'GitHub 收藏同步失败');
          loadCollections({ force: true }).catch(() => {});
          return;
        }

        if (message.operation === 'create') {
          showToast(message.alreadySaved
            ? '该提示词已在收藏中，未重复保存'
            : '已推送到 GitHub 收藏，国内站将在 30 分钟后同步');
        }

        loadCollections({ force: true }).then(() => {
          if (!handleHashRoute()) navigate(currentRoute, { preserve: true });
        }).catch(() => showToast('GitHub 收藏已提交，页面刷新稍后重试'));
      }
    });

    const bridgeProbe = setInterval(() => {
      if (extensionBridgeReady) {
        clearInterval(bridgeProbe);
        return;
      }
      window.postMessage({ source: 'prompthub-site', operation: 'ping' }, window.location.origin);
    }, 1500);
    window.postMessage({ source: 'prompthub-site', operation: 'ping' }, window.location.origin);

    loadCollections().then(() => {
      if (!handleHashRoute()) navigate(currentRoute, { preserve: true });
    }).catch(() => showToast('收藏数据暂时无法连接 GitHub'));

    setInterval(() => {
      loadCollections({ force: true }).then(() => {
        if (currentRoute === 'collections') renderCollections();
      }).catch(() => {});
    }, isDomesticSite() ? 300000 : 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
