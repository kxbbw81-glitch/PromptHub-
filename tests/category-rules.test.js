const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCollection, classifyCommerceType, reclassifyCollections } = require('../scripts/category-rules');

test('categorizes a fashion collection ahead of generic portrait terms', () => {
  assert.equal(classifyCollection({
    title: 'Fashion editorial',
    prompt: 'A photorealistic portrait with couture styling for a premium fashion runway lookbook.'
  }), '时尚');
});

test('always categorizes video collections as video prompts', () => {
  assert.equal(classifyCollection({ mediaType: 'video', prompt: 'A cyberpunk city scene' }), '视频提示词');
});

test('uses e-commerce as the primary category while retaining its use-case type', () => {
  const item = {
    mediaType: 'video',
    title: 'Thermos UGC product review video',
    prompt: 'Create an authentic UGC product review video with a detailed thermos unboxing and testimonial.'
  };

  assert.equal(classifyCollection(item), '电商视觉');
  assert.equal(classifyCommerceType(item), 'UGC / 口碑');
});

test('recognizes reusable logo and visual-identity proposal prompts as brand visuals', () => {
  const item = {
    title: 'Four-panel Logo Proposal',
    prompt: 'Create a brand identity and visual identity proposal with four logo design directions for a premium product brand.'
  };

  assert.equal(classifyCollection(item), '电商视觉');
  assert.equal(classifyCommerceType(item), '品牌视觉');
});

test('classifies persona templates and selfies without falling back to abstract', () => {
  assert.equal(classifyCollection({
    title: 'Fruit persona archive template',
    prompt: 'Create a detailed persona archive and character profile for a living adult character.'
  }), '角色');
  assert.equal(classifyCollection({
    title: 'Korean bedroom smartphone selfie',
    prompt: 'A photorealistic selfie of an adult woman in a bedroom.'
  }), '人像');
});

test('reclassifies Grok imports without overwriting user-managed categories', () => {
  const result = reclassifyCollections({ collections: [
    { source: 'Grok X 公开搜索', category: 'portrait', mediaType: 'image', prompt: 'A fashion editorial runway lookbook.' },
    { source: '手动收藏', category: '建筑', mediaType: 'image', prompt: 'A portrait in a gallery.' }
  ] });

  assert.equal(result.changed, 1);
  assert.equal(result.payload.collections[0].category, '时尚');
  assert.equal(result.payload.collections[1].category, '建筑');
});
