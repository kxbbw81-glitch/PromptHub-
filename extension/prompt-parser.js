// Shared PromptHub parser for the website and browser extension.
(function (root, factory) {
  const api = factory();
  root.PromptHubParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_TITLE = '未命名提示词';

  const PROMPT_LABELS = [
    'prompt', 'full prompt', 'complete prompt', 'positive prompt',
    '提示词', '完整提示词', '正向提示词', '正面提示词', '生成提示词'
  ];

  const HARD_STOP_LABELS = [
    'result image', 'reference images', 'reference image', 'images', 'image',
    'model', 'aspect ratio', 'category', 'tags', 'source', 'try', 'copy',
    '结果图', '结果图片', '参考图', '参考图片', '模型', '宽高比', '分类', '标签',
    '来源', '打开来源', '收藏日期', '热度'
  ];

  const NOISE_PATTERNS = [
    /^(result image|reference images?|explore all prompts|copy prompt|copy|try|open source)$/i,
    /^(prompt hub|prompthub|banana prompts)$/i,
    /^(一键复制提示词|复制提示词|删除收藏|编辑内容|收藏|已收藏|打开来源|去生成)$/i,
    /^(分类|宽高比|模型|收藏日期|热度|标签筛选|相关提示词)$/i,
    /^https?:\/\/\S+$/i,
    /^\d+\s*(人喜欢|likes?)$/i,
    /^\d{4}-\d{2}-\d{2}$/
  ];

  const PROMPT_INDICATORS = [
    'prompt', 'negative prompt', 'positive prompt', 'midjourney', 'stable diffusion',
    'dall-e', 'photorealistic', 'cinematic', '8k', '4k', 'ultra detailed',
    'hyperrealistic', 'masterpiece', 'best quality', 'highly detailed',
    'portrait', 'landscape', 'concept art', 'digital art', 'oil painting',
    'watercolor', 'studio lighting', 'golden hour', 'depth of field', 'bokeh',
    'shot on', '35mm', '50mm', '85mm', 'wide angle', 'close up', 'full body',
    '--ar', '--v', '--style', '--chaos', '--stylize', '--niji',
    '提示词', '正向提示', '正面提示', '负面提示', '反向提示', '生成', '构图',
    '光照', '光线', '背景', '前景', '画质', '高清', '写实', '电影感',
    '风格', '质感', '细节', '氛围', '镜头', '焦距', '景深', '参考上传',
    '不要文字', '不要水印', '人物', '服装', '姿态', '环境'
  ];

  function cleanText(value) {
    return String(value || '')
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractImageUrls(text) {
    const matches = cleanText(text).match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp|avif)(?:\?[^\s"'<>]*)?/gi) || [];
    return [...new Set(matches.map(url => url.replace(/[),.;，。]+$/g, '')))];
  }

  function stripImageUrls(text) {
    return cleanText(text)
      .replace(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp|avif)(?:\?[^\s"'<>]*)?/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function splitLines(text) {
    return cleanText(text).split('\n').map(line => line.trim()).filter(Boolean);
  }

  function normalizeLabel(line) {
    return line
      .replace(/^[-_*#\s]+|[-_*#\s]+$/g, '')
      .replace(/[：:]+$/g, '')
      .trim()
      .toLowerCase();
  }

  function isNoiseLine(line) {
    const value = normalizeLabel(line);
    if (!value) return true;
    if (value.length <= 2 && !/[a-z0-9\u4e00-\u9fff]/i.test(value)) return true;
    return NOISE_PATTERNS.some(pattern => pattern.test(value));
  }

  function isPromptLabel(line) {
    return PROMPT_LABELS.includes(normalizeLabel(line)) ||
      /^(prompt|full prompt|complete prompt|positive prompt|提示词|完整提示词|正向提示词|正面提示词)\s*[:：]/i.test(line);
  }

  function isHardStopLine(line) {
    const value = normalizeLabel(line);
    if (PROMPT_LABELS.includes(value) || value === 'negative prompt' || value === '反向提示词' || value === '负面提示词') {
      return false;
    }
    return HARD_STOP_LABELS.includes(value);
  }

  function stripInlineLabel(line) {
    if (PROMPT_LABELS.includes(normalizeLabel(line))) return '';
    return line.replace(/^(prompt|full prompt|complete prompt|positive prompt|提示词|完整提示词|正向提示词|正面提示词)\s*[:：]\s*/i, '').trim();
  }

  function promptScore(text) {
    const value = cleanText(text);
    const lower = value.toLowerCase();
    let score = 0;
    PROMPT_INDICATORS.forEach(indicator => {
      if (lower.includes(indicator.toLowerCase())) score += 1;
    });
    const commaCount = (value.match(/[,，]/g) || []).length;
    const cnChars = (value.match(/[\u4e00-\u9fff]/g) || []).length;
    const wordCount = value.split(/\s+/).filter(Boolean).length + Math.floor(cnChars / 2);
    if (commaCount >= 4) score += 2;
    if (wordCount >= 35) score += 2;
    if (/\b(--ar|--v|--style|--chaos|--stylize|--niji|seed|cfg|sampler)\b/i.test(value)) score += 3;
    if (/(Core Concept|Subject Reference|Environment and Lighting|Composition|Mood and Atmosphere)/i.test(value)) score += 3;
    if (/(参考上传|不生成任何文字|画面|构图|人物|背景|光线)/.test(value) && cnChars > 60) score += 3;
    return score;
  }

  function looksLikePrompt(text) {
    const value = cleanText(text);
    return value.length >= 40 && promptScore(value) >= 3;
  }

  function extractLabeledPrompt(lines) {
    let start = -1;
    let inline = '';
    for (let i = 0; i < lines.length; i++) {
      if (isPromptLabel(lines[i])) {
        start = i;
        inline = stripInlineLabel(lines[i]);
        break;
      }
    }
    if (start === -1) return '';

    const collected = [];
    if (inline && !isNoiseLine(inline)) collected.push(inline);

    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isHardStopLine(line)) break;
      if (isNoiseLine(line)) continue;
      collected.push(line);
    }

    return collected.join('\n\n').trim();
  }

  function isStandaloneTitleLine(line, restText) {
    const value = cleanTitle(line);
    if (value.length < 3 || value.length > 68) return false;
    if (isNoiseLine(value) || isPromptLabel(value)) return false;
    if (titleLooksLikePrompt(value, restText)) return false;
    return promptScore(restText) >= 3 || looksLikePrompt(restText);
  }

  function extractUnlabeledPrompt(lines) {
    let useful = lines.filter(line => !isNoiseLine(line));
    if (!useful.length) return '';

    if (useful.length > 1 && isStandaloneTitleLine(useful[0], useful.slice(1).join('\n'))) {
      useful = useful.slice(1);
    }

    const blocks = [];
    let current = [];
    useful.forEach(line => {
      if (/^(title|标题)\s*[:：]/i.test(line)) return;
      if (line.length <= 64 && current.length && !looksLikePrompt(line)) {
        blocks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.length) blocks.push(current.join('\n'));

    const scored = blocks
      .map(block => ({ block: block.trim(), score: promptScore(block) + Math.min(block.length / 200, 5) }))
      .filter(item => item.block.length >= 20)
      .sort((a, b) => b.score - a.score);

    if (scored[0]?.score >= 3) return scored[0].block;

    const longLines = useful.filter(line => line.length >= 40);
    if (longLines.length) return longLines.join('\n\n');
    return useful.join('\n\n');
  }

  function firstSentenceTitle(prompt) {
    const value = cleanText(prompt);
    const cn = value.match(/[\u4e00-\u9fff][\u4e00-\u9fff，、：:；;（）()《》“”"'\sA-Za-z0-9-]{6,42}/);
    if (cn) return cleanTitle(cn[0]);
    const words = value.replace(/^prompt\s*[:：]\s*/i, '').split(/[\s,，.。;；]+/).filter(Boolean).slice(0, 8);
    while (words.length > 4 && /^(in|of|with|and|or|the|a|an|to|for)$/i.test(words[words.length - 1])) {
      words.pop();
    }
    return cleanTitle(words.join(' '));
  }

  function titleLooksLikePrompt(title, prompt) {
    const t = cleanText(title);
    if (!t) return true;
    if (t.length > 72) return true;
    if (prompt && cleanText(prompt).startsWith(t) && t.length > 36) return true;
    return promptScore(t) >= 4 && t.length > 28;
  }

  function isGenericTitle(title) {
    const value = normalizeLabel(title);
    return !value || [
      'prompt', '提示词', '完整提示词', '未命名提示词', 'untitled', 'image', 'result image',
      'ai生成', 'ai generated', '请手动补充提示词', '（请手动补充提示词）'
    ].includes(value);
  }

  function cleanTitle(title) {
    return cleanText(title)
      .replace(/^(title|标题|prompt title|name|名称)\s*[:：]\s*/i, '')
      .replace(/^#+\s*/, '')
      .replace(/^["'“”‘’]+|["'“”‘’.,，。:：;；]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractTitle(lines, prompt, options) {
    const candidates = [];
    (options.titleCandidates || []).forEach(item => {
      if (item) candidates.push(item);
    });

    for (const line of lines) {
      const labeled = line.match(/^(title|标题|prompt title|name|名称)\s*[:：]\s*(.+)$/i);
      if (labeled?.[2]) candidates.unshift(labeled[2]);
    }

    const promptLabelIndex = lines.findIndex(isPromptLabel);
    const beforePrompt = promptLabelIndex >= 0 ? lines.slice(0, promptLabelIndex) : lines.slice(0, 8);
    beforePrompt.forEach(line => {
      if (!isNoiseLine(line) && !isPromptLabel(line)) candidates.push(line);
    });

    if (options.pageTitle) candidates.push(options.pageTitle.replace(/\s*[-|–—]\s*.*$/, ''));

    for (const candidate of candidates) {
      const cleaned = cleanTitle(candidate);
      if (cleaned.length >= 3 && cleaned.length <= 68 && !isGenericTitle(cleaned) && !titleLooksLikePrompt(cleaned, prompt)) {
        return cleaned.slice(0, 60);
      }
    }

    const generated = firstSentenceTitle(prompt);
    return generated ? generated.slice(0, 60) : DEFAULT_TITLE;
  }

  function parsePromptText(rawText, options) {
    const opts = options || {};
    const text = cleanText(rawText);
    if (!text) return null;

    const imageUrls = extractImageUrls(text);
    const lines = splitLines(stripImageUrls(text));
    const prompt = cleanText(extractLabeledPrompt(lines) || extractUnlabeledPrompt(lines));
    if (!prompt) return null;

    return {
      title: extractTitle(lines, prompt, opts),
      prompt,
      imageUrls,
      confidence: Math.min(100, Math.round(promptScore(prompt) * 12 + Math.min(prompt.length / 20, 30)))
    };
  }

  return {
    DEFAULT_TITLE,
    cleanText,
    extractImageUrls,
    parsePromptText,
    looksLikePrompt,
    isGenericTitle,
    titleLooksLikePrompt
  };
});
