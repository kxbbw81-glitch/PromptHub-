const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
const seoGenerator = fs.readFileSync(path.join(root, 'scripts/generate-seo-pages.js'), 'utf8');

test('prompt details do not render the unrequested generation action', () => {
  assert.doesNotMatch(app, /Try \/ 去生成/);
  assert.doesNotMatch(app, /function getTryUrl/);
});

test('a saved local collection remains editable from its prompt detail route', () => {
  assert.match(app, /const localCollection = getCollections\(\)\.find\(c => c\.id === id\);/);
  assert.match(app, /renderPromptDetail\(displayPrompt, isEditableCollection\);/);
});

test('home gallery is three times longer and category totals include saved collections', () => {
  assert.match(app, /const loopedColumn = Array\.from\(\{ length: 6 \}/);
  assert.match(app, /getAllPromptItems\(\)\.forEach\(p =>/);
});

test('the homepage uses the requested copy without Nano Banana branding', () => {
  assert.match(app, /探索高品质纳米提示词库。/);
  assert.doesNotMatch(app, /Nano Banana/);
  assert.doesNotMatch(data, /Nano Banana/);
  assert.doesNotMatch(seoGenerator, /Nano Banana/);
});

test('the delayed domestic sync waits for a page save receipt before clearing pending data', () => {
  assert.match(background, /const EXT_SYNC_RECEIPT_KEY = 'prompthub_ext_sync_receipt';/);
  assert.match(background, /receipt\?\.batchId === batchId/);
  assert.match(background, /throw new Error\('PromptHub save receipt was not received'\)/);
});
