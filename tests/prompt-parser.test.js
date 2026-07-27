const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const parser = require('../extension/prompt-parser.js');

test('extracts explicit title, prompt block, and image URLs from pasted content', () => {
  const raw = `
标题：优雅家居时尚人像
Result Image
https://cdn.example.com/result.webp

Prompt
Using the uploaded real female subject as the visual reference, generate a magazine-quality fashion indoor portrait.
Soft natural daylight, minimalist living room, black ribbed knit dress, 35mm lens, shallow depth of field, high-end editorial photography.

模型
Nano Banana
`;

  const parsed = parser.parsePromptText(raw);

  assert.equal(parsed.title, '优雅家居时尚人像');
  assert.match(parsed.prompt, /magazine-quality fashion indoor portrait/);
  assert.doesNotMatch(parsed.prompt, /Result Image|模型|Nano Banana/);
  assert.deepEqual(parsed.imageUrls, ['https://cdn.example.com/result.webp']);
});

test('keeps Banana-style Chinese prompt text without UI labels', () => {
  const raw = `
她在织机前系好最后一段青缎，深色木线把人物和远山分成两层。
像 Banana Prompts 一样，把图片参考、结构化提示词、模型参数和下一步动作放在同一个任务页面里。
📋 一键复制提示词
🗑 删除收藏

分类
人像

完整提示词
参考上传的两张图片，仅借鉴其蓝白瓷器、青绿版画的风格与构图关系，不复制参考人物身份。
生成一张 4:5 竖版、1122×1402 像素的独立当代东方女性写真海报。人物位于右侧，左侧留出大面积宣纸白。
不生成任何文字或水印。

参考图片
https://cdn.example.com/ref.webp
`;

  const parsed = parser.parsePromptText(raw);

  assert.equal(parsed.title, '她在织机前系好最后一段青缎，深色木线把人物和远山分成两层');
  assert.match(parsed.prompt, /^参考上传的两张图片/);
  assert.match(parsed.prompt, /不生成任何文字或水印/);
  assert.doesNotMatch(parsed.prompt, /一键复制|分类|参考图片/);
});

test('generates a compact title when the first line is the prompt body', () => {
  const raw = 'A cinematic portrait of an astronaut sitting in a quiet greenhouse, soft morning light, 50mm lens, photorealistic, ultra detailed, gentle color grading, no text, no watermark.';
  const parsed = parser.parsePromptText(raw);

  assert.equal(parsed.title, 'A cinematic portrait of an astronaut sitting');
  assert.equal(parsed.prompt, raw);
});

test('separates an unlabeled heading from the prompt body', () => {
  const raw = `
月光下的玻璃花房
A cinematic night portrait inside a glass greenhouse, moonlight through wet windows, silver flowers, elegant woman in a white silk dress, 50mm lens, shallow depth of field, photorealistic, ultra detailed, no text, no watermark.
`;
  const parsed = parser.parsePromptText(raw);

  assert.equal(parsed.title, '月光下的玻璃花房');
  assert.match(parsed.prompt, /^A cinematic night portrait/);
  assert.doesNotMatch(parsed.prompt, /月光下的玻璃花房/);
});

test('Cloudflare sync is scheduled 30 minutes after GitHub Pages sync', () => {
  const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');

  assert.match(background, /const CF_SYNC_DELAY_MINUTES = 30;/);
  assert.match(background, /delayInMinutes: CF_SYNC_DELAY_MINUTES/);
  assert.match(background, /const WEBSITE_URL = GITHUB_PAGES_URL;/);
});
