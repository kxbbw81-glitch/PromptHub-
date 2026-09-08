const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeExtensionInbox,
  sanitizeInboxItem,
  promptFingerprint,
  collectionSourceKey
} = require('../scripts/merge-extension-inbox');

const PROMPT_BASE = 'A premium e-commerce product shot and product hero photograph of a translucent amber perfume bottle placed on polished black stone, soft side lighting, precise rim highlights, controlled glass reflections, subtle atmospheric haze, shallow depth of field, 85mm lens, luxury catalog composition, realistic material texture, clean background, no text, no logo, no watermark.';

function inboxItem(id, overrides = {}) {
  return {
    id,
    title: `奢华香水产品图 ${id}`,
    prompt: `${PROMPT_BASE} ${id}`,
    category: '人像',
    tags: ['product', 'commercial'],
    image: `https://example.com/${id}.jpg`,
    images: [`https://example.com/${id}.jpg`],
    aspectRatio: '1:1',
    model: 'GPT Image',
    source: '插件扫描',
    sourceUrl: `https://x.com/example/status/${id.replace(/\D/g, '') || '1000'}`,
    domain: 'x.com',
    date: '2026-08-05',
    timestamp: 1000,
    ...overrides
  };
}

test('extension inbox merge prepends valid items and dedupes existing source or prompt', () => {
  const existing = inboxItem('existing-1001', {
    sourceUrl: 'https://x.com/example/status/1001',
    prompt: `${PROMPT_BASE} existing prompt`
  });
  const duplicateSource = inboxItem('duplicate-source-1001', {
    sourceUrl: 'https://x.com/example/status/1001'
  });
  const duplicatePrompt = inboxItem('duplicate-prompt-2002', {
    sourceUrl: 'https://x.com/example/status/2002',
    prompt: existing.prompt
  });
  const incomplete = inboxItem('incomplete-3003', { prompt: 'short prompt' });
  const accepted = inboxItem('accepted-4004', {
    sourceUrl: 'https://x.com/example/status/4004'
  });

  const result = mergeExtensionInbox({
    collectionsPayload: {
      schemaVersion: 1,
      updatedAt: '2026-08-04T00:00:00.000Z',
      collections: [existing]
    },
    inboxFiles: [{
      filePath: 'data/inbox/test-batch.json',
      name: 'test-batch.json',
      items: [duplicateSource, duplicatePrompt, incomplete, accepted]
    }],
    now: '2026-08-05T10:00:00.000Z'
  });

  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 3);
  assert.equal(result.payload.collections[0].id, 'accepted-4004');
  assert.equal(result.payload.collections[0].category, '电商视觉');
  assert.equal(result.payload.collections[0].commerceType, '产品主图');
  assert.equal(result.payload.collections[0].githubSyncedAt, '2026-08-05T10:00:00.000Z');
  assert.equal(result.payload.collections[0].domesticSyncedAt, null);
  assert.equal(result.payload.collections[1].id, 'existing-1001');
});

test('extension inbox merge sanitizes payloads before server-side insertion', () => {
  const item = sanitizeInboxItem(inboxItem('sanitize-5005', {
    images: [
      'https://example.com/sanitize-5005.jpg',
      'http://example.com/not-allowed.jpg',
      'https://example.com/sanitize-5005.jpg'
    ],
    githubSyncedAt: '2026-08-04T00:00:00.000Z',
    domesticSyncedAt: '2026-08-04T00:30:00.000Z'
  }));

  assert.equal(item.images.length, 1);
  assert.equal(item.image, 'https://example.com/sanitize-5005.jpg');
  assert.equal(item.mediaType, 'image');
  assert.equal(collectionSourceKey(item), 'x:example:5005');
  assert.equal(promptFingerprint(item.prompt), promptFingerprint(`${PROMPT_BASE} sanitize-5005`));
});

test('extension inbox merge accepts concise structured visual prompts', () => {
  const concisePrompt = '2:3 的纵向构图，自然腰部高度的镜头，从头部到靴子收录全身肖像。人物置于中央，焦点在脸部，昏暗店内以浅景深模糊处理，服装材质清晰，柔和边缘光保留真实摄影质感。';
  const result = mergeExtensionInbox({
    collectionsPayload: {
      schemaVersion: 1,
      updatedAt: '2026-09-08T00:00:00.000Z',
      collections: []
    },
    inboxFiles: [{
      filePath: 'data/inbox/concise-batch.json',
      name: 'concise-batch.json',
      items: [inboxItem('concise-6006', {
        prompt: concisePrompt,
        sourceUrl: 'https://x.com/example/status/6006'
      })]
    }],
    now: '2026-09-08T10:00:00.000Z'
  });

  assert.equal(result.accepted.length, 1);
  assert.equal(result.payload.collections[0].prompt, concisePrompt);
});

test('extension inbox merge rejects social teaser text without the real prompt body', () => {
  const teaser = '这套提示词我是真满意：雨夜、霓虹、侧颜、丝袜特写、CCD直闪，全都拉满。老规矩提示词开源评论区，返图我看看谁出的不好看？';
  const result = mergeExtensionInbox({
    collectionsPayload: {
      schemaVersion: 1,
      updatedAt: '2026-09-08T00:00:00.000Z',
      collections: []
    },
    inboxFiles: [{
      filePath: 'data/inbox/teaser-batch.json',
      name: 'teaser-batch.json',
      items: [inboxItem('teaser-7007', {
        prompt: teaser,
        sourceUrl: 'https://x.com/example/status/7007'
      })]
    }]
  });

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'incomplete collection item');
});
