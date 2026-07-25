// ==========================================
// PromptHub Extension - Popup Script
// ==========================================

const STORAGE_KEY = 'prompthub_ext_queue';
const WEBSITE_URL = 'http://localhost:8080'; // Change to your deployed URL

let currentPrompts = [];

function $(sel) { return document.querySelector(sel); }

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  updateQueueInfo();
}

function addToQueue(item) {
  const queue = getQueue();
  if (!queue.some(q => q.prompt === item.prompt)) {
    queue.push(item);
    saveQueue(queue);
    return true;
  }
  return false;
}

function updateQueueInfo() {
  const queue = getQueue();
  const info = $('#queue-info');
  const bar = $('#queue-bar');
  if (queue.length > 0) {
    info.textContent = `待同步: ${queue.length} 个提示词`;
    bar.style.display = 'block';
  } else {
    bar.style.display = 'none';
  }
}

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

function renderPrompts(prompts) {
  currentPrompts = prompts;
  const content = $('#content');

  if (!prompts || prompts.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">当前页面未检测到 AI 提示词</div>
        <div class="empty-text" style="margin-top:4px;font-size:11px;">试试刷新页面或在提示词页面扫描</div>
      </div>
    `;
    return;
  }

  content.innerHTML = '';
  prompts.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'prompt-item';
    item.innerHTML = `
      <div class="prompt-item-title">${p.title || '未命名提示词'}</div>
      <div class="prompt-item-text">${p.prompt}</div>
      <div class="prompt-item-meta">
        <span class="prompt-item-cat">${p.category || '未知'}</span>
        <div class="prompt-item-actions">
          <button class="mini-btn mini-btn-copy" data-idx="${idx}">📋</button>
          <button class="mini-btn mini-btn-collect" data-idx="${idx}">❤️</button>
        </div>
      </div>
    `;

    // Copy
    item.querySelector('.mini-btn-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(p.prompt);
    });

    // Collect
    item.querySelector('.mini-btn-collect').addEventListener('click', (e) => {
      e.stopPropagation();
      if (addToQueue(p)) {
        showToast('已加入待同步队列');
        e.target.textContent = '✓';
        e.target.style.background = '#00B894';
        e.target.style.color = '#fff';
      } else {
        showToast('已在队列中');
      }
    });

    // Click to expand
    item.addEventListener('click', () => {
      chrome.tabs.create({ url: WEBSITE_URL + '/#/import' });
    });

    content.appendChild(item);
  });
}

// --- Scan current page ---
$('#btn-scan').addEventListener('click', async () => {
  $('#content').innerHTML = '<div class="status">🔍 正在扫描...</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      $('#content').innerHTML = '<div class="status">无法获取当前页面</div>';
      return;
    }

    // Inject content script if needed, then send message
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Run extraction inline in case content script isn't loaded yet
          function isPromptLike(text) {
            const t = text.toLowerCase();
            const indicators = ['photorealistic','cinematic','8k','ultra detailed','digital art','portrait of','shot on','bokeh','depth of field','studio lighting','render','octane','masterpiece','best quality','highly detailed'];
            let score = 0;
            for (const ind of indicators) if (t.includes(ind)) score++;
            const wordCount = text.split(/\s+/).length;
            const commaCount = (text.match(/,/g)||[]).length;
            if (wordCount > 15 && commaCount >= 3) score += 2;
            return score >= 3 && text.length > 60;
          }
          const prompts = [];
          const seen = new Set();
          document.querySelectorAll('p, div, span, pre').forEach(el => {
            const text = el.textContent.trim();
            if (text.length < 60 || text.length > 2000 || seen.has(text)) return;
            if (isPromptLike(text)) {
              seen.add(text);
              let title = text.split(/[.!?。！？\n]/)[0].trim().slice(0, 50);
              if (!title) title = '未命名提示词';
              let imgUrl = '';
              let sibling = el.previousElementSibling;
              for (let i=0; i<3 && sibling; i++) {
                const img = sibling.querySelector('img');
                if (img && img.src) { imgUrl = img.src; break; }
                sibling = sibling.previousElementSibling;
              }
              prompts.push({ title, prompt: text, category: 'Abstract', tags: [], image: imgUrl, url: location.href, domain: location.hostname });
            }
          });
          return prompts;
        }
      });

      const prompts = results[0]?.result || [];
      renderPrompts(prompts);
    } catch (err) {
      // Fallback: try messaging existing content script
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'scan' }, (response) => {
          if (chrome.runtime.lastError) {
            $('#content').innerHTML = '<div class="status">⚠️ 当前页面无法访问，请确保不是浏览器内置页面</div>';
            return;
          }
          renderPrompts(response?.prompts || []);
        });
      } catch {
        $('#content').innerHTML = '<div class="status">扫描失败，请刷新页面后重试</div>';
      }
    }
  } catch (err) {
    $('#content').innerHTML = '<div class="status">扫描出错: ' + err.message + '</div>';
  }
});

// --- Open website ---
$('#btn-open').addEventListener('click', () => {
  chrome.tabs.create({ url: WEBSITE_URL });
});

// --- Sync queue to website ---
$('#btn-sync')?.addEventListener('click', async () => {
  const queue = getQueue();
  if (queue.length === 0) {
    showToast('队列为空');
    return;
  }

  try {
    // Store in chrome.storage.local so background.js can bridge it
    await chrome.storage.local.set({ 'prompthub_sync_queue': queue });

    // Also try to send directly to any open PromptHub tab
    const tabs = await chrome.tabs.query({ url: '*://localhost*/*' });
    if (tabs.length > 0) {
      // Website is open — send data directly
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'extensionImport', data: queue });
        } catch (e) { /* tab might not have content script */ }
      }
      showToast(`已同步 ${queue.length} 个提示词到网站！`);
      // Clear queue
      localStorage.removeItem(STORAGE_KEY);
      updateQueueInfo();
      // Switch to the website tab
      chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      // Website not open — open it, background.js will sync via storage change
      chrome.tabs.create({ url: WEBSITE_URL + '/#/collections' });
      showToast('正在打开网站并同步...');
      // Clear queue after a delay
      setTimeout(() => {
        localStorage.removeItem(STORAGE_KEY);
        updateQueueInfo();
      }, 2000);
    }
  } catch (e) {
    showToast('同步失败: ' + e.message);
  }
});

// Init
updateQueueInfo();

// Auto-scan on popup open
setTimeout(() => $('#btn-scan').click(), 100);
