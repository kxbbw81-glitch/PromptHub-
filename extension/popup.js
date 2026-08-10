// ==========================================
// PromptHub Extension v2 - Popup Script
// 扫描页面 / 收藏队列 / GitHub 主站验证
// ==========================================

const GITHUB_PAGES_URL = 'https://kxbbw81-glitch.github.io/PromptHub-/';
const WEBSITE_URL = GITHUB_PAGES_URL;
const VERIFICATION_STALE_MS = 45000;
const MAIN_MERGE_STALE_MS = 5 * 60 * 1000;

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
  const result = await chrome.runtime.sendMessage({ action: 'getQueue' });
  return Array.isArray(result?.queue) ? result.queue : [];
}

async function getCollectionFeedback() {
  return chrome.runtime.sendMessage({ action: 'getCollectionFeedback' });
}

async function getCollectionReceipt(id) {
  const result = await chrome.runtime.sendMessage({ action: 'getCollectionReceipt', id });
  return result?.receipt || null;
}

async function addToQueue(item) {
  const result = await chrome.runtime.sendMessage({
    action: 'addToQueue',
    data: item
  });
  if (!result?.success) {
    return { success: false, error: result?.error || '收藏失败，请稍后重试' };
  }
  return result;
}

async function addItemsToQueue(items) {
  const result = await chrome.runtime.sendMessage({
    action: 'addItemsToQueue',
    data: items
  });
  if (!result?.success) {
    return { success: false, error: result?.error || '批量收藏失败，请稍后重试' };
  }
  return result;
}

async function removeFromQueue(promptText) {
  return chrome.runtime.sendMessage({ action: 'removeFromQueue', prompt: promptText });
}

async function clearQueue() {
  return chrome.runtime.sendMessage({ action: 'clearQueue' });
}

async function updateQueueUI() {
  const [queue, feedback] = await Promise.all([getQueue(), getCollectionFeedback()]);
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
  renderVerificationStatus(feedback, queue.length);
  renderSyncTasks(feedback?.receipts || []);
}

const TASK_STATE_LABELS = {
  queued: '待上传',
  syncing: '上传中',
  submitted: '已提交',
  verified: '主站已确认',
  failed: '上传失败'
};

function formatTaskTime(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function taskTitle(receipt) {
  return receipt?.title || receipt?.item?.title || receipt?.sourceUrl || '未命名提示词';
}

function renderSyncTasks(receipts) {
  const panel = $('#sync-tasks');
  const list = $('#sync-task-list');
  const tasks = (Array.isArray(receipts) ? receipts : []).slice(0, 20);
  if (!tasks.length) {
    panel.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  panel.style.display = 'block';
  list.innerHTML = tasks.map(receipt => {
    const state = receipt.state || 'queued';
    const outcome = receipt.outcome === 'already_exists' ? '主站已存在' : TASK_STATE_LABELS[state] || '处理中';
    const detail = receipt.error || receipt.message || '';
    return `
      <div class="sync-task sync-task-${escapeHTML(state)}">
        <span class="sync-task-dot" aria-hidden="true"></span>
        <div class="sync-task-main">
          <div class="sync-task-title">${escapeHTML(taskTitle(receipt))}</div>
          <div class="sync-task-meta">${escapeHTML(outcome)} · ${escapeHTML(formatTaskTime(receipt.updatedAt))}</div>
          ${detail ? `<div class="sync-task-detail">${escapeHTML(detail)}</div>` : ''}
        </div>
        ${state === 'failed' ? `<button class="sync-task-retry" data-retry-id="${escapeHTML(receipt.id)}" type="button">重试</button>` : ''}
      </div>
    `;
  }).join('');
}

function renderVerificationStatus(feedback, queueLength = 0) {
  const panel = $('#verification-status');
  const icon = $('#verification-status-icon');
  const text = $('#verification-status-text');
  const receipt = feedback?.latest;
  const submittedCount = Number(feedback?.submittedCount || feedback?.stats?.submitted || 0);
  if (!receipt && queueLength === 0 && submittedCount === 0) {
    panel.style.display = 'none';
    return;
  }

  const state = receipt?.state || (queueLength > 0 ? 'queued' : 'idle');
  const isStaleSync = state === 'syncing'
    && Date.now() - Date.parse(receipt?.updatedAt || 0) > VERIFICATION_STALE_MS;
  const isStaleMerge = state === 'submitted'
    && Date.now() - Date.parse(receipt?.submittedAt || receipt?.updatedAt || 0) > MAIN_MERGE_STALE_MS;
  const displayState = isStaleSync || isStaleMerge ? 'failed' : state;
  panel.className = `verification-status${displayState === 'verified' ? ' success' : displayState === 'failed' ? ' error' : ''}`;
  icon.textContent = displayState === 'verified' ? '✓' : displayState === 'failed' ? '!' : '⏳';
  text.textContent = isStaleSync
    ? `GitHub 队列提交超时，${queueLength} 个提示词仍在本机队列中，请点击下方重试`
    : isStaleMerge
      ? 'GitHub 主站合并超过 5 分钟未确认，请点击下方重试或稍后重新扫描'
      : queueLength > 0 || submittedCount > 0
        ? `本机待上传 ${queueLength} 个；已提交主站队列 ${submittedCount} 个。可继续收藏新的提示词`
        : receipt?.message || '暂无收藏验证记录';
  panel.style.display = 'flex';
}

function renderCollectionOutcome(button, receipt) {
  if (!button || !receipt) return;
  button.classList.remove('mini-btn-collected', 'mini-btn-existing', 'mini-btn-rejected');
  if (receipt.state === 'submitted' || receipt.outcome === 'submitted') {
    button.textContent = '⏳ 已提交主站队列';
  } else if (receipt.outcome === 'saved') {
    button.textContent = '✓ 已写入主站';
    button.classList.add('mini-btn-collected');
  } else if (receipt.outcome === 'submitted') {
    button.textContent = '✓ 已提交队列';
    button.classList.add('mini-btn-collected');
  } else if (receipt.outcome === 'already_exists') {
    button.textContent = '＝ 主站已存在';
    button.classList.add('mini-btn-existing');
  } else {
    button.textContent = '✓ 已验证主站';
    button.classList.add('mini-btn-collected');
  }
  button.disabled = true;
}

function renderInitialBatchOutcome(button, outcome) {
  if (!button || !outcome) return;
  if (outcome.outcome === 'batch_duplicate') {
    button.textContent = '⏭ 本批重复';
    button.classList.add('mini-btn-existing');
    button.disabled = true;
  } else if (outcome.outcome === 'rejected') {
    button.textContent = '！无法收藏';
    button.classList.add('mini-btn-rejected');
    button.disabled = true;
  } else if (outcome.outcome === 'already_queued') {
    button.textContent = '已在验证队列';
    button.disabled = true;
  }
}

async function waitForCollectionVerification(id, button) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const receipt = await getCollectionReceipt(id);
    if (!receipt) continue;
    if (receipt.state === 'verified') {
      renderCollectionOutcome(button, receipt);
      await updateQueueUI();
      return;
    }
    if (receipt.state === 'submitted') {
      renderCollectionOutcome(button, receipt);
      showToast('已提交待合并队列，尚未写入主站；插件会自动复查');
      await updateQueueUI();
      return;
    }
    if (receipt.state === 'failed') {
      button.disabled = false;
      button.textContent = '↻ 重试收藏';
      showToast(receipt.error || '收藏验证失败，已保留在队列');
      await updateQueueUI();
      return;
    }
    button.textContent = receipt.state === 'syncing' ? '正在提交…' : '已加入队列';
  }
  button.disabled = false;
  button.textContent = '↻ 提交超时，重试收藏';
  showToast('GitHub 队列提交超时，收藏仍保留在本机队列中');
  await updateQueueUI();
}

async function waitForBatchVerification(ids, button, buttonsById = new Map()) {
  const trackedIds = [...new Set(ids || [])];
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const receipts = await Promise.all(trackedIds.map(getCollectionReceipt));
    const verified = receipts.filter(receipt => receipt?.state === 'verified').length;
    const failed = receipts.filter(receipt => receipt?.state === 'failed').length;
    receipts.forEach((receipt, index) => {
      if (receipt?.state === 'verified' || receipt?.state === 'submitted') renderCollectionOutcome(buttonsById.get(trackedIds[index]), receipt);
    });
    if (failed) {
      button.disabled = false;
      button.textContent = `↻ ${failed} 个收藏待重试`;
      showToast('部分收藏验证失败，已保留在队列');
      await updateQueueUI();
      return;
    }
    const submitted = receipts.filter(receipt => receipt?.state === 'submitted').length;
    if (verified + submitted === trackedIds.length) {
      const saved = receipts.filter(receipt => receipt?.outcome === 'saved').length;
      const existing = receipts.filter(receipt => receipt?.outcome === 'already_exists').length;
      button.textContent = submitted ? `⏳ 已提交主站队列 ${submitted} 个` : existing ? `✓ 写入 ${saved} 个，已存在 ${existing} 个` : `✓ 已写入主站 ${saved} 个`;
      if (!submitted) button.classList.add('mini-btn-collected');
      showToast(submitted
        ? `已提交 GitHub 入站队列 ${submitted} 个，主站合并后会自动确认`
        : existing ? `主站写入 ${saved} 个；${existing} 个已存在，未重复写入` : `已写入 GitHub 主站 ${saved} 个提示词`);
      await updateQueueUI();
      return;
    }
    button.textContent = `正在提交 ${verified}/${trackedIds.length}`;
  }
  trackedIds.forEach(id => {
    const promptButton = buttonsById.get(id);
    if (promptButton) {
      promptButton.disabled = false;
      promptButton.textContent = '↻ 重试收藏';
    }
  });
  button.disabled = false;
  button.textContent = '↻ 提交超时，重试主站';
  showToast('GitHub 队列提交超时，收藏仍保留在本机队列中');
  await updateQueueUI();
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
    // 英文指标
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
    'macro lens','tilt-shift','telephoto','wide-angle lens',
    // 中文指标
    '提示词','生成','像素','构图','光照','光线','背景','前景',
    '负面约束','正面约束','负面提示','正面提示',
    '人物','女性','男性','面部','五官','写真','模特','半身','全身',
    '场景','风格','色调','光影','渲染','质感','细节','氛围','意境',
    '景深','特写','全景','仰视','俯视','侧脸','侧面','正面',
    '超高画质','高清','高画质','超高清',
    '东方','国风','国潮','古风','水墨','工笔','版画','青绿',
    '瓷白','宣纸','钴蓝','青玉',
    '摄影','镜头','焦距','光圈','快门',
    '不要文字','不要水印','无水印','不生成文字',
    '竖版','横版','画幅','比例',
    '参考','借鉴','参考图','风格参考',
    '海报','插画','艺术','绘画',
    '动作','表情','姿势','服饰','穿搭','配饰',
    '远山','园门','花卉','植物','建筑',
    '柔和','克制','饱和','低饱和','高饱和',
    '构图关系','视觉','视觉线条',
    '虚构','原创','独立',
  ];

  function isPromptLike(text) {
    const t = text.toLowerCase();
    let score = 0;
    for (const ind of INDICATORS) { if (t.includes(ind.toLowerCase())) score++; }

    // 词数：英文按空格，中文按字符（2字≈1词）
    const enWords = text.split(/\s+/).filter(w => w.length > 0).length;
    const cnChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const wc = enWords + Math.floor(cnChars / 2);

    // 逗号：英文 + 中文
    const enC = (text.match(/,/g) || []).length;
    const cnC = (text.match(/，/g) || []).length;
    const cc = enC + cnC;

    if (wc > 15 && cc >= 3) score += 2;
    if (wc > 30) score += 1;
    if (/--(ar|v|style|chaos|stylize|niji|seed|hd)\b/.test(t)) score += 3;

    // 中文提示词标记（强信号）
    if (/——\s*(prompt|提示词)\s*——/i.test(text)) score += 4;
    if (/^(prompt|提示词)\s*[:：]/im.test(text)) score += 3;
    if (/负面约束|负面提示|negative\s*prompt/i.test(text)) score += 4;
    if (/生成.*(图|画|海报|插画|照片|写真|画面|图像)/i.test(text)) score += 3;
    if (/\d+\s*[×x*]\s*\d+\s*像素/i.test(text)) score += 3;
    if (/\d+:\d+\s*(竖版|横版|比例|画幅)/i.test(text)) score += 2;
    if (/参考.*(图片|图像|上传)/i.test(text)) score += 2;
    if (cnChars > 100 && cnC >= 5) score += 2;

    return score >= 3 && text.length > 50;
  }

  const CAT_KW = {
    '人像':['portrait','face','model','person','woman','man','selfie','headshot','girl','boy',
           '人像','肖像','面部','五官','写真','模特','半身','头像','女性','男性','人物'],
    '风景':['landscape','mountain','sunrise','sunset','valley','horizon','forest','lake',
           '风景','山水','远山','日出','日落','山谷','地平线','自然','草原','沙漠'],
    '建筑':['architecture','building','interior','facade','house','skyscraper',
           '建筑','室内','外观','房屋','园门','庙宇','教堂','城堡','桥梁'],
    '科幻':['sci-fi','space','futuristic','robot','alien','spaceship','galaxy',
           '科幻','太空','未来','机器人','外星人','飞船','银河','星际'],
    '赛博朋克':['cyberpunk','neon','cyber','hologram','dystopian',
               '赛博朋克','霓虹','全息','反乌托邦'],
    '奇幻':['fantasy','dragon','wizard','magic','elf','dungeon','castle','knight',
           '奇幻','龙','法师','魔法','精灵','地下城','骑士','神话'],
    '动物':['animal','dog','cat','lion','wolf','bird','wildlife','fox','tiger',
           '动物','狗','猫','狮子','狼','鸟','野生动物','狐狸','老虎'],
    '静物':['still life','vase','fruit','tabletop',
           '静物','花瓶','水果','桌面'],
    '美食':['food','dish','cuisine','sushi','pizza','coffee','dessert','cake',
           '美食','菜肴','料理','寿司','披萨','咖啡','甜点','蛋糕'],
    '时尚':['fashion','outfit','runway','couture','dress','streetwear',
           '时尚','穿搭','秀场','高定','裙子','街头','服饰','配饰'],
    '角色':['character','concept art','hero','villain','warrior','samurai',
           '角色','概念设计','英雄','反派','战士','武士','原创人物','虚构'],
    '抽象':['abstract','swirl','geometric','pattern','texture','fractal',
           '抽象','几何','图案','纹理','分形'],
    '自然':['forest','flower','tree','ocean','river','leaf','butterfly','waterfall',
           '森林','花','树','海洋','河流','树叶','蝴蝶','瀑布','花卉','植物','玉兰'],
    '城市':['city','urban','skyline','street','cityscape','downtown',
           '城市','都市','天际线','街道','市区','城镇']
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
      'cyberpunk','steampunk','low poly','pixel art',
      // 中文标签
      '东方','国风','古风','水墨','工笔','版画','青绿','瓷白',
      '人像','写真','海报','插画','摄影','电影感','高质感',
      '柔和光照','清晨','低饱和','极简','负面约束',
    ].filter(t => l.includes(t.toLowerCase()));
    return tags.length > 0 ? tags.slice(0, 5) : ['AI生成'];
  }

  function formatAspectRatio(width, height) {
    const ratio = Number(width) / Number(height);
    if (!Number.isFinite(ratio) || ratio <= 0) return '';
    const presets = [[1, 1], [2, 3], [3, 4], [4, 5], [9, 16], [16, 9], [5, 4], [4, 3], [3, 2], [21, 9]];
    const closest = presets.reduce((best, candidate) => {
      const distance = Math.abs(ratio - candidate[0] / candidate[1]);
      return distance < best.distance ? { candidate, distance } : best;
    }, { candidate: null, distance: Infinity });
    if (closest.distance < 0.035) return `${closest.candidate[0]}:${closest.candidate[1]}`;
    return '';
  }

  function extractAspectRatio(text) {
    const match = String(text || '').match(/(?:aspect\s*ratio|--ar|宽高比|画幅|比例)\s*[:：=]?\s*(\d{1,2})\s*[:xX×]\s*(\d{1,2})|\b(\d{1,2})\s*[:xX×]\s*(\d{1,2})\s*(?:vertical|horizontal|portrait|landscape|竖版|横版|比例|画幅)/i);
    const width = Number(match?.[1] || match?.[3]);
    const height = Number(match?.[2] || match?.[4]);
    return formatAspectRatio(width, height) || (width && height ? `${width}:${height}` : '');
  }

  function findImgs(el) {
    const results = [];
    const seen = new Set();
    let aspectRatio = '';
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
      if (!aspectRatio) {
        const rect = img.getBoundingClientRect();
        aspectRatio = formatAspectRatio(img.naturalWidth || img.width || rect.width, img.naturalHeight || img.height || rect.height);
      }
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
    return { images: results, aspectRatio };
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

  function findPostUrl(el) {
    const article = el.closest('article') || el.closest('[data-testid="tweet"]');
    const link = [...(article?.querySelectorAll('a[href*="/status/"]') || [])]
      .map(anchor => anchor.href)
      .find(href => /\/status\/\d+$/.test(href));
    return link || location.href;
  }

  function isCompleteCandidate(text) {
    const value = String(text || '').trim();
    const parserAutoCollectable = globalThis.PromptHubParser?.isAutoCollectablePrompt;
    if (typeof parserAutoCollectable === 'function') return parserAutoCollectable(value);
    const parserComplete = globalThis.PromptHubParser?.isCompletePrompt;
    if (typeof parserComplete === 'function') return parserComplete(value);
    const commas = (value.match(/[,，]/g) || []).length;
    const hasGenerationParams = /\b(--ar|--v|--style|--chaos|--stylize|--niji|seed|cfg|sampler)\b/i.test(value);
    if (value.length < 80 || (value.length < 160 && !(commas >= 3 || hasGenerationParams))) return false;
    return !/(?:[,;:\uFF0C\u3001\uFF1A]|\b(?:and|with|the|a|an|or|of|to|in))$/i.test(value);
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
    const parsed = globalThis.PromptHubParser?.parsePromptText(text, {
      titleCandidates: [extractTitle(text, el)],
      pageTitle: document.title
    });

    if ((isPromptLike(text) || globalThis.PromptHubParser?.looksLikePrompt(parsed?.prompt || '')) && isCompleteCandidate(parsed?.prompt || text)) {
      seen.add(text);
        const imageData = findImgs(el);
        const promptText = parsed?.prompt || text;
      prompts.push({
        id: 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        title: parsed?.title || extractTitle(text, el),
        prompt: promptText,
        category: detectCat(promptText),
        tags: extractTags(promptText),
        image: imageData.images[0] || '',
        images: imageData.images,
        aspectRatio: imageData.aspectRatio || extractAspectRatio(promptText),
        url: findPostUrl(el),
        sourceUrl: findPostUrl(el),
        domain: new URL(findPostUrl(el)).hostname,
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

  let html = `<div class="scan-summary"><div class="scan-badge">检测到 ${prompts.length} 个提示词</div>${prompts.length > 1 ? '<button class="btn btn-collect-all" id="btn-collect-all">❤️ 一键收藏</button>' : ''}</div>`;
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
      btn.disabled = true;
      btn.textContent = '正在收藏…';
      let result;
      try {
        result = await addToQueue(prompts[idx]);
      } catch (error) {
        result = { success: false, error: error?.message || '收藏失败，请稍后重试' };
      }
      if (result?.success) {
        btn.textContent = result.alreadyQueued ? '已在队列' : '已加入队列';
        await updateQueueUI();
        showToast(result.alreadyQueued ? '该提示词已在验证队列中' : `已加入收藏队列，等待 GitHub 主站验证`);
        await waitForCollectionVerification(prompts[idx].id, btn);
        return;
      } else {
        showToast(result?.error || '收藏失败，请稍后重试');
        btn.disabled = false;
        btn.textContent = '❤️ 收藏';
      }
    });
  });

  const collectAllButton = $('#btn-collect-all');
  if (collectAllButton) {
    collectAllButton.addEventListener('click', async () => {
      collectAllButton.disabled = true;
      collectAllButton.textContent = `正在收藏 ${prompts.length} 个`;
      const result = await addItemsToQueue(prompts);
      if (!result.success) {
        collectAllButton.disabled = false;
        collectAllButton.textContent = '❤️ 一键收藏';
        showToast(result.error);
        return;
      }

      const buttonsById = new Map();
      content.querySelectorAll('.mini-btn-collect').forEach(button => {
        const prompt = prompts[Number(button.dataset.idx)];
        if (prompt?.id) buttonsById.set(prompt.id, button);
        button.disabled = true;
        button.textContent = '已加入队列';
      });
      const outcomeById = new Map((result.outcomes || []).map(outcome => [outcome.id, outcome]));
      outcomeById.forEach((outcome, id) => renderInitialBatchOutcome(buttonsById.get(id), outcome));
      await updateQueueUI();
      const skipped = (result.outcomes || []).filter(outcome => ['batch_duplicate', 'rejected'].includes(outcome.outcome)).length;
      const summary = result.added
        ? `已加入 ${result.added} 个收藏，正在验证 GitHub 主站${skipped ? `；${skipped} 条已标注跳过原因` : ''}`
        : '检测到的提示词已在待验证队列中';
      showToast(summary);
      await waitForBatchVerification(result.trackedIds, collectAllButton, buttonsById);
    });
  }
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

    // Expand collapsed social posts before extracting their complete prompt text.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const buttons = [...document.querySelectorAll('button, [role="button"]')];
        buttons
          .filter(button => /^(show more|显示更多|展开)$/i.test((button.textContent || '').trim()))
          .forEach(button => button.click());
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    });

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

$('#btn-notice').addEventListener('click', async () => {
  const feedback = await getCollectionFeedback();
  renderVerificationStatus(feedback, feedback?.queueCount || 0);
  const receipt = feedback?.latest;
  showToast(receipt?.message || (feedback?.queueCount ? `正在验证 ${feedback.queueCount} 个收藏` : '暂无收藏验证记录'));
});

$('#sync-task-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-retry-id]');
  if (!button) return;
  button.disabled = true;
  button.textContent = '排队中';
  const result = await chrome.runtime.sendMessage({ action: 'retryCollectionReceipt', id: button.dataset.retryId });
  showToast(result?.success ? '已重新加入上传队列' : result?.error || '重新排队失败');
  await updateQueueUI();
});

// --- GitHub 主站失败队列的即时重试 ---
$('#btn-sync').addEventListener('click', async () => {
  const btn = $('#btn-sync');
  btn.disabled = true;

  try {
    const queue = await getQueue();
    if (queue.length === 0) {
      showToast('队列为空');
      return;
    }

    btn.textContent = '正在提交 GitHub 主站队列…';
    const syncResult = await chrome.runtime.sendMessage({ action: 'syncToWebsite' });

    if (syncResult?.success) {
      await updateQueueUI();
      const savedCount = Number(syncResult.count || 0);
      const skippedCount = Number(syncResult.skipped || 0);
      const syncMessage = savedCount > 0
        ? `已提交 GitHub 入站队列 ${savedCount} 个，主站合并后会自动确认；可继续收藏新的提示词`
        : skippedCount > 0
          ? `GitHub 主站无新增，${skippedCount} 个提示词已存在`
          : 'GitHub 主站无新增提示词';
      $('#content').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" style="font-size:40px;">✓</div>
          <div class="empty-text" style="font-size:14px;color:#00B894;font-weight:600;">
            ${syncMessage}
          </div>
        </div>
      `;
      return;
    } else {
      const errorMessage = syncResult?.error || 'GitHub 主站队列提交失败';
      showToast(errorMessage);
      $('#content').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" style="font-size:40px;">❌</div>
          <div class="empty-text" style="font-size:14px;color:#e74c3c;font-weight:600;">
            GitHub 主站队列提交失败
          </div>
          <div class="empty-hint" style="margin-top:8px;">
            ${escapeHTML(errorMessage)}<br>收藏已保留在队列中，修复后可再次同步。
          </div>
        </div>
      `;
    }
  } catch (e) {
    showToast('同步失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 重试 GitHub 主站';
  }
});

// --- 初始化 ---
updateQueueUI();

async function updateGitHubTokenUI() {
  const result = await chrome.runtime.sendMessage({ action: 'getGitHubTokenStatus' });
  const input = $('#github-token');
  if (!input) return;
  input.placeholder = result?.configured ? 'GitHub Token 已配置' : 'github_pat_...';
}

$('#btn-save-token').addEventListener('click', async () => {
  const input = $('#github-token');
  const token = input.value.trim();
  if (!token) {
    showToast('请输入 GitHub Token');
    return;
  }
  const result = await chrome.runtime.sendMessage({ action: 'saveGitHubToken', token });
  if (result?.success) {
    input.value = '';
    showToast(result.migratedCount ? `GitHub Token 已保存，已迁移 ${result.migratedCount} 个旧收藏` : 'GitHub Token 已保存');
    updateGitHubTokenUI();
  } else {
    showToast(result?.error || 'Token 保存失败');
  }
});

$('#btn-clear-token').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'clearGitHubToken' });
  $('#github-token').value = '';
  showToast('GitHub Token 已移除');
  updateGitHubTokenUI();
});

$('#btn-migrate-legacy').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ action: 'migrateLegacyCollections' });
  if (result?.success) {
    showToast(result.count ? `已导入 ${result.count} 个旧收藏` : '未找到旧收藏');
  } else {
    showToast(result?.error || '旧收藏导入失败');
  }
});

updateGitHubTokenUI();

// 自动扫描（延迟 200ms 让弹窗先渲染）
setTimeout(() => {
  $('#btn-scan').click();
}, 200);
