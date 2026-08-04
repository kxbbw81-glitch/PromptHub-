// ==========================================
// PromptHub Extension v2 - Background Service Worker
// 右键菜单收藏 + chrome.storage.local 队列管理
// ==========================================

const GITHUB_PAGES_URL = 'https://kxbbw81-glitch.github.io/PromptHub-/';
const GITHUB_PAGES_TAB_PATTERN = '*://kxbbw81-glitch.github.io/PromptHub-/*';
const WEBSITE_URL = GITHUB_PAGES_URL;
const QUEUE_KEY = 'prompthub_queue';
const GITHUB_TOKEN_KEY = 'prompthub_github_token';
const GITHUB_COLLECTIONS_API = 'https://api.github.com/repos/kxbbw81-glitch/PromptHub-/contents/data/collections.json';
const GITHUB_COLLECTIONS_RAW = 'https://raw.githubusercontent.com/kxbbw81-glitch/PromptHub-/main/data/collections.json';
const GITHUB_BLOB_API_BASE = 'https://api.github.com/repos/kxbbw81-glitch/PromptHub-/git/blobs/';
const GITHUB_LARGE_FILE_BYTES = 1024 * 1024;
const RECEIPT_KEY = 'prompthub_collection_receipts';
const PRIMARY_RETRY_ALARM_NAME = 'prompthub_primary_retry';
const PRIMARY_RETRY_DELAY_MINUTES = 2;
const GITHUB_REQUEST_TIMEOUT_MS = 30000;
let queueMutation = Promise.resolve();
let receiptMutation = Promise.resolve();

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

function extractAspectRatio(text) {
  const match = String(text || '').match(/(?:aspect\s*ratio|--ar|宽高比|画幅|比例)\s*[:：=]?\s*(\d{1,2})\s*[:xX×]\s*(\d{1,2})|\b(\d{1,2})\s*[:xX×]\s*(\d{1,2})\s*(?:vertical|horizontal|portrait|landscape|竖版|横版|比例|画幅)/i);
  const width = Number(match?.[1] || match?.[3]);
  const height = Number(match?.[2] || match?.[4]);
  return width && height ? `${width}:${height}` : '';
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
    aspectRatio: extractAspectRatio(promptText),
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
  queueAutomaticPrimarySync().catch(error => console.warn('[PromptHub] Queue recovery after update failed:', error?.message));
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
    const result = await addToQueue(item);
    updateQueueBadge(tab.id, result.count);
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
      const result = await addToQueue(item);
      updateQueueBadge(tab.id, result.count);
    } else {
      // 没有找到提示词文字，只收集图片
      const item = buildPromptFromText('（请手动补充提示词）', tab, info.srcUrl, [info.srcUrl]);
      const result = await addToQueue(item);
      updateQueueBadge(tab.id, result.count);
    }
  }

  if (info.menuItemId === 'open-prompthub') {
    chrome.tabs.create({ url: WEBSITE_URL });
  }
});

// --- 队列操作 ---
async function addToQueue(item) {
  const result = await addItemsToQueue([item]);
  if (!result.success) return result;
  return {
    ...result,
    alreadyQueued: result.added === 0 && result.alreadyQueued > 0,
    queued: result.added > 0
  };
}

async function addItemsToQueue(items) {
  const rejected = [];
  const candidates = [];
  const outcomes = [];
  const batchFingerprints = new Set();
  const batchSources = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const safeItem = sanitizeRemoteItem(item);
    const fingerprint = collectionFingerprint(safeItem);
    const sourceKey = collectionSourceKey(safeItem);
    if (!safeItem || !isCompleteCollectionItem(safeItem) || !fingerprint || !sourceKey) {
      rejected.push(item);
      outcomes.push({ id: trimText(item?.id, 120), outcome: 'rejected', reason: '提示词不完整、缺少结果图或原帖链接' });
      continue;
    }
    if (batchFingerprints.has(fingerprint) || batchSources.has(sourceKey)) {
      outcomes.push({ id: safeItem.id, outcome: 'batch_duplicate', reason: '与本次识别的另一条提示词重复' });
      continue;
    }
    batchFingerprints.add(fingerprint);
    batchSources.add(sourceKey);
    candidates.push(safeItem);
  }

  if (candidates.length === 0) {
    return { success: false, error: '没有可收藏的完整提示词：请确认包含结果图和原帖链接', rejected: rejected.length };
  }

  const queued = await withQueueLock(async () => {
    const queue = await getQueue();
    const queuedFingerprints = new Set(queue.map(collectionFingerprint).filter(Boolean));
    const queuedSources = new Set(queue.map(collectionSourceKey).filter(Boolean));
    const additions = candidates.filter(item => {
      const fingerprint = collectionFingerprint(item);
      const sourceKey = collectionSourceKey(item);
      if (queuedFingerprints.has(fingerprint) || queuedSources.has(sourceKey)) return false;
      queuedFingerprints.add(fingerprint);
      queuedSources.add(sourceKey);
      return true;
    });

    if (additions.length) await chrome.storage.local.set({ [QUEUE_KEY]: [...queue, ...additions] });
    return {
      success: true,
      count: queue.length + additions.length,
      added: additions.length,
      alreadyQueued: candidates.length - additions.length,
      additions,
      alreadyQueuedItems: candidates.filter(item => !additions.includes(item)),
      trackedItems: candidates
    };
  });

  await setCollectionReceipts(queued.trackedItems, 'queued', {
    message: queued.added
      ? `已加入 ${queued.added} 个提示词，等待 GitHub 主站验证（队列 ${queued.count} 个）`
      : '已在队列，正在重新验证 GitHub 主站'
  });
  queueAutomaticPrimarySync().catch(error => console.warn('[PromptHub] Queue sync failed:', error?.message));
  return {
    ...queued,
    rejected: rejected.length,
    outcomes: [
      ...outcomes,
      ...queued.additions.map(item => ({ id: item.id, outcome: 'queued', reason: '已加入验证队列' })),
      ...queued.alreadyQueuedItems.map(item => ({ id: item.id, outcome: 'already_queued', reason: '已在验证队列中' }))
    ],
    trackedIds: queued.trackedItems.map(item => item.id),
    pendingVerification: true
  };
}

async function getQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  const rawQueue = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
  return rawQueue.map(sanitizeRemoteItem).filter(Boolean);
}

async function clearQueue() {
  return withQueueLock(() => chrome.storage.local.remove(QUEUE_KEY));
}

function withQueueLock(task) {
  const run = queueMutation.then(task, task);
  queueMutation = run.catch(() => undefined);
  return run;
}

function withReceiptLock(task) {
  const run = receiptMutation.then(task, task);
  receiptMutation = run.catch(() => undefined);
  return run;
}

async function setCollectionReceipts(items, state, details = {}) {
  const safeItems = (Array.isArray(items) ? items : []).filter(item => trimText(item?.id, 120));
  if (safeItems.length === 0) return;

  await withReceiptLock(async () => {
    const data = await chrome.storage.local.get(RECEIPT_KEY);
    const current = data[RECEIPT_KEY] && typeof data[RECEIPT_KEY] === 'object' ? data[RECEIPT_KEY] : {};
    const updatedAt = new Date().toISOString();
    for (const item of safeItems) {
      current[item.id] = {
        id: item.id,
        sourceUrl: trimText(item.sourceUrl || item.url, 2048),
        state,
        outcome: trimText(details.outcome, 40),
        message: trimText(details.message, 240),
        error: trimText(details.error, 240),
        verifiedAt: details.verifiedAt || null,
        updatedAt
      };
    }
    const latest = Object.values(current)
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))
      .slice(0, 40);
    await chrome.storage.local.set({ [RECEIPT_KEY]: Object.fromEntries(latest.map(entry => [entry.id, entry])) });
  });
}

async function getCollectionReceipt(id) {
  const data = await chrome.storage.local.get(RECEIPT_KEY);
  const receipts = data[RECEIPT_KEY] && typeof data[RECEIPT_KEY] === 'object' ? data[RECEIPT_KEY] : {};
  return receipts[trimText(id, 120)] || null;
}

async function getCollectionFeedback() {
  const [queue, data] = await Promise.all([getQueue(), chrome.storage.local.get(RECEIPT_KEY)]);
  const receipts = Object.values(data[RECEIPT_KEY] && typeof data[RECEIPT_KEY] === 'object' ? data[RECEIPT_KEY] : {});
  const latest = receipts.sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))[0] || null;
  return { queueCount: queue.length, latest };
}

async function removeQueueItem(prompt) {
  return withQueueLock(async () => {
    const fingerprint = collectionFingerprint({ prompt });
    const queue = await getQueue();
    const filtered = queue.filter(item => collectionFingerprint(item) !== fingerprint);
    await chrome.storage.local.set({ [QUEUE_KEY]: filtered });
    return { success: true, count: filtered.length };
  });
}

function updateQueueBadge(tabId, count) {
  const text = count > 0 ? String(Math.min(count, 99)) : '';
  chrome.action.setBadgeText({ text, tabId });
  if (text) chrome.action.setBadgeBackgroundColor({ color: '#FFD93D', tabId });
}

// --- 消息处理 ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getQueue') {
    getQueue().then(queue => sendResponse({ queue }));
    return true;
  }

  if (request.action === 'addToQueue') {
    addToQueue(request.data).then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'addItemsToQueue') {
    addItemsToQueue(request.data).then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'getCollectionReceipt') {
    getCollectionReceipt(request.id).then(receipt => sendResponse({ receipt }));
    return true;
  }

  if (request.action === 'getCollectionFeedback') {
    getCollectionFeedback().then(sendResponse);
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
    readGitHubCollections(token).then(async () => {
      await chrome.storage.local.set({ [GITHUB_TOKEN_KEY]: token });
      try {
        const migrated = await migrateLegacyCollections();
        sendResponse({ success: true, migratedCount: migrated.count || 0 });
      } catch (error) {
        sendResponse({ success: true, migratedCount: 0, migrationError: error.message });
      }
    }).catch(error => sendResponse({ success: false, error: formatGitHubError(error) }));
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
    removeQueueItem(request.prompt).then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'syncToWebsite') {
    syncToWebsite()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: formatGitHubError(error) }));
    return true;
  }

});

let activeQueueSync = null;
let automaticPrimarySync = Promise.resolve();

function queueAutomaticPrimarySync() {
  automaticPrimarySync = automaticPrimarySync
    .catch(() => undefined)
    .then(() => syncToWebsite());
  return automaticPrimarySync;
}

async function syncToWebsite() {
  if (activeQueueSync) return activeQueueSync;

  activeQueueSync = syncQueuedItems();
  try {
    return await activeQueueSync;
  } finally {
    activeQueueSync = null;
  }
}

async function syncQueuedItems() {
  const queueSnapshot = await getQueue();
  if (queueSnapshot.length === 0) return { success: false, error: '待同步队列为空' };

  await setCollectionReceipts(queueSnapshot, 'syncing', { message: '正在写入并验证 GitHub 主站' });
  try {
    const result = await syncQueueToGitHub(queueSnapshot);
    if (!result.success || !result.verified) {
      const error = result.error || 'GitHub 主站验证未完成';
      await setCollectionReceipts(queueSnapshot, 'failed', { error, message: '收藏未确认，保留在队列中等待重试' });
      await schedulePrimaryRetry();
      return { ...result, success: false, error };
    }

    await removeSyncedQueueItems(queueSnapshot);
    const savedIds = new Set(result.savedIds || []);
    const existingIds = new Set(result.existingIds || []);
    const savedItems = queueSnapshot.filter(item => savedIds.has(item.id));
    const existingItems = queueSnapshot.filter(item => existingIds.has(item.id));
    if (savedItems.length) {
      await setCollectionReceipts(savedItems, 'verified', {
        outcome: 'saved',
        message: '已写入 GitHub 主站',
        verifiedAt: new Date().toISOString()
      });
    }
    if (existingItems.length) {
      await setCollectionReceipts(existingItems, 'verified', {
        outcome: 'already_exists',
        message: 'GitHub 主站已存在，未重复写入',
        verifiedAt: new Date().toISOString()
      });
    }
    const unclassifiedItems = queueSnapshot.filter(item => !savedIds.has(item.id) && !existingIds.has(item.id));
    if (unclassifiedItems.length) {
      await setCollectionReceipts(unclassifiedItems, 'verified', {
        outcome: 'already_exists',
        message: 'GitHub 主站已确认，未重复写入',
        verifiedAt: new Date().toISOString()
      });
    }
    return {
      success: true,
      count: result.count,
      skipped: result.skipped || 0,
      savedIds: result.savedIds || [],
      existingIds: result.existingIds || [],
      verified: true,
      verifiedCount: result.verifiedCount || queueSnapshot.length,
      verifiedAt: new Date().toISOString()
    };
  } catch (error) {
    const message = error?.message || 'GitHub 主站写入失败';
    const displayMessage = formatGitHubError(error);
    if (isRetryableGitHubError(error)) await schedulePrimaryRetry();
    await setCollectionReceipts(queueSnapshot, 'failed', { error: displayMessage, message: '收藏失败，已保留在队列中等待自动重试' });
    return { success: false, error: displayMessage };
  }
}

async function removeSyncedQueueItems(syncedItems) {
  const fingerprints = new Set(syncedItems.map(collectionFingerprint).filter(Boolean));
  await withQueueLock(async () => {
    const currentQueue = await getQueue();
    const remaining = currentQueue.filter(item => !fingerprints.has(collectionFingerprint(item)));
    if (remaining.length === 0) {
      await chrome.storage.local.remove(QUEUE_KEY);
    } else {
      await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
    }
  });
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

function collectionSourceKey(item) {
  const rawUrl = trimText(item?.sourceUrl || item?.url, 2048);
  if (!/^https:\/\//i.test(rawUrl)) return '';

  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const statusMatch = hostname === 'x.com' && parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
    if (statusMatch) return `x:${statusMatch[1].toLowerCase()}:${statusMatch[2]}`;
    if (hostname === 'x.com') return '';
    return `${hostname}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

function isCompleteCollectionItem(item) {
  const prompt = trimText(item?.prompt, 30000);
  const parserComplete = globalThis.PromptHubParser?.isCompletePrompt;
  const isComplete = typeof parserComplete === 'function'
    ? parserComplete(prompt)
    : prompt.length >= 160 && !/(?:[,;:\uFF0C\u3001\uFF1A]|\b(?:and|with|the|a|an|or|of|to|in))$/i.test(prompt);

  if (!isComplete) return false;
  if (!Array.isArray(item?.images) || item.images.length === 0) return false;
  return Boolean(collectionSourceKey(item));
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

  const sourceCandidate = trimText(item.sourceUrl || item.url, 2048);

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
    sourceUrl: /^https:\/\//i.test(sourceCandidate) ? sourceCandidate : '',
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

async function fetchGitHub(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('GitHub 请求超时');
    if (/failed to fetch|networkerror|network request failed/i.test(String(error?.message || error || ''))) {
      throw new Error('GitHub 网络连接失败');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableGitHubError(error) {
  if (error?.retryable) return true;
  const message = String(error?.message || error || '');
  return /GitHub 请求超时|GitHub 网络连接失败|Failed to fetch|NetworkError|\b(?:408|429|5\d{2})\b/.test(message);
}

function formatGitHubError(error) {
  const message = String(error?.message || error || 'GitHub 同步失败');
  if (/\b(401|403)\b/.test(message)) {
    return 'GitHub Token 无效，或缺少 PromptHub- 仓库的 Contents 读写权限';
  }
  if (/\b(409|422)\b|保存冲突/.test(message)) {
    return 'GitHub 正在更新收藏数据，已保留队列并自动重试';
  }
  if (/GitHub 请求超时/.test(message)) {
    return 'GitHub 请求超时，已保留队列并将在 2 分钟后自动重试';
  }
  if (/GitHub 网络连接失败|\b(?:408|429|5\d{2})\b/.test(message)) {
    return 'GitHub 暂时无法连接，已保留队列并将在 2 分钟后自动重试';
  }
  if (/GitHub 收藏数据无法读取|GitHub (raw|Blob) 读取失败|收藏数据格式错误/.test(message)) {
    return 'GitHub 收藏数据无法读取，队列已保留，请稍后重试';
  }
  if (/Failed to fetch|NetworkError|网络/.test(message)) {
    return '无法连接 GitHub，已保留队列，请检查网络后重试';
  }
  return message;
}

function waitForRetry(attempt) {
  return new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
}

async function schedulePrimaryRetry() {
  const queue = await getQueue();
  if (queue.length === 0) return;
  await chrome.alarms.create(PRIMARY_RETRY_ALARM_NAME, { delayInMinutes: PRIMARY_RETRY_DELAY_MINUTES });
}

async function readGitHubCollections(token) {
  const response = await fetchGitHub(GITHUB_COLLECTIONS_API, { headers: githubHeaders(token) });
  if (response.status === 404) return { sha: '', collections: [] };
  if (response.status === 401 || response.status === 403) {
    throw new Error(`GitHub Token 权限不足 (${response.status})`);
  }
  if (!response.ok) throw new Error(`GitHub 读取失败 (${response.status})`);

  const payload = await response.json();
  const parseCollectionsPayload = (text, source) => {
    let content;
    try {
      content = JSON.parse(text);
    } catch {
      throw new Error(`GitHub ${source} 收藏数据格式错误`);
    }
    const collections = Array.isArray(content) ? content : content.collections;
    if (!Array.isArray(collections)) throw new Error(`GitHub ${source} 收藏数据格式错误`);
    return collections;
  };

  const readRawCollections = async () => {
    const rawUrl = payload.download_url || `${GITHUB_COLLECTIONS_RAW}?_=${Date.now()}`;
    const rawResponse = await fetchGitHub(rawUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!rawResponse.ok) throw new Error(`GitHub raw 读取失败 (${rawResponse.status})`);
    return parseCollectionsPayload(await rawResponse.text(), 'raw');
  };

  const readBlobCollections = async () => {
    if (!payload.sha) throw new Error('GitHub Blob 读取失败 (缺少文件版本)');
    const blobResponse = await fetchGitHub(`${GITHUB_BLOB_API_BASE}${encodeURIComponent(payload.sha)}`, { headers: githubHeaders(token) });
    if (!blobResponse.ok) throw new Error(`GitHub Blob 读取失败 (${blobResponse.status})`);
    const blob = await blobResponse.json();
    if (typeof blob.content !== 'string' || !blob.content.trim()) throw new Error('GitHub Blob 读取失败 (内容为空)');
    return parseCollectionsPayload(decodeBase64Utf8(blob.content), 'Blob');
  };

  try {
    const isLargeFile = Number(payload.size) >= GITHUB_LARGE_FILE_BYTES || payload.encoding === 'none';
    if (isLargeFile) {
      try {
        return { sha: payload.sha || '', collections: await readRawCollections() };
      } catch (rawError) {
        console.warn('[PromptHub] GitHub raw read failed, falling back to blob:', rawError?.message || rawError);
        return { sha: payload.sha || '', collections: await readBlobCollections() };
      }
    }

    if (typeof payload.content === 'string' && payload.content.trim()) {
      return { sha: payload.sha || '', collections: parseCollectionsPayload(decodeBase64Utf8(payload.content), 'API') };
    }

    if (payload.sha) {
      try {
        return { sha: payload.sha || '', collections: await readBlobCollections() };
      } catch (blobError) {
        console.warn('[PromptHub] GitHub blob read failed, falling back to raw:', blobError?.message || blobError);
      }
    }

    return { sha: payload.sha || '', collections: await readRawCollections() };
  } catch (error) {
    if (isRetryableGitHubError(error)) throw error;
    console.warn('[PromptHub] GitHub collections parse failed:', error?.message || error);
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

  const response = await fetchGitHub(GITHUB_COLLECTIONS_API, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (response.status === 409 || response.status === 422) {
    const error = new Error('GitHub 保存冲突');
    error.retryable = true;
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`GitHub Token 权限不足 (${response.status})`);
  }
  if (!response.ok) throw new Error(`GitHub 保存失败 (${response.status})`);
}

async function verifyGitHubCollections(token, entries) {
  const snapshot = await readGitHubCollections(token);
  const collections = snapshot.collections.map(sanitizeRemoteItem).filter(Boolean);
  const sourceKeys = new Set(collections.map(collectionSourceKey).filter(Boolean));
  const fingerprints = new Set(collections.map(collectionFingerprint).filter(Boolean));
  const missing = entries.filter(entry => {
    const sourceKey = collectionSourceKey(entry);
    return !(sourceKey && sourceKeys.has(sourceKey)) && !fingerprints.has(collectionFingerprint(entry));
  });
  if (missing.length) {
    throw new Error(`GitHub 写入后验证失败：${missing.length} 个提示词未确认`);
  }
  return { success: true, count: entries.length };
}

async function mutateGitHubCollections(operation, item) {
  const token = await getGitHubToken();
  const safeItem = operation === 'delete' ? { id: trimText(item?.id, 120) } : sanitizeRemoteItem(item);
  if (!safeItem?.id) return { success: false, error: '收藏数据不完整' };
  if (operation === 'create' && !isCompleteCollectionItem(safeItem)) {
    return { success: false, error: '提示词不完整、缺少结果图，或无法定位原帖，未收藏' };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = await readGitHubCollections(token);
    const collections = snapshot.collections.map(sanitizeRemoteItem).filter(Boolean);
    const index = collections.findIndex(entry => entry.id === safeItem.id);
    const now = new Date().toISOString();
    let changed = 0;

    if (operation === 'delete') {
      if (index !== -1) {
        collections.splice(index, 1);
        changed = 1;
      }
    } else if (operation === 'create') {
      const duplicate = collections.find(entry => collectionFingerprint(entry) === collectionFingerprint(safeItem));
      const sourceKey = collectionSourceKey(safeItem);
      const sameSource = sourceKey && collections.find(entry => collectionSourceKey(entry) === sourceKey);
      if (index !== -1 || duplicate || sameSource) {
        return { success: true, count: 0, alreadySaved: true, duplicateId: (collections[index] || duplicate || sameSource).id };
      }
      collections.unshift({ ...safeItem, collectedAt: now, githubSyncedAt: now, domesticSyncedAt: null });
      changed = 1;
    } else if (operation === 'update') {
      if (index === -1) return { success: false, error: '未找到需要更新的收藏' };
      collections[index] = {
        ...collections[index],
        ...safeItem,
        id: collections[index].id,
        collectedAt: collections[index].collectedAt || collections[index].githubSyncedAt || now,
        githubSyncedAt: now,
        domesticSyncedAt: collections[index].domesticSyncedAt || null
      };
      changed = 1;
    } else {
      return { success: false, error: '未知收藏操作' };
    }

    try {
      await writeGitHubCollections(token, collections, snapshot.sha);
      return { success: true, count: changed };
    } catch (error) {
      if (!error.retryable || attempt === 7) throw error;
      await waitForRetry(attempt);
    }
  }

  return { success: false, error: 'GitHub 保存失败' };
}

async function syncQueueToGitHub(queue) {
  const queueEntries = Array.isArray(queue) ? queue : [];
  const seenFingerprints = new Set();
  const seenSources = new Set();
  const entries = queueEntries
    .map(sanitizeRemoteItem)
    .filter(item => {
      const fingerprint = collectionFingerprint(item);
      const sourceKey = collectionSourceKey(item);
      if (!isCompleteCollectionItem(item) || !fingerprint || seenFingerprints.has(fingerprint) || seenSources.has(sourceKey)) return false;
      seenFingerprints.add(fingerprint);
      seenSources.add(sourceKey);
      return true;
    });

  if (entries.length === 0) return { success: true, count: 0, skipped: 0, savedIds: [], existingIds: [] };

  const token = await getGitHubToken();
  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = await readGitHubCollections(token);
    const collections = snapshot.collections.map(sanitizeRemoteItem).filter(Boolean);
    const savedFingerprints = new Set(collections.map(collectionFingerprint));
    const savedSources = new Set(collections.map(collectionSourceKey).filter(Boolean));
    const additions = entries.filter(entry => !savedFingerprints.has(collectionFingerprint(entry)) && !savedSources.has(collectionSourceKey(entry)));
    const existingEntries = entries.filter(entry => !additions.includes(entry));
    const skipped = entries.length - additions.length;

    if (additions.length === 0) {
      return {
        success: true,
        count: 0,
        skipped,
        savedIds: [],
        existingIds: existingEntries.map(entry => entry.id),
        verified: true,
        verifiedCount: entries.length
      };
    }

    const now = new Date().toISOString();
    const newCollections = additions
      .map(entry => ({ ...entry, collectedAt: now, githubSyncedAt: now, domesticSyncedAt: null }))
      .reverse();

    try {
      await writeGitHubCollections(token, [...newCollections, ...collections], snapshot.sha);
      const verification = await verifyGitHubCollections(token, additions);
      return {
        success: true,
        count: additions.length,
        skipped,
        savedIds: additions.map(entry => entry.id),
        existingIds: existingEntries.map(entry => entry.id),
        verified: true,
        verifiedCount: verification.count
      };
    } catch (error) {
      if (!error.retryable || attempt === 7) throw error;
      await waitForRetry(attempt);
    }
  }

  return { success: false, error: 'GitHub 保存失败' };
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === PRIMARY_RETRY_ALARM_NAME) {
    queueAutomaticPrimarySync().catch(error => console.warn('[PromptHub] Primary retry failed:', error?.message || error));
  }
});

chrome.runtime.onStartup.addListener(() => {
  queueAutomaticPrimarySync().catch(error => console.warn('[PromptHub] Queue recovery failed:', error?.message));
});

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
