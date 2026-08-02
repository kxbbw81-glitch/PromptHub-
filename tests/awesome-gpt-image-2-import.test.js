const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../scripts/import-awesome-gpt-image-2.js');

const COMPLETE_PROMPT = 'Create a premium vertical product campaign for a glass perfume bottle on a polished stone pedestal. Preserve the exact bottle silhouette and label, add controlled window light, realistic reflections, soft botanical shadows, a pale neutral background, refined luxury styling, shallow depth of field, crisp material detail, balanced negative space, and no watermark or distorted typography. Image ratio 4:5.';

function sourceCase(overrides = {}) {
  return {
    id: 519,
    title: '薄荷玫瑰香水电商图',
    image: '/images/case519.jpg',
    sourceLabel: '@example',
    sourceUrl: 'https://x.com/example/status/519',
    githubUrl: 'https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md#case-519',
    prompt: COMPLETE_PROMPT,
    category: 'Products & E-commerce',
    styles: ['Realistic'],
    scenes: ['Commerce'],
    ...overrides
  };
}

test('imports a complete gallery case with stable image provenance', () => {
  const result = importer.importCases({ cases: [sourceCase()] }, [], '2026-08-02T09:00:00.000Z');
  const item = result.accepted[0];

  assert.equal(result.accepted.length, 1);
  assert.equal(item.id, 'awesome_gpt_image_2_case_519');
  assert.equal(item.category, '电商视觉');
  assert.equal(item.commerceType, '广告海报');
  assert.equal(item.aspectRatio, '4:5');
  assert.equal(item.model, 'GPT Image 2');
  assert.match(item.image, /raw\.githubusercontent\.com\/freestylefly\/awesome-gpt-image-2\/main\/data\/images\/case519\.jpg$/);
  assert.match(item.sourceUrl, /github\.com\/freestylefly\/awesome-gpt-image-2\/blob\/main\/data\/images\/case519\.jpg$/);
  assert.equal(item.originalSourceUrl, 'https://x.com/example/status/519');
  assert.equal(item.license, 'MIT');
  assert.equal(item.domesticSyncedAt, null);
});

test('rejects short prompts and normalized prompt duplicates', () => {
  const short = sourceCase({ id: 1, prompt: 'too short' });
  const existing = { prompt: COMPLETE_PROMPT, sourceUrl: 'https://example.com/existing' };
  const result = importer.importCases({ cases: [short, sourceCase()] }, [existing]);

  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected.map(item => item.reason), [
    'prompt shorter than 160 characters',
    'duplicate prompt'
  ]);
});

test('keeps deterministic titles within twenty characters', () => {
  const title = importer.normalizeTitle(sourceCase({
    id: 389,
    title: 'Transparent Labs Hydrate 健身补剂 Campaign'
  }), COMPLETE_PROMPT);

  assert.equal(title, '健身补剂品牌广告');
  assert.ok([...title].length <= 20);
});

test('maps source categories into PromptHub categories and searchable tags', () => {
  assert.equal(importer.mapCategory(sourceCase({ category: 'Architecture & Spaces' }), ['建筑空间']), '建筑');
  assert.equal(importer.mapCategory(sourceCase({ category: 'Characters & People', prompt: 'stylized character sheet' }), ['角色人物']), '角色');
  assert.ok(importer.buildTags(sourceCase()).includes('电商视觉'));
});
