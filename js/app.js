// ==========================================
// PromptHub - Application Logic
// ==========================================

(function () {
  'use strict';

  // --- State ---
  let currentRoute = 'home';
  let currentCategory = 'All';
  let currentSearch = '';
  let currentPage = 1;
  const PAGE_SIZE = 24;

  // --- Collections (localStorage) ---
  const COLLECTIONS_KEY = 'prompthub_collections';
  const EXT_IMPORT_KEY = 'prompthub_ext_import';

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
    'Cityscape': '城市'
  };

  function normalizeCategory(cat) {
    if (!cat) return '抽象';
    if (CATEGORY_LEGACY_MAP[cat]) return CATEGORY_LEGACY_MAP[cat];
    return cat;
  }

  function getCollections() {
    try {
      const list = JSON.parse(localStorage.getItem(COLLECTIONS_KEY)) || [];
      return list.map(item => ({ ...item, category: normalizeCategory(item.category) }));
    } catch { return []; }
  }

  function saveCollection(item) {
    const list = getCollections();
    if (list.some(c => c.id === item.id)) return false;
    list.unshift(item);
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(list));
    return true;
  }

  function deleteCollection(id) {
    const list = getCollections().filter(c => c.id !== id);
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(list));
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
      else if (key === 'html') node.innerHTML = attrs[key];
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
    toast.innerHTML = '<span class="toast-icon">✓</span>' + message;
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

  // --- Smart Parse: extract prompt from pasted text ---
  function smartParse(rawText) {
    const text = rawText.trim();
    if (!text) return null;

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
      rawImages: imageUrls,
      source: '粘贴导入'
    };
  }

  // --- Prompt Card ---
  function createPromptCard(prompt, opts = {}) {
    const isCollection = opts.isCollection || prompt.isCollection;
    const card = el('div', { class: 'prompt-card', onclick: () => openPromptModal(prompt.id, isCollection) });

    // 来源标记：收藏 / 已验证 / 待验证
    let sourceHTML;
    if (isCollection) {
      sourceHTML = '<span style="font-size:11px;color:var(--red);font-weight:600;">❤ 我的收藏</span>';
    } else if (prompt.verified) {
      sourceHTML = '<span class="verified-badge">已验证</span>';
    } else if (prompt.source) {
      sourceHTML = `<span style="font-size:11px;color:var(--purple)">${prompt.source}</span>`;
    } else {
      sourceHTML = '<span style="font-size:11px;color:#999">待验证</span>';
    }

    card.innerHTML = `
      <img class="prompt-card-img" src="${prompt.image || 'https://picsum.photos/seed/' + prompt.id + '/500/500'}" alt="${prompt.title}" loading="lazy" onerror="this.src='https://picsum.photos/seed/fallback/500/500'" />
      <div class="prompt-card-body">
        <div class="prompt-card-top">
          <span class="prompt-card-category">${prompt.category}</span>
          ${sourceHTML}
        </div>
        <div class="prompt-card-title">${prompt.title}</div>
        <div class="prompt-card-tags">
          ${(prompt.tags || []).slice(0, 3).map(t => `<span class="prompt-tag">${t}</span>`).join('')}
        </div>
        <div class="prompt-card-footer">
          <div class="prompt-card-stats">
            <span>${isCollection ? '📅 ' + (prompt.date || '未知') : '❤ ' + (prompt.likes || 0)}</span>
          </div>
          <button class="copy-btn-mini" onclick="event.stopPropagation();">复制</button>
        </div>
      </div>
    `;

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
      : (prompt.source ? `<span style="font-size:12px;color:var(--purple)">${prompt.source}</span>` : '<span style="font-size:12px;color:#999">待验证</span>');

    const isCol = isCollected(prompt.id);
    const collectBtnHTML = isCollection
      ? `<button class="copy-btn" id="modal-delete-btn" style="background:var(--red)">🗑 删除</button>`
      : `<button class="copy-btn" id="modal-collect-btn" style="background:${isCol ? 'var(--green)' : 'var(--purple)'}" data-id="${prompt.id}">${isCol ? '❤ 已收藏' : '☆ 收藏'}</button>`;

    overlay.innerHTML = `
      <div class="modal">
        <button class="modal-close" onclick="document.getElementById('modal-overlay').classList.remove('active')">×</button>
        <img class="modal-img" src="${prompt.image || 'https://picsum.photos/seed/' + prompt.id + '/500/500'}" alt="${prompt.title}" onerror="this.src='https://picsum.photos/seed/fallback/500/500'" />
        <div class="modal-body">
          <div class="modal-category-row">
            <span class="modal-category-badge">${prompt.category}</span>
            ${verifiedHTML}
          </div>
          <h2 class="modal-title">${prompt.title}</h2>
          <div class="modal-tags">
            ${(prompt.tags || []).map(t => `<span class="prompt-tag">${t}</span>`).join('')}
          </div>
          <div class="modal-prompt-section">
            <div class="modal-prompt-label">
              <span>提示词文本</span>
              <div style="display:flex;gap:8px;">
                ${collectBtnHTML}
                <button class="copy-btn" id="modal-copy-btn">📋 复制提示词</button>
              </div>
            </div>
            <div class="modal-prompt-text">${prompt.prompt}</div>
          </div>
          <div class="modal-meta">
            <span>${isCollection ? '📅 ' + (prompt.date || '未知日期') : '❤ ' + (prompt.likes || 0) + ' 人喜欢'}</span>
            <span>🏷 #${prompt.id}</span>
          </div>
        </div>
      </div>
    `;

    overlay.classList.add('active');

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

  // --- Render: Home ---
  function renderHome() {
    const app = $('#app');
    const todayTop = [...PROMPTS].sort((a, b) => b.likes - a.likes).slice(0, 6);
    const catCounts = {};
    CATEGORIES.forEach(c => { catCounts[c.name] = 0; });
    PROMPTS.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });

    app.innerHTML = `
      <section class="hero">
        <div class="container hero-content">
          <div class="hero-badge">🍌 每日更新 · 已验证 · 免费使用</div>
          <h1>发现高质量 <span class="highlight">AI 提示词</span><br>激发无限创作灵感</h1>
          <p>不断增长的提示词收藏库，每日更新，一键复制即可使用，助你生成惊艳的 AI 图像作品。</p>
          <div class="hero-actions">
            <button class="btn btn-yellow" onclick="navigate('explore')">🚀 探索所有提示词</button>
            <button class="btn btn-outline" onclick="document.getElementById('categories-section').scrollIntoView({behavior:'smooth'})">浏览分类</button>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><div class="hero-stat-num">${PROMPTS.length}+</div><div class="hero-stat-label">精选提示词</div></div>
            <div class="hero-stat"><div class="hero-stat-num">${CATEGORIES.length}</div><div class="hero-stat-label">主题分类</div></div>
            <div class="hero-stat"><div class="hero-stat-num">${PROMPTS.filter(p => p.verified).length}</div><div class="hero-stat-label">已验证</div></div>
            <div class="hero-stat"><div class="hero-stat-num">每日</div><div class="hero-stat-label">持续更新</div></div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="container">
          <h2 class="section-title">🔥 今日精选提示词</h2>
          <p class="section-subtitle">经过精心策展的高质量提示词，每个都经过测试与验证，确保生成效果出色。</p>
          <div class="top-prompts" id="top-prompts"></div>
          <div style="text-align:center;margin-top:32px;">
            <button class="btn btn-outline" onclick="navigate('explore')">查看全部提示词 →</button>
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

    const topContainer = $('#top-prompts');
    todayTop.forEach(p => {
      const item = el('div', { class: 'top-prompt-item', onclick: () => openPromptModal(p.id) });
      item.innerHTML = `<img class="top-prompt-thumb" src="${p.image}" alt="${p.title}" loading="lazy" /><div class="top-prompt-info"><div class="top-prompt-title">${p.title}</div><div class="top-prompt-meta"><span>${p.category}</span>${p.verified ? '<span class="verified-badge">已验证</span>' : ''}<span>❤ ${p.likes}</span></div></div>`;
      topContainer.appendChild(item);
    });

    const catGrid = $('#categories-grid');
    CATEGORIES.forEach(cat => {
      const card = el('div', { class: 'category-card', onclick: () => { navigate('explore'); setTimeout(() => filterByCategory(cat.name), 100); } });
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

  // --- Render: Explore ---
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
        <div class="container">
          <div class="explore-toolbar">
            <div class="explore-search">
              <input type="text" id="explore-search-input" placeholder="搜索提示词标题、标签或内容..." value="${currentSearch}" />
            </div>
          </div>
          <div class="filter-chips" id="filter-chips"></div>
          <div style="margin:24px 0;font-size:14px;color:var(--text-muted);" id="result-count"></div>
          <div class="prompts-grid" id="prompts-grid"></div>
          <div class="pagination" id="pagination"></div>
          <div class="no-results" id="no-results" style="display:none;">
            <div class="no-results-icon">🔍</div>
            <p>没有找到匹配的提示词，试试其他关键词或分类吧</p>
          </div>
        </div>
      </section>
    `;

    const chipsContainer = $('#filter-chips');
    const allChip = el('button', { class: 'filter-chip' + (currentCategory === 'All' ? ' active' : '') }, '全部');
    allChip.addEventListener('click', () => { currentCategory = 'All'; currentPage = 1; updateChips(); renderPromptsGrid(); });
    chipsContainer.appendChild(allChip);

    CATEGORIES.forEach(cat => {
      const chip = el('button', { class: 'filter-chip' + (currentCategory === cat.name ? ' active' : '') }, `${cat.icon} ${cat.name}`);
      chip.addEventListener('click', () => { currentCategory = cat.name; currentPage = 1; updateChips(); renderPromptsGrid(); });
      chipsContainer.appendChild(chip);
    });

    $('#explore-search-input').addEventListener('input', (e) => {
      currentSearch = e.target.value;
      currentPage = 1;
      renderPromptsGrid();
    });

    renderPromptsGrid();
  }

  function updateChips() {
    const chips = $$('#filter-chips .filter-chip');
    if (chips[0]) chips[0].classList.toggle('active', currentCategory === 'All');
    CATEGORIES.forEach((cat, i) => {
      if (chips[i + 1]) chips[i + 1].classList.toggle('active', currentCategory === cat.name);
    });
  }

  function renderPromptsGrid() {
    // 合并内置提示词 + 用户收藏，收藏排前面
    const collections = getCollections().map(c => ({ ...c, isCollection: true, verified: false, likes: 0 }));
    let allPrompts = [...collections, ...PROMPTS];

    let filtered = allPrompts;
    if (currentCategory !== 'All') filtered = filtered.filter(p => p.category === currentCategory);
    if (currentSearch.trim()) {
      const q = currentSearch.toLowerCase().trim();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
        p.prompt.toLowerCase().includes(q)
      );
    }

    const grid = $('#prompts-grid');
    const noResults = $('#no-results');
    const countEl = $('#result-count');
    const paginationEl = $('#pagination');

    // 分页计算
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (currentPage > totalPages && totalPages > 0) currentPage = 1;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (countEl) {
      let countText = `找到 ${filtered.length} 个提示词`;
      if (currentCategory !== 'All') countText += ` · 分类: ${currentCategory}`;
      if (currentSearch) countText += ` · 搜索: "${currentSearch}"`;
      if (totalPages > 1) countText += ` · 第 ${currentPage}/${totalPages} 页（每页 ${PAGE_SIZE} 个）`;
      countEl.textContent = countText;
    }

    if (filtered.length === 0) {
      if (grid) grid.innerHTML = '';
      if (noResults) noResults.style.display = 'block';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }
    if (noResults) noResults.style.display = 'none';
    if (grid) {
      grid.innerHTML = '';
      pageItems.forEach(p => grid.appendChild(createPromptCard(p, { isCollection: p.isCollection })));
    }

    // 渲染分页导航
    renderPagination(totalPages, currentPage);
  }

  function renderPagination(totalPages, page) {
    const container = $('#pagination');
    if (!container || totalPages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }

    let html = '';
    // 上一页
    html += `<button class="page-btn${page === 1 ? ' disabled' : ''}" ${page === 1 ? 'disabled' : ''} data-page="${page - 1}">‹ 上一页</button>`;

    // 页码：显示当前页前后各 2 页，首尾必显示
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    if (startPage > 1) {
      html += `<button class="page-btn" data-page="1">1</button>`;
      if (startPage > 2) html += '<span class="page-dots">…</span>';
    }
    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="page-btn${i === page ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<span class="page-dots">…</span>';
      html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    // 下一页
    html += `<button class="page-btn${page === totalPages ? ' disabled' : ''}" ${page === totalPages ? 'disabled' : ''} data-page="${page + 1}">下一页 ›</button>`;

    container.innerHTML = html;
    // 绑定点击事件
    container.querySelectorAll('.page-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page, 10);
        renderPromptsGrid();
        document.querySelector('.explore-header')?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function filterByCategory(catName) {
    currentCategory = catName;
    currentPage = 1;
    if (currentRoute === 'explore') {
      updateChips();
      renderPromptsGrid();
    }
  }

  // --- Render: Import ---
  let importMode = 'paste';
  let currentParsed = null;

  function renderImport() {
    const app = $('#app');
    const collections = getCollections();
    const tabs = [
      { key: 'paste',     icon: '📋', label: '粘贴识别', desc: '从社交媒体复制内容自动解析' },
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
            <a class="imp-head-stat" onclick="navigate('collections')">
              <span class="imp-head-stat-num">${collections.length}</span>
              <span class="imp-head-stat-label">已收藏</span>
            </a>
          </div>

          <!-- Segmented Tab Control -->
          <div class="imp-seg">
            ${tabs.map(t => `
              <button class="imp-seg-btn ${importMode === t.key ? 'on' : ''}" onclick="setImportMode('${t.key}')">
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
                <p>从 Twitter / Reddit / Discord / 小红书 等复制帖子全文，智能算法自动提取提示词、图片和标题</p>
              </div>
              <div class="imp-paste-box">
                <textarea id="import-raw" class="imp-paste-area" placeholder="在此粘贴从社交媒体复制的帖子内容…&#10;&#10;系统会自动识别：&#10;• 英文提示词文本&#10;• 图片 URL&#10;• 中文标题&#10;• 推荐分类与标签"></textarea>
              </div>
              <div class="imp-paste-bar">
                <div class="imp-chips">
                  <span class="imp-chip">Midjourney</span>
                  <span class="imp-chip">Stable Diffusion</span>
                  <span class="imp-chip">DALL·E</span>
                  <span class="imp-chip">图片链接</span>
                </div>
                <div class="imp-paste-btns">
                  <button class="imp-btn-ghost" onclick="clearImport()">清空</button>
                  <button class="imp-btn-primary" onclick="parseAndPreview()">🔍 智能解析</button>
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
    const item = {
      id: 'preview_manual',
      title: title || '(未命名)',
      prompt: prompt || '(请输入提示词)',
      category: $('#manual-category')?.value || autoCategorize(prompt),
      tags: ($('#manual-tags')?.value || '').trim()
        ? ($('#manual-tags')?.value).split(/[,，]/).map(t => t.trim()).filter(Boolean)
        : autoDetectTags(prompt),
      image: ($('#manual-image')?.value || '').trim(),
      date: new Date().toISOString().slice(0, 10),
      source: '手动录入'
    };
    renderImportPreview(item, true);
  };

  function renderImportPreview(item, isManual) {
    const box = $('#imp-result');
    if (!box) return;
    box.style.display = 'block';

    const imgSrc = item.image || ('https://picsum.photos/seed/' + (item.id || 'preview') + '/480/300');
    const source = isManual ? 'manual' : 'parsed';

    box.innerHTML = `
      <div class="imp-result-card">
        <div class="imp-result-head">
          <div class="imp-result-badge">${isManual ? '实时预览' : '解析结果'}</div>
          <h2>${isManual ? '编辑提示词信息' : '已自动提取，可直接收藏'}</h2>
          <p>所有字段均可编辑，点击图片右上角的心形按钮即可收藏</p>
        </div>

        <div class="imp-result-body">
          <div class="imp-result-img">
            <img src="${imgSrc}" alt="${item.title}" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\'imp-result-noimg\'>🖼️<br><span>未检测到图片</span></div>'" />
            <button class="imp-save-fab" onclick="saveFromPreview('${source}')" title="收藏到库">
              <span>♡</span>
            </button>
          </div>

          <div class="imp-result-fields">
            <div class="imp-field">
              <label>标题</label>
              <input type="text" id="edit-title" value="${item.title}" placeholder="提示词标题" />
            </div>
            <div class="imp-field-grid2">
              <div class="imp-field">
                <label>分类</label>
                <select id="edit-category">
                  ${CATEGORIES.map(c => `<option value="${c.name}" ${c.name === item.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
                </select>
              </div>
              <div class="imp-field">
                <label>标签</label>
                <input type="text" id="edit-tags" value="${(item.tags || []).join(', ')}" placeholder="逗号分隔" />
              </div>
            </div>
            <div class="imp-field">
              <div class="imp-field-label-row">
                <label>提示词文本</label>
                <button class="imp-mini-btn" onclick="copyPreviewPrompt()">📋 复制</button>
              </div>
              <textarea id="edit-prompt" rows="5">${item.prompt}</textarea>
            </div>
            <div class="imp-field">
              <label>图片链接</label>
              <input type="text" id="edit-image" value="${item.image || ''}" placeholder="https://…" oninput="updatePreviewImage(this.value)" />
            </div>
          </div>
        </div>

        <div class="imp-result-foot imp-result-foot-subtle">
          <button class="imp-mini-btn" onclick="cancelResult()">取消</button>
          <span class="imp-save-hint">快捷键 Ctrl + Enter 也可收藏</span>
        </div>
      </div>
    `;

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
    }, 0);
  }

  window.updatePreviewImage = function (url) {
    const img = $('.imp-result-img img');
    if (img && url) { img.src = url; img.style.display = 'block'; }
  };

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

    const item = {
      id: generateId(),
      title,
      prompt,
      category: $('#edit-category')?.value || autoCategorize(prompt),
      tags: ($('#edit-tags')?.value || '').trim()
        ? ($('#edit-tags').value).split(/[,，]/).map(t => t.trim()).filter(Boolean)
        : autoDetectTags(prompt),
      image: ($('#edit-image')?.value || '').trim(),
      date: new Date().toISOString().slice(0, 10),
      source: source === 'manual' ? '手动录入' : '粘贴导入'
    };

    if (saveCollection(item)) {
      showToast('已收藏到「我的收藏」');
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
            <button class="imp-btn-ghost" onclick="setImportMode('manual')">→ 切换到手动创建</button>
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
    saveFromPreview('manual');
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
            ${collections.length > 0 ? `<button class="btn btn-outline" style="font-size:13px;padding:8px 16px;" onclick="exportCollections()">📤 导出 JSON</button>` : ''}
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
          <button class="btn btn-yellow" style="margin-top:20px;" onclick="navigate('import')">📥 去导入</button>
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
        const items = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          let saved = 0;
          items.forEach(item => {
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
            if (saveCollection(item)) saved++;
          });
          showToast(`浏览器插件导入了 ${saved} 个提示词`);
          localStorage.removeItem(EXT_IMPORT_KEY);
          // 导入成功后自动跳转到收藏页面
          if (saved > 0) {
            navigate('collections');
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  // --- Router ---
  function navigate(route) {
    currentRoute = route;
    window.scrollTo(0, 0);

    if (route === 'home') renderHome();
    else if (route === 'explore') { currentCategory = 'All'; currentSearch = ''; currentPage = 1; renderExplore(); }
    else if (route === 'import') renderImport();
    else if (route === 'collections') renderCollections();

    $$('.nav a').forEach(a => { a.style.color = ''; });
    const activeNav = $(`.nav a[data-route="${route}"]`);
    if (activeNav) activeNav.style.color = 'var(--text)';
  }

  window.navigate = navigate;
  window.openPromptModal = openPromptModal;

  // --- Init ---
  function init() {
    const navSearchInput = $('#nav-search-input');
    if (navSearchInput) {
      navSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { currentSearch = e.target.value; navigate('explore'); }
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
      if (hash && ['home', 'explore', 'import', 'collections'].includes(hash)) {
        navigate(hash);
        return true;
      }
      return false;
    }
    window.addEventListener('hashchange', handleHashRoute);

    // 页面加载时检查 hash 路由，没有 hash 则渲染首页
    if (!handleHashRoute()) {
      renderHome();
    }

    // Check for extension imports on load
    checkExtensionImport();
    // Also check periodically
    setInterval(checkExtensionImport, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
