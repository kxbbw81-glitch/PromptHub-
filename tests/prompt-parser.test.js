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

  assert.equal(parsed.title, '她在织机前系好最后一段青缎');
  assert.ok([...parsed.title].length <= 20);
  assert.match(parsed.prompt, /^参考上传的两张图片/);
  assert.match(parsed.prompt, /不生成任何文字或水印/);
  assert.doesNotMatch(parsed.prompt, /一键复制|分类|参考图片/);
});

test('extracts a complete prompt copied from a WeChat article', () => {
  const raw = `
雾林红伞电影人像
微信公众号文章

完整提示词
创作一张雨后雾林中的电影感女性人像。成年东亚女性站在湿润的石阶上，手持一把暗红色长柄雨伞，人物身穿深灰羊毛长外套与黑色长裙，微微侧身回望镜头。背景是被薄雾包裹的松树林，雨水在石阶与树叶上形成细小反光，清晨冷灰色自然光从树冠间落下，红伞成为画面唯一的暖色焦点。使用85mm人像镜头，浅景深，真实皮肤纹理，柔和胶片颗粒，低饱和电影调色，细节清晰，不要文字，不要水印，不要额外肢体。

参考图片
https://mmbiz.qpic.cn/mmbiz_jpg/example/0?wx_fmt=jpeg
`;

  const parsed = parser.parsePromptText(raw);

  assert.equal(parsed.title, '雾林红伞电影人像');
  assert.match(parsed.prompt, /^创作一张雨后雾林中的电影感女性人像/);
  assert.doesNotMatch(parsed.prompt, /微信公众号文章|参考图片/);
  // Pasted WeChat article text should keep its prompt clean. The extension reads
  // the article page's lazy-loaded image nodes separately from this text parser.
  assert.deepEqual(parsed.imageUrls, []);
});

test('generates a compact title when the first line is the prompt body', () => {
  const raw = 'A cinematic portrait of an astronaut sitting in a quiet greenhouse, soft morning light, 50mm lens, photorealistic, ultra detailed, gentle color grading, no text, no watermark.';
  const parsed = parser.parsePromptText(raw);

  assert.equal(parsed.title, '温室晨光电影感宇航员肖像');
  assert.ok([...parsed.title].length <= 20);
  assert.equal(parsed.prompt, raw);
});

test('accepts a short but strongly structured image prompt', () => {
  const prompt = 'Cinematic perfume bottle on black stone, soft side lighting, clean reflection, 85mm lens, shallow depth of field, photorealistic, no text, no watermark.';

  assert.ok(prompt.length < 160);
  assert.equal(parser.isCompletePrompt(prompt), true);
  assert.equal(parser.isCompletePrompt('Cinematic perfume bottle, soft light,'), false);
});

test('replaces social platform titles with a content-specific prompt summary', () => {
  const raw = `
GPT Image 2 on ChatGPT

Prompt
A beautiful Japanese woman with blunt bangs leans slightly toward the camera indoors against a warm beige wall, soft natural light, 85mm portrait lens, realistic skin texture, editorial photography, low saturation, subtle film grain, no text, no watermark.
`;
  const parsed = parser.parsePromptText(raw, { titleCandidates: ['GPT Image 2 on ChatGPT'] });

  assert.equal(parsed.title, '暖白摄影棚编辑写真女性人像');
  assert.ok([...parsed.title].length <= 20);
});

test('extracts concrete scene and subject keywords for Chinese portrait prompts', () => {
  const prompt = '一位20多岁的年轻成年东亚女性站在纯黑色摄影棚背景前，画面从头顶拍至胯部上方，人物位于中央略偏右，身体微微侧向画面左侧，带高级美容广告与电影肖像感。她拥有精致鹅蛋脸、杏仁形深棕眼睛、自然细眉、低饱和裸粉色嘴唇。妆容极淡，真实皮肤纹理，深黑色超长直发自然披散，乳白色丝质上衣，85mm 人像镜头，柔和轮廓光，不要文字和水印。';

  assert.equal(parser.normalizeAutoTitle('东方人像', prompt), '黑色摄影棚美容广告');
  assert.ok([...parser.normalizeAutoTitle('', prompt)].length <= 20);
});

test('extracts e-commerce and video-specific titles instead of broad categories', () => {
  const livery = 'Transform the uploaded logo into the defining visual identity of a high-performance Formula 1-style race car. Preserve the logo shape and brand colors while integrating it into the complete livery, aerodynamic surfaces, body graphics, halo details, wheel covers, sidepods, front wing, rear wing, cockpit area, and motorsport sponsor layout. Ultra-realistic studio render, no text outside the provided logo, no watermark.';
  const skincare = 'Create an 8-second ultra-realistic luxury skincare commercial video. A cosmetic cream jar sits on a glossy marble pedestal, soft studio light sweeps across translucent gel texture, water droplets, pearl reflections, slow camera push-in, premium beauty campaign mood, clean beige background, shallow depth of field, no text, no watermark.';

  assert.equal(parser.normalizeAutoTitle('品牌视觉', livery), '赛车品牌涂装');
  assert.equal(parser.normalizeAutoTitle('产品广告', skincare), '护肤品商业短片');
});

test('prefers concrete prompt cues over a broad editorial portrait fallback', () => {
  const prompt = 'A Korean woman takes a selfie with the front phone camera. She has long milk tea gray hair, soft daylight, realistic skin texture, quiet apartment background, editorial photography, no text, no watermark.';

  assert.equal(parser.normalizeAutoTitle('时尚人像', prompt), '韩系奶茶灰自拍');
  assert.ok([...parser.normalizeAutoTitle('', prompt)].length <= 20);
});

test('summarizes Chinese prompts with their dominant scene instead of a broad portrait label', () => {
  const windowPrompt = '一张明亮、柔和、照片级真实的日系室内生活人像。一位年轻东亚女性侧坐在靠窗的大理石窗台上，低头安静阅读手中的薄杂志。强烈但柔化的自然窗光从左侧和后方进入，50mm镜头，低饱和、安静私密的生活氛围。';
  const gardenPrompt = '一张明亮清新的照片级真实花园人像摄影。一位年轻东亚女性置身于盛开的白色蔷薇与绿色枝叶之间，阳光照亮头发、脸颊、花瓣与叶缘，85mm人像镜头，春日清晨、浪漫、自然的氛围。';

  assert.equal(parser.normalizeAutoTitle('编辑写真女性人像', windowPrompt), '窗台阅读女性人像');
  assert.equal(parser.normalizeAutoTitle('东方人像', gardenPrompt), '蔷薇花园女性人像');
});

test('does not mistake ordinary fashion outfit prompts for try-on posters', () => {
  const prompt = 'A beautiful young East Asian woman with fair skin and reddish-brown hair tied in a loose half-up ponytail, looking back over her shoulder at the camera. She is crouching low on a light wooden floor in a modern office, body twisted to the side, one arm resting on a light desk. She wears a fitted white blouse and tailored black skirt outfit, glossy red lips, cinematic office lighting, realistic skin texture, shallow depth of field, no text, no watermark.';

  assert.equal(parser.normalizeAutoTitle('品牌视觉', prompt), '现代办公室电影感女性人像');
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

test('removes social-post platform labels before the real prompt', () => {
  const raw = 'GPT Image 2 on ChatGPT 提示 一位年轻成年东亚女性站在纯净暖白色摄影棚背景前，柔和自然光，85mm 人像镜头，真实皮肤纹理，低饱和电影感，禁止文字和水印。';
  const parsed = parser.parsePromptText(raw);

  assert.match(parsed.prompt, /^一位年轻成年东亚女性/);
  assert.doesNotMatch(parsed.prompt, /^GPT Image 2 on ChatGPT/);
});

test('domestic release is handled by the GitHub workflow after the GitHub write', () => {
  const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/release-domestic-collections.yml'), 'utf8');

  assert.match(background, /const GITHUB_COLLECTIONS_API = 'https:\/\/api\.github\.com\/repos\/kxbbw81-glitch\/PromptHub-\/contents\/data\/collections\.json';/);
  assert.doesNotMatch(background, /scheduleDomesticRelease|releaseDomesticCollections|CF_SYNC_DELAY_MINUTES/);
  assert.match(workflow, /node scripts\/release-domestic-collections\.js/);
});
