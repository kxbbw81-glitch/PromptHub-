const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../scripts/import-ahaprompt.js');

const COMPLETE_PROMPT = 'Concept: Seoul Summer, 1998 - Rainy Bus Stop\n\nPrompt:\n\nCreate an authentic 15-second archival home video that appears to have been recorded in Seoul, South Korea, during the summer of 1998 using a consumer Hi8 or VHS-C camcorder. The footage should faithfully recreate genuine late-1990s analogue camcorder characteristics, soft 480i resolution, subtle VHS tape grain, faint interlacing, handheld shake, realistic motion blur, rain-soaked streets, old buses, handwritten Hangul shop signs, and natural commuter behavior. Avoid modern digital sharpness, HDR, warped limbs, duplicated pedestrians, floating objects, and anything suggesting AI generation.';

function flight(text) {
  return `<script>self.__next_f.push([1,"${JSON.stringify(text).slice(1, -1)}"])</script>`;
}

function pageHtml({ title = 'Seoul Summer 1998: Rainy Bus Stop', prompt = COMPLETE_PROMPT, type = 'VideoObject', restricted = false } = {}) {
  const name = restricted ? 'Tournament of Power with Famous Anime Characters' : title;
  const contentUrl = type === 'VideoObject'
    ? 'https://cdn.ahaprompt.app/prompt-images/example.mp4'
    : 'https://cdn.ahaprompt.app/prompt-images/example.jpg';
  const thumbnailUrl = 'https://cdn.ahaprompt.app/prompt-images/example-cover.jpg';
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': type,
    name,
    description: prompt.slice(0, 160),
    url: 'https://ahaprompt.app/prompt/seoul-summer-1998-rainy-bus-stop',
    contentUrl,
    thumbnailUrl,
    width: 1280,
    height: 720,
    duration: 'PT15S',
    uploadDate: '2026-07-31T05:45:13.260Z',
    about: { '@type': 'SoftwareApplication', name: 'MiniMax H3' },
    keywords: 'MiniMax H3 prompt, AI video prompt, Vintage, Cityscape, Realistic'
  }];
  return [
    '<html><head>',
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    '</head><body>',
    flight('1:"$Sreact.fragment"\n2:I["/_next/static/chunks/app.js","default"]'),
    flight(prompt),
    '<a href="https://x.com/example/status/2082747126497300930">Source</a>',
    '</body></html>'
  ].join('');
}

test('extracts only English prompt detail URLs from sitemap', () => {
  const sitemap = [
    '<loc>https://ahaprompt.app/prompt/seoul-summer-1998-rainy-bus-stop</loc>',
    '<loc>https://ahaprompt.app/zh/prompt/seoul-summer-1998-rainy-bus-stop</loc>',
    '<loc>https://ahaprompt.app/prompts/videos</loc>'
  ].join('');

  assert.deepEqual(importer.extractPromptUrls(sitemap), [
    'https://ahaprompt.app/prompt/seoul-summer-1998-rainy-bus-stop'
  ]);
});

test('imports a complete public AhaPrompt video prompt from visible detail HTML', () => {
  const url = 'https://ahaprompt.app/prompt/seoul-summer-1998-rainy-bus-stop';
  const result = importer.importPages([{ url, html: pageHtml() }], [], '2026-08-04T09:00:00.000Z');
  const item = result.accepted[0];

  assert.equal(result.accepted.length, 1);
  assert.equal(item.id, 'ahaprompt_seoul-summer-1998-rainy-bus-stop');
  assert.equal(item.title, 'Seoul Summer 1998: Rainy Bus Stop');
  assert.equal(item.source, 'AhaPrompt');
  assert.equal(item.license, 'AhaPrompt Community Terms');
  assert.equal(item.mediaType, 'video');
  assert.equal(item.category, '视频提示词');
  assert.equal(item.model, 'MiniMax H3');
  assert.equal(item.videoUrl, 'https://cdn.ahaprompt.app/prompt-images/example.mp4');
  assert.equal(item.image, 'https://cdn.ahaprompt.app/prompt-images/example-cover.jpg');
  assert.equal(item.originalSourceUrl, 'https://x.com/example/status/2082747126497300930');
  assert.equal(item.aspectRatio, '16:9');
  assert.match(item.prompt, /consumer Hi8/);
});

test('rejects incomplete prompts, restricted IP, and duplicates', () => {
  const url = 'https://ahaprompt.app/prompt/seoul-summer-1998-rainy-bus-stop';
  const incomplete = importer.importPages([{ url, html: pageHtml({ prompt: 'short prompt' }) }], []);
  assert.equal(incomplete.accepted.length, 0);
  assert.equal(incomplete.rejected[0].reason, 'incomplete prompt');

  const restricted = importer.importPages([{ url, html: pageHtml({ restricted: true }) }], []);
  assert.equal(restricted.accepted.length, 0);
  assert.equal(restricted.rejected[0].reason, 'restricted third-party IP');

  const duplicate = importer.importPages([{ url, html: pageHtml() }], [{ id: 'old', sourceUrl: url, prompt: COMPLETE_PROMPT }]);
  assert.equal(duplicate.accepted.length, 0);
  assert.ok(duplicate.rejected.some(item => item.reason === 'duplicate prompt'));
});
