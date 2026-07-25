// ==========================================
// PromptHub Extension - Content Script
// Injected into all webpages to detect & collect AI prompts
// ==========================================

(function () {
  'use strict';

  // Avoid double-injection
  if (window.__prompthub_injected__) return;
  window.__prompthub_injected__ = true;

  const STORAGE_KEY = 'prompthub_ext_queue';

  // --- Heuristic: detect if text looks like an AI image prompt ---
  function isPromptLike(text) {
    const t = text.toLowerCase();
    const indicators = [
      'photorealistic', 'cinematic', '8k', 'ultra detailed', 'hyperrealistic',
      'digital art', 'oil painting', 'watercolor', 'concept art',
      'portrait of', 'landscape of', 'shot on', 'dslr', 'bokeh',
      'depth of field', 'studio lighting', 'golden hour', 'volumetric',
      'render', 'octane', 'unreal engine', 'blender', 'midjourney',
      'stable diffusion', 'dalle', 'prompt', 'negative prompt',
      'aspect ratio', 'ar ', 'style of', 'in the style of',
      'masterpiece', 'best quality', 'highly detailed', 'intricate',
      'soft lighting', 'dramatic lighting', 'natural lighting',
      'close up', 'wide angle', 'full body', 'upper body',
      'f/1.4', 'f/2.8', '85mm', '50mm', '35mm', '100mm',
      'canon', 'nikon', 'sony', 'leica', 'hasselblad'
    ];
    let score = 0;
    for (const ind of indicators) {
      if (t.includes(ind)) score++;
    }
    // Also check for long English text with commas (typical prompt structure)
    const wordCount = text.split(/\s+/).length;
    const commaCount = (text.match(/,/g) || []).length;
    if (wordCount > 15 && commaCount >= 3) score += 2;
    if (wordCount > 30) score += 1;
    return score >= 3 && text.length > 60;
  }

  // --- Extract prompts from page ---
  function extractPrompts() {
    const prompts = [];
    const seen = new Set();

    // 1. Check all paragraphs and divs for prompt-like text
    const selectors = 'p, div, span, li, td, pre, code, blockquote, article section, [class*="content"], [class*="text"], [class*="post"], [class*="tweet"], [class*="message"]';
    const elements = document.querySelectorAll(selectors);

    for (const el of elements) {
      const text = el.textContent.trim();
      if (text.length < 60 || text.length > 2000) continue;
      if (seen.has(text)) continue;

      if (isPromptLike(text)) {
        seen.add(text);

        // Try to find nearby image
        let imgUrl = '';
        // Check siblings
        let sibling = el.previousElementSibling;
        for (let i = 0; i < 3 && sibling; i++) {
          const img = sibling.querySelector('img');
          if (img && img.src && !img.src.includes('avatar') && !img.src.includes('icon')) {
            imgUrl = img.src;
            break;
          }
          sibling = sibling.previousElementSibling;
        }
        // Check parent
        if (!imgUrl) {
          const parentImg = el.parentElement?.querySelector('img');
          if (parentImg && parentImg.src) imgUrl = parentImg.src;
        }
        // Check next siblings
        if (!imgUrl) {
          let ns = el.nextElementSibling;
          for (let i = 0; i < 3 && ns; i++) {
            const img = ns.querySelector('img');
            if (img && img.src) { imgUrl = img.src; break; }
            ns = ns.nextElementSibling;
          }
        }

        // Try to find title from nearby headings or first short text
        let title = '';
        const prevH = el.previousElementSibling;
        if (prevH && /^H[1-4]$/i.test(prevH.tagName)) {
          title = prevH.textContent.trim().slice(0, 50);
        }
        if (!title) {
          // Try first short line of the prompt
          const firstLine = text.split('\n')[0].trim();
          if (firstLine.length < 60) title = firstLine;
        }
        if (!title) {
          title = text.split(/[.!?。！？]/)[0].trim().slice(0, 50);
        }
        if (!title) title = '未命名提示词';

        // Detect category
        const catKeywords = {
          'Portrait': ['portrait', 'face', 'model', 'person', 'woman', 'man'],
          'Landscape': ['landscape', 'mountain', 'sunrise', 'sunset'],
          'Architecture': ['architecture', 'building', 'interior'],
          'Sci-Fi': ['sci-fi', 'space', 'futuristic', 'robot'],
          'Cyberpunk': ['cyberpunk', 'neon', 'cyber'],
          'Fantasy': ['fantasy', 'dragon', 'wizard', 'magic'],
          'Animals': ['animal', 'dog', 'cat', 'lion', 'wolf'],
          'Food': ['food', 'dish', 'cuisine', 'sushi'],
          'Fashion': ['fashion', 'outfit', 'runway', 'dress'],
          'Character': ['character', 'concept art', 'hero'],
          'Abstract': ['abstract', 'swirl', 'geometric'],
          'Nature': ['forest', 'flower', 'tree', 'ocean'],
          'Cityscape': ['city', 'urban', 'skyline', 'street']
        };
        let category = 'Abstract';
        let maxScore = 0;
        const lower = text.toLowerCase();
        for (const [cat, kws] of Object.entries(catKeywords)) {
          const s = kws.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
          if (s > maxScore) { maxScore = s; category = cat; }
        }

        prompts.push({
          title,
          prompt: text,
          category,
          tags: [],
          image: imgUrl,
          url: location.href,
          domain: location.hostname,
          timestamp: Date.now()
        });
      }
    }

    // 2. Check for common prompt containers on specific sites
    // Midjourney / Discord-like
    document.querySelectorAll('[class*="prompt"], [data-testid*="prompt"]').forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 30 && !seen.has(text)) {
        seen.add(text);
        prompts.push({
          title: text.slice(0, 50),
          prompt: text,
          category: 'Abstract',
          tags: [],
          image: '',
          url: location.href,
          domain: location.hostname,
          timestamp: Date.now()
        });
      }
    });

    return prompts;
  }

  // --- Show floating collect buttons on detected prompts ---
  function showCollectButtons() {
    // Remove existing buttons
    document.querySelectorAll('.prompthub-float-btn').forEach(b => b.remove());

    const prompts = extractPrompts();
    if (prompts.length === 0) return;

    prompts.forEach((p, idx) => {
      // Find the element containing this prompt
      const elements = Array.from(document.querySelectorAll('p, div, span, pre'));
      const el = elements.find(e => e.textContent.trim() === p.prompt);
      if (!el) return;

      const btn = document.createElement('button');
      btn.className = 'prompthub-float-btn';
      btn.innerHTML = '🍌 收藏';
      btn.title = '收藏到 PromptHub';
      btn.style.cssText = `
        position: absolute;
        z-index: 999999;
        background: #FFD93D;
        color: #1A1A1A;
        border: none;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        transition: all 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.05)'; btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; });
      btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveToQueue(p);
        btn.innerHTML = '✓ 已收藏';
        btn.style.background = '#00B894';
        btn.style.color = '#fff';
        setTimeout(() => btn.remove(), 1500);
      });

      // Position button at top-right of the element
      const rect = el.getBoundingClientRect();
      btn.style.position = 'fixed';
      btn.style.top = (rect.top + window.scrollY + 4) + 'px';
      btn.style.left = (rect.right + window.scrollX - 80) + 'px';
      document.body.appendChild(btn);
    });
  }

  function saveToQueue(item) {
    const queue = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    // Avoid duplicates by prompt text
    if (!queue.some(q => q.prompt === item.prompt)) {
      queue.push(item);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
  }

  // --- Listen for messages from popup/background ---
  chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'scan') {
      const prompts = extractPrompts();
      sendResponse({ prompts, url: location.href, title: document.title });
    } else if (request.action === 'collect') {
      saveToQueue(request.data);
      sendResponse({ success: true });
    } else if (request.action === 'showButtons') {
      showCollectButtons();
      sendResponse({ success: true });
    } else if (request.action === 'extensionImport') {
      // Background sends collected prompts from extension to website
      // Write to localStorage so the website app can pick them up
      try {
        const existing = JSON.parse(localStorage.getItem('prompthub_ext_import') || '[]');
        const merged = [...existing, ...(request.data || [])];
        // Deduplicate by prompt text
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
    }
    return true;
  });

  // Auto-scan after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(showCollectButtons, 1500));
  } else {
    setTimeout(showCollectButtons, 1500);
  }

  // Also re-scan on scroll (for lazy-loaded content)
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(showCollectButtons, 500);
  }, { passive: true });
})();
