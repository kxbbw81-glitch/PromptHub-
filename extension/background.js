// ==========================================
// PromptHub Extension v2 - Background Service Worker
// 右键菜单收藏 + chrome.storage.local 队列管理
// ==========================================

const WEBSITE_URL = 'https://kxbbw81-glitch.github.io/PromptHub-/';
const WEBSITE_TAB_PATTERN = '*://kxbbw81-glitch.github.io/*';
const QUEUE_KEY = 'prompthub_queue';

// --- 分类关键词 ---
const CAT_KEYWORDS = {
  Portrait: ['portrait', 'face', 'model', 'person', 'woman', 'man', 'selfie', 'headshot', 'girl', 'boy'],
  Landscape: ['landscape', 'mountain', 'sunrise', 'sunset', 'valley', 'horizon', 'forest', 'lake', 'ocean'],
  Architecture: ['architecture', 'building', 'interior', 'facade', 'house', 'skyscraper', 'bridge'],
  'Sci-Fi': ['sci-fi', 'space', 'futuristic', 'robot', 'alien', 'spaceship', 'mars', 'galaxy'],
  Cyberpunk: ['cyberpunk', 'neon', 'cyber', 'hologram', 'dystopian', 'night city'],
  Fantasy: ['fantasy', 'dragon', 'wizard', 'magic', 'elf', 'dungeon', 'castle', 'knight'],
  Animals: ['animal', 'dog', 'cat', 'lion', 'wolf', 'bird', 'wildlife', 'fox', 'tiger', 'eagle'],
  'Still Life': ['still life', 'vase', 'fruit', 'flowers arrangement', 'tabletop'],
  Food: ['food', 'dish', 'cuisine', 'restaurant', 'sushi', 'pizza', 'coffee', 'dessert', 'cake'],
  Fashion: ['fashion', 'outfit', 'runway', 'couture', 'dress', 'streetwear', 'model'],
  Character: ['character', 'concept art', 'hero', 'villain', 'npc', 'warrior', 'samurai'],
  Abstract: ['abstract', 'swirl', 'geometric', 'pattern', 'texture', 'fractal'],
  Nature: ['forest', 'flower', 'tree', 'ocean', 'river', 'leaf', 'butterfly', 'garden', 'waterfall'],
  Cityscape: ['city', 'urban', 'skyline', 'street', 'cityscape', 'downtown', 'avenue']
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  let category = 'Abstract';
  let maxScore = 0;
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    const score = kws.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
    if (score > maxScore) { maxScore = score; category = cat; }
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
    'cyberpunk', 'steampunk', 'low poly', 'pixel art', 'watercolor'
  ];
  const tags = tagMap.filter(t => lower.includes(t));
  return tags.length > 0 ? tags.slice(0, 5) : ['AI生成'];
}

// 头像/图标 URL 黑名单（与 content.js 保持一致）
const AVATAR_PATTERNS = [
  'profile_images', 'default_profile', 'avatar', 'profile_pic', 'profilepic',
  'icon', 'emoji', 'badge', 'logo', 'favicon', 'sprite', 'placeholder',
];

function isAvatarUrl(url) {
  if (!url) return true;
  const src = url.toLowerCase();
  return AVATAR_PATTERNS.some(p => src.includes(p));
}

function buildPromptFromText(text, tab, imageUrl) {
  const trimmed = text.trim();
  const firstLine = trimmed.split('\n')[0].trim();
  let title = firstLine.length < 60 ? firstLine : firstLine.slice(0, 50);
  if (!title) title = trimmed.split(/[.!?。！？]/)[0].trim().slice(0, 50) || '未命名提示词';

  // 只在非头像图片时才设置 image
  const image = imageUrl && !isAvatarUrl(imageUrl) ? imageUrl : '';

  return {
    id: 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    title,
    prompt: trimmed,
    category: detectCategory(trimmed),
    tags: extractTags(trimmed),
    image,
    url: tab?.url || '',
    domain: tab?.url ? new URL(tab.url).hostname : '',
    source: '插件右键收藏',
    date: new Date().toISOString().slice(0, 10),
    timestamp: Date.now()
  };
}

// --- 安装时创建右键菜单 ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'collect-selection',
    title: '🍌 收藏到 PromptHub',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'collect-image',
    title: '🍌 收藏此图片的提示词',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: 'open-prompthub',
    title: '🌐 打开 PromptHub',
    contexts: ['page']
  });
});

// --- 右键菜单点击 ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'collect-selection' && info.selectionText) {
    // 右键选中文字时，info.srcUrl 可能为空；尝试在页面中查找内容图片
    let imageUrl = info.srcUrl || '';
    // 如果没有直接图片 URL，尝试通过 content script 查找
    if (!imageUrl) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const sel = window.getSelection();
            if (!sel.rangeCount) return '';
            let node = sel.anchorNode;
            for (let i = 0; i < 4 && node; i++) {
              const el = node.nodeType === 1 ? node : node.parentElement;
              if (!el) break;
              const article = el.closest('article') || el.closest('[data-testid="tweet"]') ||
                              el.closest('[data-testid="post-content"]') || el;
              const imgs = article.querySelectorAll('[data-testid="tweetPhoto"] img, img[src*="media"], .media-element img, [class*="post-image"] img, img');
              for (const img of imgs) {
                const src = img.src || '';
                if (src && !src.includes('profile_images') && !src.includes('avatar') &&
                    !src.includes('icon') && !src.includes('emoji')) {
                  const rect = img.getBoundingClientRect();
                  if (rect.width >= 80) return src;
                }
              }
              node = el.parentElement;
            }
            return '';
          }
        });
        imageUrl = results[0]?.result || '';
      } catch (e) { /* ignore */ }
    }
    const item = buildPromptFromText(info.selectionText, tab, imageUrl);
    await addToQueue(item);
    chrome.action.setBadgeText({ text: '1', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#FFD93D', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
  }

  if (info.menuItemId === 'collect-image' && info.srcUrl) {
    // 右键图片时，收集图片 URL + 页面选中的文字（如果有）
    let promptText = info.selectionText || '';
    if (!promptText) {
      // 尝试获取图片附近的文字
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (imgSrc) => {
            const imgs = document.querySelectorAll('img');
            for (const img of imgs) {
              if (img.src === imgSrc) {
                let node = img;
                for (let i = 0; i < 4 && node; i++) {
                  const el = node.nodeType === 1 ? node : node.parentElement;
                  if (!el) break;
                  const texts = el.querySelectorAll('[data-testid="tweetText"], p, blockquote, .caption, [class*="description"]');
                  for (const t of texts) {
                    const txt = t.textContent.trim();
                    if (txt.length > 50) return txt;
                  }
                  node = el.parentElement;
                }
              }
            }
            return '';
          },
          args: [info.srcUrl]
        });
        promptText = results[0]?.result || '';
      } catch (e) { /* ignore */ }
    }
    if (promptText) {
      const item = buildPromptFromText(promptText, tab, info.srcUrl);
      await addToQueue(item);
      chrome.action.setBadgeText({ text: '1', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#FFD93D', tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
    } else {
      // 没有找到提示词文字，只收集图片
      const item = buildPromptFromText('（请手动补充提示词）', tab, info.srcUrl);
      await addToQueue(item);
      chrome.action.setBadgeText({ text: '1', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#FFD93D', tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
    }
  }

  if (info.menuItemId === 'open-prompthub') {
    chrome.tabs.create({ url: WEBSITE_URL });
  }
});

// --- 队列操作 ---
async function addToQueue(item) {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  const queue = data[QUEUE_KEY] || [];
  if (!queue.some(q => q.prompt === item.prompt)) {
    queue.push(item);
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  }
  return queue.length;
}

async function getQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return data[QUEUE_KEY] || [];
}

async function clearQueue() {
  await chrome.storage.local.remove(QUEUE_KEY);
}

// --- 消息处理 ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getQueue') {
    getQueue().then(queue => sendResponse({ queue }));
    return true;
  }

  if (request.action === 'addToQueue') {
    addToQueue(request.data).then(count => sendResponse({ success: true, count }));
    return true;
  }

  if (request.action === 'clearQueue') {
    clearQueue().then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'removeFromQueue') {
    getQueue().then(async (queue) => {
      const filtered = queue.filter(q => q.prompt !== request.prompt);
      await chrome.storage.local.set({ [QUEUE_KEY]: filtered });
      sendResponse({ success: true, count: filtered.length });
    });
    return true;
  }

  if (request.action === 'syncToWebsite') {
    syncToWebsite().then(result => sendResponse(result));
    return true;
  }
});

// --- 同步到网站 ---
async function syncToWebsite() {
  const queue = await getQueue();
  if (queue.length === 0) {
    return { success: false, error: '队列为空' };
  }

  // 查找或打开 PromptHub 标签页
  const tabs = await chrome.tabs.query({ url: WEBSITE_TAB_PATTERN });
  let tab;
  if (tabs.length > 0) {
    tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    tab = await chrome.tabs.create({ url: WEBSITE_URL + '#/collections' });
    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // 注入函数将数据写入网站 localStorage
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (data) => {
        try {
          const existing = JSON.parse(localStorage.getItem('prompthub_ext_import') || '[]');
          const merged = [...existing, ...data];
          const seen = new Set();
          const deduped = merged.filter(item => {
            if (seen.has(item.prompt)) return false;
            seen.add(item.prompt);
            return true;
          });
          localStorage.setItem('prompthub_ext_import', JSON.stringify(deduped));
        } catch (e) {
          console.error('PromptHub sync error:', e);
        }
      },
      args: [queue]
    });

    await clearQueue();
    return { success: true, count: queue.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
