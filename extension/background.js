// ==========================================
// PromptHub Extension v2 - Background Service Worker
// 右键菜单收藏 + chrome.storage.local 队列管理
// ==========================================

const GITHUB_PAGES_URL = 'https://kxbbw81-glitch.github.io/PromptHub-/';
const GITHUB_PAGES_TAB_PATTERN = '*://kxbbw81-glitch.github.io/PromptHub-/*';
const WEBSITE_URL = GITHUB_PAGES_URL;
const QUEUE_KEY = 'prompthub_queue';
const CF_SYNC_DELAY_MINUTES = 30;
const GITHUB_TOKEN_KEY = 'prompthub_github_token';
const GITHUB_COLLECTIONS_API = 'https://api.github.com/repos/kxbbw81-glitch/PromptHub-/contents/data/collections.json';
const DOMESTIC_PENDING_KEY = 'prompthub_domestic_pending_ids';
const DOMESTIC_ALARM_NAME = 'prompthub_domestic_release';

try {
  importScripts('prompt-parser.js');
} catch (e) {
  console.warn('[PromptHub] Shared parser unavailable:', e.message);
}

// --- 分类关键词（中文分类，按提示词词根匹配）---
const CAT_KEYWORDS = {
  '人像': ['portrait', 'face', 'model', 'person', 'woman', 'man', 'selfie', 'headshot', 'girl', 'boy',
           '人像', '人物', '肖像', '人脸', '女性', '男性', '女孩', '男孩'],
  '风景': ['landscape', 'mountain', 'sunrise', 'sunset', 'valley', 'horizon', 'forest', 'lake', 'ocean',
           '风景', '风光', '山', '日出', '日落', '山谷', '湖泊', '海洋'],
  '建筑': ['architecture', 'building', 'interior', 'facade', 'house', 'skyscraper', 'bridge',
           '建筑', '室内', '摩天大楼', '房屋', '桥梁', '空间'],
  '科幻': ['sci-fi', 'space', 'futuristic', 'robot', 'alien', 'spaceship', 'mars', 'galaxy',
           '科幻', '太空', '未来', '机器人', '外星人', '飞船', '火星'],
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
  '时尚': ['fashion', 'outfit', 'runway', 'couture', 'dress', 'streetwear', 'model',
           '时尚', '服装', '穿搭', '走秀', '礼服', '街拍'],
  '角色': ['character', 'concept art', 'hero', 'villain', 'npc', 'warrior', 'samurai',
           '角色', '概念艺术', '英雄', '反派', '战士', '武士'],
  '抽象': ['abstract', 'swirl', 'geometric', 'pattern', 'texture', 'fractal',
           '抽象', '几何', '图案', '纹理', '分形'],
  '自然': ['forest', 'flower', 'tree', 'ocean', 'river', 'leaf', 'butterfly', 'garden', 'waterfall',
           '自然', '森林', '花', '树', '河流', '叶子', '蝴蝶', '花园', '瀑布'],
  '城市': ['city', 'urban', 'skyline', 'street', 'cityscape', 'downtown', 'avenue',
           '城市', '都市', '天际线', '街道', '市中心', '城景']
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  let category = '抽象';
  let maxScore = 0;
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    const score = kws.reduce((s, kw) => s + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
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

function getHostname(url) {
  try {
    return url ? new URL(url).hostname : '';
  } catch {
    return '';
  }
}

function buildPromptFromText(text, tab, imageUrl, allImages) {
  const trimmed = text.trim();
  const parsed = globalThis.PromptHubParser?.parsePromptText(trimmed, {
    titleCandidates: [tab?.title],
    pageTitle: getHostname(tab?.url)
  });
  const promptText = parsed?.prompt || trimmed;
  const firstLine = promptText.split('\n')[0].trim();
  let title = parsed?.title || (firstLine.length < 60 ? firstLine : firstLine.slice(0, 50));
  if (!title) title = promptText.split(/[.!?。！？]/)[0].trim().slice(0, 50) || '未命名提示词';

  // 多图支持：过滤头像 URL
  const parserImages = parsed?.imageUrls || [];
  const images = [...(allImages || [imageUrl]), ...parserImages].filter(u => u && !isAvatarUrl(u));
  const dedupedImages = [...new Set(images)];
  const image = dedupedImages[0] || '';

  return {
    id: 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    title,
    prompt: promptText,
    category: detectCategory(promptText),
    tags: extractTags(promptText),
    image,
    images: dedupedImages,
    url: tab?.url || '',
    domain: getHostname(tab?.url),
    source: '插件右键收藏',
    date: new Date().toISOString().slice(0, 10),
    timestamp: Date.now()
  };
}

// --- 安装时创建右键菜单 ---
chrome.runtime.onInstalled.addListener((details) => {
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

  if (details.reason === 'update') {
    recoverCloudflareFromGitHub().catch(e => {
      console.warn('[PromptHub] Cloudflare recovery check failed:', e.message);
    });
  }
});

// --- 右键菜单点击 ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'collect-selection' && info.selectionText) {
    // 右键选中文字时，收集页面中所有内容图片
    let allImages = [];
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const sel = window.getSelection();
          if (!sel.rangeCount) return [];
          const found = [];
          const seen = new Set();
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
                  !src.includes('icon') && !src.includes('emoji') && !seen.has(src)) {
                const rect = img.getBoundingClientRect();
                if (rect.width >= 80) {
                  found.push(src);
                  seen.add(src);
                }
              }
            }
            node = el.parentElement;
          }
          return found;
        }
      });
      allImages = results[0]?.result || [];
    } catch (e) { /* ignore */ }
    if (info.srcUrl && !allImages.includes(info.srcUrl)) {
      allImages.unshift(info.srcUrl);
    }
    const item = buildPromptFromText(info.selectionText, tab, info.srcUrl, allImages);
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
      const item = buildPromptFromText(promptText, tab, info.srcUrl, [info.srcUrl]);
      await addToQueue(item);
      chrome.action.setBadgeText({ text: '1', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#FFD93D', tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
    } else {
      // 没有找到提示词文字，只收集图片
      const item = buildPromptFromText('（请手动补充提示词）', tab, info.srcUrl, [info.srcUrl]);
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
  const result = await syncQueueToGitHub([item]);
  if (!result.success) throw new Error(result.error || 'GitHub sync failed');
  return result.count;
}

async function getQueue() {
  return [];
}

async function clearQueue() {
  await chrome.storage.local.remove(QUEUE_KEY);
}

async function recoverCloudflareFromGitHub() {
  const tabs = await chrome.tabs.query({ url: GITHUB_PAGES_TAB_PATTERN });
  let tab = tabs[0];
  if (!tab) {
    tab = await chrome.tabs.create({ url: GITHUB_PAGES_URL + '#/collections', active: false });
    await new Promise((resolve) => {
      let done = false;
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete' && !done) {
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        if (!done) {
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }, 15000);
    });
  }

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        const items = JSON.parse(localStorage.getItem('prompthub_collections') || '[]');
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    }
  });
  const collections = result[0]?.result || [];
  if (collections.length > 0) await scheduleCloudflareSync(collections);
}

// --- 消息处理 ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getQueue') {
    getQueue().then(queue => sendResponse({ queue }));
    return true;
  }

  if (request.action === 'addToQueue') {
    syncQueueToGitHub([request.data]).then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'collectionMutation') {
    mutateGitHubCollections(request.operation, request.item)
      .then(sendResponse)
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'getGitHubTokenStatus') {
    chrome.storage.local.get(GITHUB_TOKEN_KEY).then(data => sendResponse({ configured: Boolean(data[GITHUB_TOKEN_KEY]) }));
    return true;
  }

  if (request.action === 'saveGitHubToken') {
    const token = String(request.token || '').trim();
    if (token.length < 20) {
      sendResponse({ success: false, error: 'GitHub Token 格式不正确' });
      return;
    }
    chrome.storage.local.set({ [GITHUB_TOKEN_KEY]: token }).then(async () => {
      try {
        const migrated = await migrateLegacyCollections();
        sendResponse({ success: true, migratedCount: migrated.count || 0 });
      } catch (error) {
        sendResponse({ success: true, migratedCount: 0, migrationError: error.message });
      }
    });
    return true;
  }

  if (request.action === 'clearGitHubToken') {
    chrome.storage.local.remove(GITHUB_TOKEN_KEY).then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'migrateLegacyCollections') {
    migrateLegacyCollections().then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
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

  // 延迟同步到国内站点（popup 触发，background 空闲时执行）
  if (request.action === 'delayedSyncCloudflare' && request.queue) {
    scheduleCloudflareSync(request.queue).then(() => {
      sendResponse({ success: true });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }
});

function createSyncBatchId() {
  return `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function writeImportBatch(tabId, queue, batchId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (data, importKey, nextBatchId) => {
      try {
        const raw = JSON.parse(localStorage.getItem(importKey) || '[]');
        const existing = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
        const seen = new Set();
        const items = [...existing, ...data].filter(item => {
          const key = item?.id || item?.prompt;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        localStorage.setItem(importKey, JSON.stringify({ batchId: nextBatchId, items }));
        window.dispatchEvent(new StorageEvent('storage', {
          key: importKey,
          newValue: JSON.stringify({ batchId: nextBatchId, items }),
          oldValue: null,
          storageArea: localStorage
        }));
        return { success: true, count: items.length };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    args: [queue, EXT_IMPORT_KEY, batchId]
  });

  const payload = result[0]?.result;
  if (!payload?.success) throw new Error(payload?.error || 'PromptHub import handoff failed');
  return payload;
}

async function waitForSaveReceipt(tabId, batchId) {
  const deadline = Date.now() + SYNC_RECEIPT_WAIT_MS;
  while (Date.now() < deadline) {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (receiptKey) => {
        try {
          return JSON.parse(localStorage.getItem(receiptKey) || 'null');
        } catch {
          return null;
        }
      },
      args: [EXT_SYNC_RECEIPT_KEY]
    });
    const receipt = result[0]?.result;
    if (receipt?.batchId === batchId) return receipt;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('PromptHub save receipt was not received');
}

async function deliverBatchToPromptHub(tabId, queue) {
  const batchId = createSyncBatchId();
  await writeImportBatch(tabId, queue, batchId);
  return waitForSaveReceipt(tabId, batchId);
}

// --- 同步到单个站点 ---
async function syncToSite(url, tabPattern, queue) {
  const tabs = await chrome.tabs.query({ url: tabPattern });
  let tab;
  if (tabs.length > 0) {
    tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await new Promise(r => setTimeout(r, 300));
  } else {
    tab = await chrome.tabs.create({ url: url + '#/collections' });
    // 等待页面真正加载完成（最多 15 秒）
    await new Promise((resolve) => {
      let done = false;
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete' && !done) {
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        if (!done) {
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }, 15000);
    });
  }

  const receipt = await deliverBatchToPromptHub(tab.id, queue);
  return { success: true, tab, receipt };
}

// --- 同步到网站：只同步 GitHub Pages，成功后安排后台延迟同步国内站点 ---
async function syncToWebsite() {
  const queue = await getQueue();
  if (queue.length === 0) {
    return { success: false, error: '队列为空' };
  }

  // 只同步到 GitHub Pages
  let githubOk = false;
  try {
    await syncToSite(GITHUB_PAGES_URL, GITHUB_PAGES_TAB_PATTERN, queue);
    githubOk = true;
  } catch (e) {
    console.warn('GitHub Pages sync failed:', e.message);
  }

  if (githubOk) {
    await clearQueue();
    // 安排后台延迟同步到国内站点
    try {
      await scheduleCloudflareSync(queue);
    } catch (e) {
      console.warn('Failed to schedule Cloudflare sync:', e.message);
    }
    return { success: true, count: queue.length, sites: ['GitHub Pages'] };
  }

  return { success: false, error: 'GitHub Pages 同步失败' };
}

// --- 后台延迟同步到 Cloudflare Workers ---
const CF_PENDING_KEY = 'prompthub_cf_pending';
const CF_ALARM_NAME = 'delayed_cf_sync';

// 安排延迟同步：存数据 + 创建 alarm
async function scheduleCloudflareSync(queue) {
  // 合并已 pending 的数据
  const data = await chrome.storage.local.get(CF_PENDING_KEY);
  const existing = data[CF_PENDING_KEY] || [];
  const merged = [...existing, ...queue];
  const seen = new Set();
  const deduped = merged.filter(item => {
    if (seen.has(item.prompt)) return false;
    seen.add(item.prompt);
    return true;
  });
  await chrome.storage.local.set({ [CF_PENDING_KEY]: deduped });
  // 30 分钟后执行，确保先完成 GitHub Pages 收藏，再同步国内站点。
  await chrome.alarms.create(CF_ALARM_NAME, { delayInMinutes: CF_SYNC_DELAY_MINUTES });
  console.log(`[PromptHub] 已安排后台同步到国内站点，${CF_SYNC_DELAY_MINUTES} 分钟后执行`);
}

// Alarm 触发：静默同步到 Cloudflare
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== CF_ALARM_NAME) return;

  const data = await chrome.storage.local.get(CF_PENDING_KEY);
  const queue = data[CF_PENDING_KEY] || [];
  if (queue.length === 0) return;

  console.log(`[PromptHub] 开始后台同步 ${queue.length} 个到国内站点…`);
  try {
    await syncToSiteSilent(CLOUDFLARE_URL, CLOUDFLARE_TAB_PATTERN, queue);
    await chrome.storage.local.remove(CF_PENDING_KEY);
    console.log('[PromptHub] 后台同步到国内站点成功');
  } catch (e) {
    console.warn('[PromptHub] 后台同步到国内站点失败:', e.message);
    // 失败重试：5 分钟后再试一次
    chrome.alarms.create(CF_ALARM_NAME, { delayInMinutes: 5 });
  }
});

// 静默同步（后台标签页，不切换焦点）
async function syncToSiteSilent(url, tabPattern, queue) {
  const tabs = await chrome.tabs.query({ url: tabPattern });
  let tab;
  if (tabs.length > 0) {
    // 已有标签页，不激活
    tab = tabs[0];
  } else {
    // 后台打开标签页（不切换焦点）
    tab = await chrome.tabs.create({ url: url + '#/collections', active: false });
    // 等待页面加载完成
    await new Promise((resolve) => {
      let done = false;
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete' && !done) {
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        if (!done) {
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }, 15000);
    });
  }

  return deliverBatchToPromptHub(tab.id, queue);
}

// --- GitHub-backed collection storage ---
function trimText(value, maxLength) {
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

function sanitizeRemoteItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = trimText(item.id, 120);
  const title = trimText(item.title, 180);
  const prompt = trimText(item.prompt, 30000);
  if (!id || !title || !prompt) return null;

  const imageList = Array.isArray(item.images) ? item.images : [item.image];
  const images = [...new Set(imageList
    .map(url => trimText(url, 2048))
    .filter(url => /^https:\/\//i.test(url)))]
    .slice(0, 12);

  return {
    ...item,
    id,
    title,
    prompt,
    category: trimText(item.category, 32),
    tags: Array.isArray(item.tags) ? item.tags.map(tag => trimText(tag, 48)).filter(Boolean).slice(0, 12) : [],
    image: images[0] || '',
    images,
    rawImages: images,
    referenceImages: Array.isArray(item.referenceImages) ? item.referenceImages.map(url => trimText(url, 2048)).filter(url => /^https:\/\//i.test(url)).slice(0, 12) : [],
    aspectRatio: trimText(item.aspectRatio, 32),
    model: trimText(item.model, 100),
    source: trimText(item.source, 100),
    sourceUrl: /^https:\/\//i.test(trimText(item.sourceUrl, 2048)) ? trimText(item.sourceUrl, 2048) : '',
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? item.date : new Date().toISOString().slice(0, 10)
  };
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getGitHubToken() {
  const data = await chrome.storage.local.get(GITHUB_TOKEN_KEY);
  const token = String(data[GITHUB_TOKEN_KEY] || '').trim();
  if (!token) throw new Error('请先在 PromptHub 插件设置中配置 GitHub Token');
  return token;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function readGitHubCollections(token) {
  const response = await fetch(GITHUB_COLLECTIONS_API, { headers: githubHeaders(token) });
  if (response.status === 404) return { sha: '', collections: [] };
  if (!response.ok) throw new Error(`GitHub 读取失败 (${response.status})`);

  const payload = await response.json();
  try {
    const content = JSON.parse(decodeBase64Utf8(payload.content));
    const collections = Array.isArray(content) ? content : content.collections;
    return { sha: payload.sha || '', collections: Array.isArray(collections) ? collections : [] };
  } catch {
    throw new Error('GitHub 收藏数据格式错误');
  }
}

async function writeGitHubCollections(token, collections, sha) {
  const body = {
    message: 'data: sync PromptHub collections',
    content: encodeBase64Utf8(JSON.stringify({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      collections
    }, null, 2) + '\n')
  };
  if (sha) body.sha = sha;

  const response = await fetch(GITHUB_COLLECTIONS_API, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (response.status === 409 || response.status === 422) {
    const error = new Error('GitHub 保存冲突');
    error.retryable = true;
    throw error;
  }
  if (!response.ok) throw new Error(`GitHub 保存失败 (${response.status})`);
}

async function scheduleDomesticRelease(ids) {
  const validIds = [...new Set(ids.map(id => trimText(id, 120)).filter(Boolean))];
  if (validIds.length === 0) return;

  const data = await chrome.storage.local.get(DOMESTIC_PENDING_KEY);
  const existing = Array.isArray(data[DOMESTIC_PENDING_KEY]) ? data[DOMESTIC_PENDING_KEY] : [];
  const dueAt = Date.now() + CF_SYNC_DELAY_MINUTES * 60 * 1000;
  const byId = new Map(existing.map(entry => [entry.id, entry]));
  validIds.forEach(id => {
    if (!byId.has(id)) byId.set(id, { id, dueAt });
  });
  const pending = [...byId.values()];
  await chrome.storage.local.set({ [DOMESTIC_PENDING_KEY]: pending });
  await chrome.alarms.create(DOMESTIC_ALARM_NAME, { when: Math.min(...pending.map(entry => entry.dueAt)) });
}

async function mutateGitHubCollections(operation, item) {
  const token = await getGitHubToken();
  const safeItem = operation === 'delete' ? { id: trimText(item?.id, 120) } : sanitizeRemoteItem(item);
  if (!safeItem?.id) return { success: false, error: '收藏数据不完整' };

  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await readGitHubCollections(token);
    const collections = snapshot.collections.map(sanitizeRemoteItem).filter(Boolean);
    const index = collections.findIndex(entry => entry.id === safeItem.id);
    const now = new Date().toISOString();
    const releaseIds = [];
    let changed = 0;

    if (operation === 'delete') {
      if (index !== -1) {
        collections.splice(index, 1);
        changed = 1;
      }
    } else if (operation === 'create') {
      const duplicate = collections.find(entry => collectionFingerprint(entry) === collectionFingerprint(safeItem));
      if (index !== -1 || duplicate) {
        return { success: true, count: 0, alreadySaved: true, duplicateId: (collections[index] || duplicate).id };
      }
      collections.unshift({ ...safeItem, githubSyncedAt: now, domesticSyncedAt: null });
      releaseIds.push(safeItem.id);
      changed = 1;
    } else if (operation === 'update') {
      if (index === -1) return { success: false, error: '未找到需要更新的收藏' };
      collections[index] = {
        ...collections[index],
        ...safeItem,
        id: collections[index].id,
        githubSyncedAt: now,
        domesticSyncedAt: collections[index].domesticSyncedAt || null
      };
      changed = 1;
    } else if (operation === 'release') {
      if (index === -1) return { success: true, count: 0 };
      collections[index] = { ...collections[index], domesticSyncedAt: now };
      changed = 1;
    } else {
      return { success: false, error: '未知收藏操作' };
    }

    try {
      await writeGitHubCollections(token, collections, snapshot.sha);
      if (releaseIds.length) await scheduleDomesticRelease(releaseIds);
      return { success: true, count: changed };
    } catch (error) {
      if (!error.retryable || attempt === 2) throw error;
    }
  }

  return { success: false, error: 'GitHub 保存失败' };
}

async function syncQueueToGitHub(queue) {
  const entries = Array.isArray(queue) ? queue : [];
  let count = 0;
  let skipped = 0;
  for (const entry of entries) {
    const result = await mutateGitHubCollections('create', entry);
    if (!result.success) return result;
    count += result.count || 0;
    if (result.alreadySaved) skipped++;
  }
  return { success: true, count, skipped };
}

async function releaseDomesticCollections() {
  const data = await chrome.storage.local.get(DOMESTIC_PENDING_KEY);
  const pending = Array.isArray(data[DOMESTIC_PENDING_KEY]) ? data[DOMESTIC_PENDING_KEY] : [];
  const now = Date.now();
  const due = pending.filter(entry => Number(entry.dueAt) <= now);
  if (due.length === 0) {
    if (pending.length) await chrome.alarms.create(DOMESTIC_ALARM_NAME, { when: Math.min(...pending.map(entry => entry.dueAt)) });
    return;
  }

  const completed = new Set();
  for (const entry of due) {
    try {
      const result = await mutateGitHubCollections('release', { id: entry.id });
      if (result.success) completed.add(entry.id);
    } catch (error) {
      console.warn('[PromptHub] Domestic release retry:', error.message);
    }
  }
  const next = pending
    .filter(entry => !completed.has(entry.id))
    .map(entry => due.some(item => item.id === entry.id) ? { ...entry, dueAt: Date.now() + 5 * 60 * 1000 } : entry);
  await chrome.storage.local.set({ [DOMESTIC_PENDING_KEY]: next });
  if (next.length) await chrome.alarms.create(DOMESTIC_ALARM_NAME, { when: Math.min(...next.map(entry => entry.dueAt)) });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === DOMESTIC_ALARM_NAME) releaseDomesticCollections();
});

chrome.runtime.onStartup.addListener(() => releaseDomesticCollections());

async function waitForTabComplete(tabId) {
  await new Promise(resolve => {
    const timeout = setTimeout(done, 15000);
    function done() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function migrateLegacyCollections() {
  const tabs = await chrome.tabs.query({ url: GITHUB_PAGES_TAB_PATTERN });
  const tab = tabs[0] || await chrome.tabs.create({ url: GITHUB_PAGES_URL, active: false });
  if (!tabs[0]) await waitForTabComplete(tab.id);

  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      try {
        const data = JSON.parse(localStorage.getItem('prompthub_collections') || '[]');
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }
  });
  const collections = result[0]?.result || [];
  if (collections.length === 0) return { success: true, count: 0 };
  return syncQueueToGitHub(collections);
}
