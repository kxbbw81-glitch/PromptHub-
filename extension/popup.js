// ==========================================
// PromptHub Extension v2 - Popup Script
// 扫描页面 / 收藏队列 / 同步到网站
// ==========================================

const WEBSITE_URL = 'https://kxbbw81-glitch.github.io/PromptHub-/';
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
    Portrait:['portrait','face','model','person','woman','man','selfie','headshot','girl','boy'],
    Landscape:['landscape','mountain','sunrise','sunset','valley','horizon','forest','lake'],
    Architecture:['architecture','building','interior','facade','house','skyscraper'],
    'Sci-Fi':['sci-fi','space','futuristic','robot','alien','spaceship','galaxy'],
    Cyberpunk:['cyberpunk','neon','cyber','hologram','dystopian'],
    Fantasy:['fantasy','dragon','wizard','magic','elf','dungeon','castle','knight'],
    Animals:['animal','dog','cat','lion','wolf','bird','wildlife','fox','tiger'],
    'Still Life':['still life','vase','fruit','tabletop'],
    Food:['food','dish','cuisine','sushi','pizza','coffee','dessert','cake'],
    Fashion:['fashion','outfit','runway','couture','dress','streetwear'],
    Character:['character','concept art','hero','villain','warrior','samurai'],
    Abstract:['abstract','swirl','geometric','pattern','texture','fractal'],
    Nature:['forest','flower','tree','ocean','river','leaf','butterfly','waterfall'],
    Cityscape:['city','urban','skyline','street','cityscape','downtown']
  };

  function detectCat(text) {
    const l = text.toLowerCase();
    let cat = 'Abstract', max = 0;
    for (const [c, kws] of Object.entries(CAT_KW)) {
      const s = kws.reduce((a, kw) => a + (l.includes(kw) ? 1 : 0), 0);
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

  function findImg(el) {
    // 头像/图标 URL 模式黑名单
    const AVATAR_PATTERNS = [
      'profile_images', 'default_profile',  // Twitter/X
      'avatar', 'profile_pic', 'profilepic',
      'icon', 'emoji', 'badge', 'logo',
      'favicon', 'sprite', 'placeholder',
    ];
    const AVATAR_CLASS = [
      'avatar', 'profile-image', 'profile-pic', 'profilepic',
      'user-avatar', 'user-image', 'account-icon', 'icon',
    ];

    function isAvatar(img) {
      if (!img || !img.src) return true;
      const src = img.src.toLowerCase();
      for (const p of AVATAR_PATTERNS) { if (src.includes(p)) return true; }
      // CSS 类名检查（img 及祖先）
      let node = img;
      for (let i = 0; i < 4 && node; i++) {
        const cls = (node.className || '').toString().toLowerCase();
        for (const p of AVATAR_CLASS) { if (cls.includes(p)) return true; }
        node = node.parentElement;
      }
      // 圆形图片 = 头像
      try {
        const st = window.getComputedStyle(img);
        const r = parseFloat(st.borderRadius) || 0;
        const w = img.getBoundingClientRect().width;
        if (w > 0 && r / w >= 0.45) return true;
      } catch(e) {}
      // 尺寸过小 = 图标
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 80) return true;
      if (rect.height > 0 && rect.height < 80) return true;
      return false;
    }

    // 1. 站点特定选择器优先
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
      for (const img of imgs) { if (!isAvatar(img)) return img.src; }
    }

    // 2. 父容器中查找 — 跳过头像
    let c = el;
    for (let i = 0; i < 3; i++) {
      if (!c.parentElement) break;
      c = c.parentElement;
      const imgs = c.querySelectorAll('img');
      for (const img of imgs) { if (!isAvatar(img)) return img.src; }
    }

    // 3. 兄弟元素
    const sibs = [el.previousElementSibling, el.nextElementSibling,
      el.parentElement?.previousElementSibling, el.parentElement?.nextElementSibling];
    for (const s of sibs) {
      if (!s) continue;
      const imgs = s.querySelectorAll ? s.querySelectorAll('img') : [];
      for (const img of imgs) { if (!isAvatar(img)) return img.src; }
      if (s.tagName === 'IMG' && !isAvatar(s)) return s.src;
    }
    return '';
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
      prompts.push({
        id: 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        title: extractTitle(text, el),
        prompt: text,
        category: detectCat(text),
        tags: extractTags(text),
        image: findImg(el),
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
    const tabs = await chrome.tabs.query({ url: '*://kxbbw81-glitch.github.io/*' });
    let tab;
    if (tabs.length > 0) {
      tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
    } else {
      tab = await chrome.tabs.create({ url: WEBSITE_URL + '#/collections' });
      // 等待页面加载
      btn.textContent = '等待页面加载…';
      await new Promise(resolve => setTimeout(resolve, 3500));
    }

    // 注入函数写入 localStorage
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
