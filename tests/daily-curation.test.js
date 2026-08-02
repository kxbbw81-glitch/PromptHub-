const test = require('node:test');
const assert = require('node:assert/strict');
const { getDailyCuratedPrompts, getShanghaiDateKey } = require('../js/daily-curation.js');

function item(id, category, options = {}) {
  return {
    id,
    title: `${id} title`,
    category,
    prompt: 'A complete, detailed visual-generation prompt with subject, composition, lighting, material and atmosphere.',
    image: `https://images.example.com/${id}.jpg`,
    ...options
  };
}

test('daily curation is stable for one Shanghai calendar day', () => {
  const items = [
    item('portrait', '人像', { likes: 1200 }),
    item('architecture', '建筑', { likes: 200 }),
    item('commerce', '电商视觉', { likes: 20 }),
    item('video', '视频提示词', { likes: 30 })
  ];
  const first = getDailyCuratedPrompts(items, 4, '2026-08-02').map(entry => entry.id);
  const second = getDailyCuratedPrompts(items, 4, '2026-08-02').map(entry => entry.id);
  assert.deepEqual(first, second);
});

test('daily curation prioritizes items collected today and keeps categories diverse', () => {
  const selected = getDailyCuratedPrompts([
    item('old-portrait', '人像', { likes: 5000 }),
    item('fresh-portrait', '人像', { isCollection: true, collectedAt: '2026-08-02T03:00:00.000Z' }),
    item('fresh-commerce', '电商视觉', { isCollection: true, collectedAt: '2026-08-02T04:00:00.000Z' }),
    item('fresh-video', '视频提示词', { isCollection: true, collectedAt: '2026-08-02T05:00:00.000Z' })
  ], 3, '2026-08-02');
  assert.ok(selected.some(entry => entry.id === 'fresh-portrait'));
  assert.equal(new Set(selected.map(entry => entry.category)).size, 3);
});

test('Shanghai date keys use the intended site timezone', () => {
  assert.equal(getShanghaiDateKey(new Date('2026-08-01T16:30:00.000Z')), '2026-08-02');
});
