const test = require('node:test');
const assert = require('node:assert/strict');
const sync = require('../scripts/sync-public-commerce-sources');

const COMPLETE_PROMPT = 'Create a premium vertical product campaign for a glass perfume bottle on a polished stone pedestal. Preserve the exact bottle silhouette and label, add controlled window light, realistic reflections, soft botanical shadows, a pale neutral background, refined luxury styling, shallow depth of field, crisp material detail, balanced negative space, and no watermark or distorted typography. Image ratio 4:5.';

function gptSource(overrides = {}) {
  return {
    id: 'gpt-commerce',
    enabled: true,
    adapter: 'awesome-gpt-image-2',
    name: 'GPT commerce source',
    dataUrl: 'https://example.com/cases.json',
    license: 'MIT',
    licenseUrl: 'https://example.com/license',
    sourceCategory: 'Products & E-commerce',
    maxItemsPerRun: 20,
    ...overrides
  };
}

function aiartSource(overrides = {}) {
  return {
    id: 'aiart-commerce',
    enabled: true,
    adapter: 'awesome-aiart-pics-prompts',
    name: 'AI Art commerce source',
    dataUrl: 'https://example.com/prompts.md',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    maxItemsPerRun: 20,
    ...overrides
  };
}

function gptPayload(overrides = {}) {
  return JSON.stringify({
    cases: [{
      id: 900,
      title: '薄荷玫瑰香水电商图',
      image: '/images/case900.jpg',
      sourceLabel: '@example',
      sourceUrl: 'https://x.com/example/status/900',
      githubUrl: 'https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md#case-900',
      prompt: COMPLETE_PROMPT,
      category: 'Products & E-commerce',
      styles: ['Realistic'],
      scenes: ['Commerce'],
      ...overrides
    }]
  });
}

function commerceMarkdown({ title = '香水产品广告', prompt = COMPLETE_PROMPT } = {}) {
  return `### [${title}](https://aiart.pics/prompt/perfume-campaign)\n\n**作者**: [@Example](https://x.com/example)\n\n**来源**: [X](https://x.com/example/status/901)\n\n<img src="https://img1.aiart.pics/images/prompts/20260101/perfume-campaign.jpg" width="500" alt="${title}">\n\n\`\`\`\nPrompt: ${prompt}\n\`\`\`\n`;
}

test('imports only complete licensed e-commerce prompt media from approved sources', () => {
  const result = sync.importApprovedCommerceSources({
    sources: [gptSource(), aiartSource()],
    sourceContents: {
      'gpt-commerce': gptPayload(),
      'aiart-commerce': commerceMarkdown({
        title: '护肤精华产品广告',
        prompt: COMPLETE_PROMPT.replace('glass perfume bottle', 'limited-edition skincare serum bottle')
      })
    },
    collections: [],
    now: '2026-08-04T00:00:00.000Z'
  });

  assert.equal(result.accepted.length, 2);
  assert.deepEqual(result.accepted.map(item => item.category), ['电商视觉', '电商视觉']);
  assert.deepEqual(result.accepted.map(item => item.collectionOrigin), ['approved-public-commerce', 'approved-public-commerce']);
  assert.ok(result.accepted.every(item => item.sourceLicenseVerified));
  assert.ok(result.accepted.every(item => item.commerceType));
});

test('rejects sources without a reusable license and globally deduplicates accepted items', () => {
  const invalid = sync.importApprovedCommerceSources({
    sources: [gptSource({ licenseUrl: '' })],
    sourceContents: { 'gpt-commerce': gptPayload() },
    collections: [],
    now: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(invalid.accepted.length, 0);
  assert.match(invalid.rejected[0].reason, /missing source metadata/);

  const duplicate = sync.importApprovedCommerceSources({
    sources: [gptSource()],
    sourceContents: { 'gpt-commerce': gptPayload() },
    collections: [{ id: 'existing', prompt: COMPLETE_PROMPT, sourceUrl: 'https://example.com/old', image: 'https://example.com/old.jpg' }],
    now: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(duplicate.accepted.length, 0);
  assert.ok(duplicate.rejected.some(item => item.reason === 'duplicate prompt'));
});

test('does not import a non-commerce public example', () => {
  const result = sync.importApprovedCommerceSources({
    sources: [aiartSource()],
    sourceContents: {
      'aiart-commerce': commerceMarkdown({ title: '晨光城市人像', prompt: COMPLETE_PROMPT.replace('product campaign for a glass perfume bottle', 'editorial portrait of a woman') })
    },
    collections: [],
    now: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(result.accepted.length, 0);
  assert.ok(result.rejected.some(item => item.reason === 'not an e-commerce prompt'));
});
