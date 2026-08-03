const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditCollections,
  collectionDateKey,
  dateKeyInShanghai
} = require('../scripts/audit-daily-collections.js');

test('uses Shanghai dates for the 23:30 collection audit window', () => {
  assert.equal(dateKeyInShanghai('2026-08-02T16:05:00.000Z'), '2026-08-03');
  assert.equal(collectionDateKey({ collectedAt: '2026-08-02T16:05:00.000Z' }), '2026-08-03');
});

test('replaces only broad automatic titles with a prompt-derived title under 20 characters', () => {
  const payload = {
    collections: [
      {
        id: 'automatic-title',
        title: '时尚人像',
        prompt: 'A Korean woman takes a selfie with the front phone camera. She has long milk tea gray hair, soft daylight, realistic skin texture, quiet apartment background, editorial photography, no text, no watermark.',
        collectedAt: '2026-08-03T08:00:00.000Z'
      },
      {
        id: 'manual-title',
        title: '我的人工标题',
        titleSource: 'manual',
        prompt: 'A Korean woman takes a selfie with the front phone camera. She has long milk tea gray hair, soft daylight, realistic skin texture, quiet apartment background, editorial photography, no text, no watermark.',
        collectedAt: '2026-08-03T08:00:00.000Z'
      },
      {
        id: 'previous-day',
        title: '时尚人像',
        prompt: 'A Korean woman takes a selfie with the front phone camera. She has long milk tea gray hair, soft daylight, realistic skin texture, quiet apartment background, editorial photography, no text, no watermark.',
        collectedAt: '2026-08-02T08:00:00.000Z'
      }
    ]
  };

  const result = auditCollections(payload, {
    dateKey: '2026-08-03',
    now: '2026-08-03T15:30:00.000Z'
  });

  assert.equal(result.audited, 2);
  assert.equal(result.updated, 1);
  assert.equal(result.skippedManual, 1);
  assert.equal(payload.collections[0].title, '韩系奶茶灰自拍');
  assert.equal(payload.collections[0].titleSource, 'prompt-audit');
  assert.equal(payload.collections[0].titleGeneratedAt, '2026-08-03T15:30:00.000Z');
  assert.ok([...payload.collections[0].title].length <= 20);
  assert.equal(payload.collections[1].title, '我的人工标题');
  assert.equal(payload.collections[2].title, '时尚人像');
});
