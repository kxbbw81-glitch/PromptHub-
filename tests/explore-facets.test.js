const test = require('node:test');
const assert = require('node:assert/strict');
const facets = require('../js/explore-facets.js');

const commerce = {
  category: '电商视觉',
  commerceType: '品牌视觉',
  title: '香水品牌广告',
  tags: ['摄影写实', '电商视觉'],
  prompt: 'Premium product shot for a perfume brand campaign, photorealistic studio lighting.'
};

test('recognizes content types without replacing PromptHub primary categories', () => {
  assert.equal(facets.matchesFacet(commerce, 'contentType', 'commerce'), true);
  assert.equal(facets.matchesFacet(commerce, 'contentType', 'brand'), true);
  assert.equal(commerce.category, '电商视觉');
});

test('supports independent style and scene facets', () => {
  assert.equal(facets.matchesFacet(commerce, 'style', 'realistic'), true);
  assert.equal(facets.matchesFacet(commerce, 'scene', 'commerce'), true);
  assert.equal(facets.matchesFacet(commerce, 'scene', 'education'), false);
});

test('recognizes source gallery information-design tags', () => {
  const item = {
    title: '城市生命系统图谱',
    category: '抽象',
    tags: ['信息图', 'Charts & Infographics'],
    prompt: 'Vertical isometric infographic with technical diagrams.'
  };
  assert.equal(facets.matchesFacet(item, 'contentType', 'infographic'), true);
});
