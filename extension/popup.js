// ==========================================
// PromptHub Extension v2 - Popup Script
// 扫描页面 / 收藏队列 / 同步到网站
// ==========================================

const WEBSITE_URL = 'https://prompthub.kxbbw81.workers.dev';
const QUEUE_KEY = 'prompthub_queue';

function $(s) { return document.querySelector(s); }

// --- Toast ---
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// --- 队列操作 ---
async function getQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return data[QUEUE_KEY] || [];
}

async function addToQueue(item) {
  const queue = await getQueue();
  if (!queue.some(q => q.prompt === item.prompt)) {
    queue.push(item);
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
    updateQueueUI();
    return true;
  }
  return false;
}

async function removeFromQueue(promptText) {
  const queue = await getQueue();
  const filtered = queue.filter(q => q.prompt !== promptText);
  await chrome.storage.local.set({ [QUEUE_KEY]: filtered });
  updateQueueUI();
}

async function clearQueue() {
  await chrome.storage.local.remove(QUEUE_KEY);
  updateQueueUI();
}

function updateQueueUI() {
  getQueue().then(queue => {
    const bar = $('#queue-bar');
    const num = $('#queue-num');
    const hq = $('#header-queue');
    const hqNum = $('#header-queue-num');
    if (queue.length > 0) {
      bar.style.display = 'block';
      num.textContent = queue.length;
      hq.style.display = 'flex';
      hqNum.textContent = queue.length;
    } else {
      bar.style.display = 'none';
      hq.style.display = 'none';
    }
  });
}

// --- 复制到剪贴板 ---
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制到剪贴板');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制到剪贴板');
  });
}

// --- 注入到页面的扫描函数 ---
// 此函数在页面上下文中执行，不能引用外部变量
const SCAN_FUNCTION = () => {
  const INDICATORS = [
    'photorealistic','cinematic','8k','4k','ultra detailed','hyperrealistic',
    'hyperdetailed','digital art','oil painting','watercolor','concept art',
    'portrait of','landscape of','shot on','dslr','bokeh',
    'depth of field','studio lighting','golden hour','volumetric',
    'render','octane','unreal engine','blender','midjourney',
    'stable diffusion','dalle','prompt','negative prompt',
    'aspect ratio','--ar','--v','--style','--chaos','--stylize','--niji',
    'style of','in the style of','masterpiece','best quality',
    'highly detailed','intricate','soft lighting','dramatic lighting',
    'natural lighting','close up','wide angle','full body','upper body',
    'f/1.4','f/2.8','85mm','50mm','35mm','100mm','24mm',
    'canon','nikon','sony','leica','hasselblad',
    'trending on artstation','greg rutkowski','weta digital',
    'sharp focus','rim lighting','backlit','cinematic lighting',
    'matte painting','vfx','ethereal','surreal','ornate',
    'anime','manga','studio ghibli','makoto shinkai',
    'cyberpunk','steampunk','dieselpunk',
    'pen and ink','pencil sketch','charcoal','pastel',
    'low poly','isometric','voxel art','pixel art',
    'logo design','typography','flat design',
    'matte','glossy','iridescent','translucent',
    'macro lens','tilt-shift','telephoto','wide-angle lens'
  ];

  function isPromptLike(text) {
    const t = text.toLowerCase();
    let score = 0;
    for (const ind of INDICATORS) { if (t.includes(ind)) score++; }
    const wc = text.split(/\s+/).length;
    const cc = (text.match(/,/g) || []).length;
    if (wc > 15 && cc >= 3) score += 2;
    if (wc > 30) score += 1;
    if (/--(ar|v|style|chaos|stylize|niji|seed|hd)\b/.test(t)) score += 3;
    return score >= 3 && text.length > 50;
  }

  const CAT_KW = {
    '人像':['portrait','face','model','person','woman','man','selfie','headshot','girl','boy'],
    '风景':['landscape','mountain','sunrise','sunset','valley','horizon','forest','lake'],
    '建筑':['architecture','building','interior','facade','house','skyscraper'],
    '科幻':['sci-fi','space','futuristic','robot','alien','spaceship','galaxy'],
    '赛博朋克':['cyberpunk','neon','cyber','hologram','dystopian'],
    '奇幻':['fantasy','dragon','wizard','magic','elf','dungeon','castle','knight'],
    '动物':['animal','dog','cat','lion','wolf','bird','wildlife','fox','tiger'],
    '静物':['still life','vase','fruit','tabletop'],
    '美食':['food','dish','cuisine','sushi','pizza','coffee','dessert','cake'],
    '时尚':['fashion','outfit','runway','couture','dress','streetwear'],
    '角色':['character','concept art','hero','villain','warrior','samurai'],
    '抽象':['abstract','swirl','geometric','pattern','texture','fractal'],
    '自然':['forest','flower','tree','ocean','river','leaf','butterfly','waterfall'],
    '城市':['city','urban','skyline','street','cityscape','downtown']
  };

  function detectCat(text) {
    const l = text.toLowerCase();
    let cat = '抽象', max = 0;
    for (const [c, kws] of Object.entries(CAT_KW)) {
      const s = kws.reduce((a, kw) => a + (l.includes(kw.toLowerCase()) ? 1 : 0), 0);
      if (s > max) { max = s; cat = c; }
    }
    return cat;
  }

  function extractTags(text) {
    const l = text.toLowerCase();
    const tags = ['cinematic','photorealistic','oil painting','watercolor','digital art',
      'anime','minimalist','dark','dreamy','vintage','macro','bokeh',
      'golden hour','studio lighting','8k','ultra detailed','hyperrealistic',
      'concept art','octane render','unreal engine','trending on artstation',
      'cyberpunk','steampunk','low poly','pixel art'].filter(t => l.includes(t));
    return tags.length > 0 ? tags.slice(0, 5) : ['AI生成'];
  }

  function findImgs(el) {
    const results = [];
    const seen = new Set();
    const AVATAR_PATTERNS = [
      'profile_images', 'default_profile', 'avatar', 'profile_pic', 'profilepic',
      'icon', 'emoji', 'badge', 'logo', 'favicon', 'sprite', 'placeholder',
    ];
    const AVATAR_CLASS = [
      'avatar', 'profile-image', 'profile-pic', 'profilepic',
      'user-avatar', 'user-image', 'account-icon', 'icon',
    ];

    function isAvatar(img) {
      if (!img || !img.src) return true;
      const src = img.src.toLowerCase();
      for (const p of AVATAR_PATTERNS) { if (src.includes(p)) return true; }
      let node = img;
      for (let i = 0; i < 4 && node; i++) {
        const cls = (node.className || '').toString().toLowerCase();
        for (const p of AVATAR_CLASS) { if (cls.includes(p)) return true; }
        node = node.parentElement;
      }
      try {
        const st = window.getComputedStyle(img);
        const r = parseFloat(st.borderRadius) || 0;
        const w = img.getBoundingClientRect().width;
        if (w > 0 && r / w >= 0.45) return true;
      } catch(e) {}
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 80) return true;
      if (rect.height > 0 && rect.height < 80) return true;
      return false;
    }

    function addImg(img) {
      if (!img || !img.src || isAvatar(img)) return;
      if (seen.has(img.src)) return;
      seen.add(img.src);
      results.push(img.src);
    }

    const siteSels = [
      '[data-testid="tweetPhoto"] img',
      'article [data-testid="tweetPhoto"] img',
      '[data-testid="post-content"] img',
      '.media-element img',
      '[class*="imageWrapper"] img',
      '[class*="gallery"] img',
      '[class*="post-image"] img',
    ];
    let article = el.closest('article') || el.closest('[data-testid="tweet"]') ||
                  el.closest('[data-testid="post-content"]') || el.closest('.post') ||
                  el.closest('[class*="message"]') || el;
    for (const sel of siteSels) {
      const imgs = article.querySelectorAll ? article.querySelectorAll(sel) : [];
      imgs.forEach(addImg);
    }

    let c = el;
    for (let i = 0; i < 3; i++) {
      if (!c.parentElement) break;
      c = c.parentElement;
      c.querySelectorAll('img').forEach(addImg);
    }

    const sibs = [el.previousElementSibling, el.nextElementSibling,
      el.parentElement?.previousElementSibling, el.parentElement?.nextElementSibling];
    for (const s of sibs) {
      if (!s) continue;
      if (s.tagName === 'IMG') addImg(s);
      if (s.querySelectorAll) s.querySelectorAll('img').forEach(addImg);
    }
    return results;
  }

  function extractTitle(text, el) {
    let prev = el.previousElementSibling;
    for (let i = 0; i < 3 && prev; i++) {
      if (/^H[1-4]$/i.test(prev.tagName)) {
        const t = prev.textContent.trim().slice(0, 50);
        if (t) return t;
      }
      prev = prev.previousElementSibling;
    }
    const fl = text.split('\n')[0].trim();
    if (fl.length < 60 && fl.length > 3) return fl;
    const fs = text.split(/[.!?。！？]/)[0].trim().slice(0, 50);
    if (fs.length > 3) return fs;
    return '未命名提示词';
  }

  const prompts = [];
  const seen = new Set();
  const sels = [
    'p','pre','code','blockquote','li',
    '[class*="prompt"]','[data-testid*="prompt"]',
    '[data-testid="tweetText"]',
    '[data-testid="post-content"]','.RichTextJSON-root','.md',
    '[class*="markup"]','[id*="message-content"]',
    '[class*="caption"]','[class*="description"]','[class*="post-text"]'
  ];
  const els = document.querySelectorAll(sels.join(', '));

  for (const el of els) {
    if (el.querySelector(sels.join(', '))) continue;
    const text = el.textContent.trim();
    if (text.length < 50 || text.length > 3000 || seen.has(text)) continue;
    if (isPromptLike(text)) {
      seen.add(text);
      const imgs = findImgs(el);
      prompts.push({
        id: 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        title: extractTitle(text, el),
        prompt: text,
        category: detectCat(text),
        tags: extractTags(text),
        image: imgs[0] || '',
        images: imgs,
        url: location.href,
        domain: location.hostname,
        source: '插件扫描',
        date: new Date().toISOString().slice(0, 10),
        timestamp: Date.now()
      });
    }
  }
  return prompts;
};

// --- 渲染扫描结果 ---
function renderPrompts(prompts) {
  const content = $('#content');

  if (!prompts || prompts.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">当前页面未检测到 AI 提示词</div>
        <div class="empty-hint">尝试在 Twitter、Reddit、Civitai 等页面扫描</div>
      </div>
    `;
    return;
  }

  let html = `<div class="scan-badge">检测到 ${prompts.length} 个提示词</div>`;
  prompts.forEach((p, idx) => {
    const imgHTML = p.image
      ? `<img class="prompt-item-thumb" src="${p.image}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="prompt-item-thumb-placeholder" style="display:none;">🍌</div>`
      : `<div class="prompt-item-thumb-placeholder">🍌</div>`;

    html += `
      <div class="prompt-item" data-idx="${idx}">
        <div class="prompt-item-head">
          ${imgHTML}
          <div class="prompt-item-info">
            <div class="prompt-item-title">${escapeHTML(p.title)}</div>
            <div class="prompt-item-cat">${p.category}</div>
          </div>
        </div>
        <div class="prompt-item-text">${escapeHTML(p.prompt)}</div>
        <div class="prompt-item-actions">
          <button class="mini-btn mini-btn-copy" data-idx="${idx}">📋 复制</button>
          <button class="mini-btn mini-btn-collect" data-idx="${idx}">❤️ 收藏</button>
        </div>
      </div>
    `;
  });

  content.innerHTML = html;

  // 绑定事件
  content.querySelectorAll('.mini-btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      copyText(prompts[idx].prompt);
    });
  });

  content.querySelectorAll('.mini-btn-collect').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const added = await addToQueue(prompts[idx]);
      if (added) {
        showToast('已加入待同步队列');
        btn.textContent = '✓ 已收藏';
        btn.classList.add('mini-btn-collected');
      } else {
        showToast('已在队列中');
      }
    });
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- 扫描当前页面 ---
$('#btn-scan').addEventListener('click', async () => {
  $('#content').innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div class="loading-text">正在扫描页面…</div>
    </div>
  `;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      $('#content').innerHTML = '<div class="status">无法获取当前页面</div>';
      return;
    }

    // 检查是否是浏览器内置页面
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      $('#content').innerHTML = '<div class="status"><div class="status-icon">⚠️</div>浏览器内置页面无法扫描</div>';
      return;
    }

    // 注入扫描函数
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: SCAN_FUNCTION
    });

    const prompts = results[0]?.result || [];
    renderPrompts(prompts);
  } catch (err) {
    // 尝试通过 content script 扫描
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'scan' }, (response) => {
        if (chrome.runtime.lastError) {
          $('#content').innerHTML = `<div class="status"><div class="status-icon">⚠️</div>扫描失败<br><span style="font-size:11px;color:#CCC">${err.message}</span></div>`;
          return;
        }
        renderPrompts(response?.prompts || []);
      });
    } catch {
      $('#content').innerHTML = '<div class="status"><div class="status-icon">⚠️</div>扫描失败，请刷新页面后重试</div>';
    }
  }
});

// --- 打开网站 ---
$('#btn-site').addEventListener('click', () => {
  chrome.tabs.create({ url: WEBSITE_URL });
});

// --- 同步到网站 ---
$('#btn-sync').addEventListener('click', async () => {
  const btn = $('#btn-sync');
  btn.disabled = true;
  btn.textContent = '同步中…';

  try {
    const queue = await getQueue();
    if (queue.length === 0) {
      showToast('队列为空');
      return;
    }

    // 查找或打开 PromptHub 标签页
    const tabs = await chrome.tabs.query({ url: '*://prompthub.kxbbw81.workers.dev/*' });
    let tab;
    if (tabs.length > 0) {
      tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
    } else {
      tab = await chrome.tabs.create({ url: WEBSITE_URL + '#/collections' });
      // 等待页面真正加载完成（最多等 15 秒）
      btn.textContent = '等待页面加载…';
      await new Promise((resolve) => {
        let done = false;
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete' && !done) {
            done = true;
            chrome.tabs.onUpdated.removeListener(listener);
            // 多等 500ms 确保 JS 初始化
            setTimeout(resolve, 500);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // 超时兜底：15 秒后无论如何都继续
        setTimeout(() => {
          if (!done) {
            done = true;
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }, 15000);
      });
    }

    // 注入函数写入 localStorage
    const injectResult = await chrome.scripting.executeScript({
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
          return { success: true, count: deduped.length };
        } catch (e) {
          console.error('PromptHub sync error:', e);
          return { success: false, error: e.message };
        }
      },
      args: [queue]
    });

    const result = injectResult[0]?.result;
    if (result && !result.success) {
      throw new Error(result.error || '写入 localStorage 失败');
    }

    // 主动触发网站的检查函数（不等 setInterval 轮询）
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // 触发 storage 事件让网站监听器捕获
        const data = localStorage.getItem('prompthub_ext_import');
        if (data) {
          // 手动触发 storage 事件（同窗口内 setItem 不会自动触发 storage 事件）
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'prompthub_ext_import',
            newValue: data,
            oldValue: null,
            storageArea: localStorage
          }));
        }
      }
    });

    // 清空队列
    await clearQueue();
    showToast(`已同步 ${queue.length} 个提示词到网站！`);

    // 切换到网站标签页
    await chrome.tabs.update(tab.id, { active: true });

    // 显示成功状态
    $('#content').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="font-size:40px;">✅</div>
        <div class="empty-text" style="font-size:14px;color:#00B894;font-weight:600;">
          已同步 ${queue.length} 个提示词
        </div>
        <div class="empty-hint" style="margin-top:8px;">
          已自动打开 PromptHub，请在网站查看
        </div>
      </div>
    `;
  } catch (e) {
    showToast('同步失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 同步到网站';
  }
});

// --- 初始化 ---
updateQueueUI();

// 自动扫描（延迟 200ms 让弹窗先渲染）
setTimeout(() => {
  $('#btn-scan').click();
}, 200);
