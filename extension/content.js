// ==========================================
// PromptHub Extension v2 - Content Script
// 轻量注入：仅响应扫描请求和同步数据写入
// 不再自动注入浮动按钮，避免干扰用户浏览
// ==========================================

(function () {
  'use strict';

  if (window.__prompthub_v2__) return;
  window.__prompthub_v2__ = true;

  // --- 提示词检测评分 ---
  const PROMPT_INDICATORS = [
    'photorealistic', 'cinematic', '8k', '4k', 'ultra detailed', 'hyperrealistic',
    'hyperdetailed', 'digital art', 'oil painting', 'watercolor', 'concept art',
    'portrait of', 'landscape of', 'shot on', 'dslr', 'bokeh',
    'depth of field', 'studio lighting', 'golden hour', 'volumetric',
    'render', 'octane', 'unreal engine', 'blender', 'midjourney',
    'stable diffusion', 'dalle', 'prompt', 'negative prompt',
    'aspect ratio', '--ar', '--v', '--style', '--chaos', '--stylize', '--niji',
    'style of', 'in the style of', 'masterpiece', 'best quality',
    'highly detailed', 'intricate', 'soft lighting', 'dramatic lighting',
    'natural lighting', 'close up', 'wide angle', 'full body', 'upper body',
    'f/1.4', 'f/2.8', 'f/4', '85mm', '50mm', '35mm', '100mm', '24mm',
    'canon', 'nikon', 'sony', 'leica', 'hasselblad',
    'trending on artstation', 'greg rutkowski', 'weta digital',
    'sharp focus', 'rim lighting', 'backlit', 'cinematic lighting',
    'matte painting', 'vfx', 'ethereal', 'surreal', 'ornate',
    'anime', 'manga', 'studio ghibli', 'makoto shinkai',
    'cyberpunk', 'steampunk', 'dieselpunk',
    'pen and ink', 'pencil sketch', 'charcoal', 'pastel',
    'low poly', 'isometric', 'voxel art', 'pixel art',
    'logo design', 'typography', 'flat design',
    'matte', 'glossy', 'iridescent', 'translucent',
    'wide-angle lens', 'telephoto', 'macro lens', 'tilt-shift'
  ];

  function isPromptLike(text) {
    const t = text.toLowerCase();
    let score = 0;
    for (const ind of PROMPT_INDICATORS) {
      if (t.includes(ind)) score++;
    }
    const wordCount = text.split(/\s+/).length;
    const commaCount = (text.match(/,/g) || []).length;
    if (wordCount > 15 && commaCount >= 3) score += 2;
    if (wordCount > 30) score += 1;
    // Midjourney 参数是强信号
    if (/--(ar|v|style|chaos|stylize|niji|seed|hd)\b/.test(t)) score += 3;
    return score >= 3 && text.length > 50;
  }

  // --- 分类检测 ---
  const CAT_KEYWORDS = {
    '人像': ['portrait', 'face', 'model', 'person', 'woman', 'man', 'selfie', 'headshot', 'girl', 'boy'],
    '风景': ['landscape', 'mountain', 'sunrise', 'sunset', 'valley', 'horizon', 'forest', 'lake'],
    '建筑': ['architecture', 'building', 'interior', 'facade', 'house', 'skyscraper'],
    '科幻': ['sci-fi', 'space', 'futuristic', 'robot', 'alien', 'spaceship', 'galaxy'],
    '赛博朋克': ['cyberpunk', 'neon', 'cyber', 'hologram', 'dystopian'],
    '奇幻': ['fantasy', 'dragon', 'wizard', 'magic', 'elf', 'dungeon', 'castle', 'knight'],
    '动物': ['animal', 'dog', 'cat', 'lion', 'wolf', 'bird', 'wildlife', 'fox', 'tiger'],
    '静物': ['still life', 'vase', 'fruit', 'tabletop'],
    '美食': ['food', 'dish', 'cuisine', 'sushi', 'pizza', 'coffee', 'dessert', 'cake'],
    '时尚': ['fashion', 'outfit', 'runway', 'couture', 'dress', 'streetwear'],
    '角色': ['character', 'concept art', 'hero', 'villain', 'warrior', 'samurai'],
    '抽象': ['abstract', 'swirl', 'geometric', 'pattern', 'texture', 'fractal'],
    '自然': ['forest', 'flower', 'tree', 'ocean', 'river', 'leaf', 'butterfly', 'waterfall'],
    '城市': ['city', 'urban', 'skyline', 'street', 'cityscape', 'downtown']
  };

  function detectCategory(text) {
    const lower = text.toLowerCase();
    let category = '抽象';
    let maxScore = 0;
    for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
      const s = kws.reduce((acc, kw) => acc + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
      if (s > maxScore) { maxScore = s; category = cat; }
    }
    return category;
  }

  function extractTags(text) {
    const lower = text.toLowerCase();
    const tagMap = [
      'cinematic', 'photorealistic', 'oil painting', 'watercolor', 'digital art',
      'anime', 'minimalist', 'dark', 'dreamy', 'vintage', 'macro', 'bokeh',
      'golden hour', 'studio lighting', '8k', 'ultra detailed', 'hyperrealistic',
      'concept art', 'octane render', 'unreal engine', 'trending on artstation',
      'cyberpunk', 'steampunk', 'low poly', 'pixel art'
    ];
    const tags = tagMap.filter(t => lower.includes(t));
    return tags.length > 0 ? tags.slice(0, 5) : ['AI生成'];
  }

  // --- 查找内容图片（排除头像/图标） ---
  // 头像/图标 URL 模式黑名单
  const AVATAR_PATTERNS = [
    'profile_images', 'default_profile',  // Twitter/X 头像
    'avatar', 'profile_pic', 'profilepic',  // 通用头像
    'icon', 'emoji', 'badge', 'logo',      // 图标
    'favicon', 'sprite', 'placeholder',     // 装饰图
    'giphy_profile', 'twitch_profile',      // 其他平台头像
  ];

  // 头像/图标 CSS 类名黑名单
  const AVATAR_CLASS_PATTERNS = [
    'avatar', 'profile-image', 'profile-pic', 'profilepic',
    'user-avatar', 'user-image', 'account-icon', 'icon',
  ];

  function isAvatarOrIcon(img) {
    if (!img || !img.src) return true;

    const src = img.src.toLowerCase();

    // URL 模式匹配
    for (const pattern of AVATAR_PATTERNS) {
      if (src.includes(pattern)) return true;
    }

    // CSS 类名匹配 — 检查 img 及其所有祖先元素
    let node = img;
    for (let i = 0; i < 4 && node; i++) {
      const cls = (node.className || '').toString().toLowerCase();
      for (const pattern of AVATAR_CLASS_PATTERNS) {
        if (cls.includes(pattern)) return true;
      }
      node = node.parentElement;
    }

    // 圆形图片（border-radius: 50%）几乎都是头像
    try {
      const style = window.getComputedStyle(img);
      const radius = parseFloat(style.borderRadius) || 0;
      const w = img.getBoundingClientRect().width;
      if (w > 0 && radius / w >= 0.45) return true;  // 接近正圆
    } catch (e) { /* ignore */ }

    // 尺寸过小（< 80px）通常是图标
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 80) return true;
    if (rect.height > 0 && rect.height < 80) return true;

    return false;
  }

  // 优先按站点选择器查找所有内容图片（排除头像/图标）
  function findContentImages(el) {
    const results = [];
    const seen = new Set();

    function addImg(img) {
      if (!img || !img.src || isAvatarOrIcon(img)) return;
      if (seen.has(img.src)) return;
      seen.add(img.src);
      results.push(img.src);
    }

    // 1. 站点特定选择器（最高优先级）
    const siteSelectors = [
      // Twitter/X — 帖子图片（可能有多张）
      '[data-testid="tweetPhoto"] img',
      'article [data-testid="tweetPhoto"] img',
      // Reddit — 帖子图片
      '[data-testid="post-content"] img',
      '.media-element img',
      // Discord — 消息附件
      '[class*="imageWrapper"] img',
      // Civitai / 通用
      '[class*="gallery"] img',
      '[class*="post-image"] img',
    ];

    let article = el.closest('article') || el.closest('[data-testid="tweet"]') ||
                  el.closest('[data-testid="post-content"]') || el.closest('.post') ||
                  el.closest('[class*="message"]') || el;

    for (const sel of siteSelectors) {
      const imgs = article.querySelectorAll ? article.querySelectorAll(sel) : [];
      imgs.forEach(addImg);
    }

    // 2. 在父容器中查找
    let container = el;
    for (let i = 0; i < 3; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      const imgs = container.querySelectorAll('img');
      imgs.forEach(addImg);
    }

    // 3. 兄弟元素中查找
    const siblings = [
      el.previousElementSibling,
      el.nextElementSibling,
      el.parentElement?.previousElementSibling,
      el.parentElement?.nextElementSibling
    ];
    for (const sib of siblings) {
      if (!sib) continue;
      if (sib.tagName === 'IMG') addImg(sib);
      const imgs = sib.querySelectorAll ? sib.querySelectorAll('img') : [];
      imgs.forEach(addImg);
    }

    return results;
  }

  // 兼容旧调用：返回第一张图
  function findContentImage(el) {
    const imgs = findContentImages(el);
    return imgs[0] || '';
  }

  // --- 提取标题 ---
  function extractTitle(text, el) {
    // 尝试从前一个标题元素获取
    let prev = el.previousElementSibling;
    for (let i = 0; i < 3 && prev; i++) {
      if (/^H[1-4]$/i.test(prev.tagName)) {
        const t = prev.textContent.trim().slice(0, 50);
        if (t) return t;
      }
      prev = prev.previousElementSibling;
    }
    // 从文本第一行提取
    const firstLine = text.split('\n')[0].trim();
    if (firstLine.length < 60 && firstLine.length > 3) return firstLine;
    // 从第一个句子提取
    const firstSentence = text.split(/[.!?。！？]/)[0].trim().slice(0, 50);
    if (firstSentence.length > 3) return firstSentence;
    return '未命名提示词';
  }

  // --- 扫描页面提示词 ---
  function extractPrompts() {
    const prompts = [];
    const seen = new Set();

    // 通用选择器 + 站点特定选择器
    const selectors = [
      'p', 'pre', 'code', 'blockquote', 'li',
      '[class*="prompt"]', '[data-testid*="prompt"]',
      // Twitter/X
      '[data-testid="tweetText"]',
      // Reddit
      '[data-testid="post-content"]', '.RichTextJSON-root', '.md',
      // Discord
      '[class*="markup"]', '[id*="message-content"]',
      // 通用内容容器
      '[class*="caption"]', '[class*="description"]', '[class*="post-text"]'
    ];

    const elements = document.querySelectorAll(selectors.join(', '));

    for (const el of elements) {
      // 跳过嵌套元素（取最内层）
      if (el.querySelector(selectors.join(', '))) continue;

      const text = el.textContent.trim();
      if (text.length < 50 || text.length > 3000) continue;
      if (seen.has(text)) continue;

      if (isPromptLike(text)) {
        seen.add(text);

        const title = extractTitle(text, el);
        const images = findContentImages(el);
        const image = images[0] || '';
        const category = detectCategory(text);
        const tags = extractTags(text);

        prompts.push({
          id: 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          title,
          prompt: text,
          category,
          tags,
          image,
          images,
          url: location.href,
          domain: location.hostname,
          source: '插件扫描',
          date: new Date().toISOString().slice(0, 10),
          timestamp: Date.now()
        });
      }
    }

    return prompts;
  }

  // --- 消息监听 ---
  chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'scan') {
      const prompts = extractPrompts();
      sendResponse({ prompts, url: location.href, title: document.title });
      return true;
    }

    if (request.action === 'extensionImport') {
      // 接收从插件同步的提示词，写入网站 localStorage
      try {
        const existing = JSON.parse(localStorage.getItem('prompthub_ext_import') || '[]');
        const merged = [...existing, ...(request.data || [])];
        const seen = new Set();
        const deduped = merged.filter(item => {
          if (seen.has(item.prompt)) return false;
          seen.add(item.prompt);
          return true;
        });
        localStorage.setItem('prompthub_ext_import', JSON.stringify(deduped));
        sendResponse({ success: true, count: deduped.length });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
  });
})();
