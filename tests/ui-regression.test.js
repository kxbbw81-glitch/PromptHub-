const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'extension/popup.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
const seoGenerator = fs.readFileSync(path.join(root, 'scripts/generate-seo-pages.js'), 'utf8');

test('prompt details do not render the unrequested generation action', () => {
  assert.doesNotMatch(app, /Try \/ 去生成/);
  assert.doesNotMatch(app, /function getTryUrl/);
});

test('a saved collection remains editable from its prompt detail route', () => {
  assert.match(app, /const localCollection = getCollections\(\)\.find\(c => c\.id === id\);/);
  assert.match(app, /renderPromptDetail\(displayPrompt, isSavedCollection, canEdit\);/);
  assert.match(app, /function saveOrUpdateCollection\(item, patch\)/);
  assert.match(app, /const canEdit = true;/);
});

test('home gallery is three times longer and category totals include saved collections', () => {
  assert.match(app, /const loopedColumn = Array\.from\(\{ length: 18 \}/);
  assert.match(app, /getAllPromptItems\(\)\.forEach\(p =>/);
});

test('the homepage uses the requested copy without Nano Banana branding', () => {
  assert.match(app, /探索高品质纳米提示词库。/);
  assert.doesNotMatch(app, /Nano Banana/);
  assert.doesNotMatch(data, /Nano Banana/);
  assert.doesNotMatch(seoGenerator, /Nano Banana/);
});

test('collections use GitHub as their source of truth instead of browser local storage', () => {
  assert.match(app, /const REMOTE_COLLECTIONS_URL = 'https:\/\/raw\.githubusercontent\.com\/kxbbw81-glitch\/PromptHub-\/main\/data\/collections\.json';/);
  assert.match(app, /await fetch\(REMOTE_COLLECTIONS_URL/);
  assert.doesNotMatch(app, /localStorage\.setItem\(COLLECTIONS_KEY/);
  assert.match(background, /const GITHUB_COLLECTIONS_API = 'https:\/\/api\.github\.com\/repos\/kxbbw81-glitch\/PromptHub-\/contents\/data\/collections\.json';/);
  assert.match(background, /async function syncQueueToGitHub\(queue\)/);
  assert.match(popup, /GitHub Token/);
});

test('collection writes use normalized prompt uniqueness and report push outcomes', () => {
  assert.match(app, /function collectionFingerprint\(item\)/);
  assert.match(app, /findDuplicateCollection\(getCollections\(\), safeItem\)/);
  assert.match(background, /function collectionFingerprint\(item\)/);
  assert.match(background, /alreadySaved: true, duplicateId:/);
  assert.match(background, /let skipped = 0;/);
  assert.match(content, /alreadySaved: Boolean\(response\?\.alreadySaved\)/);
  assert.match(popup, /已识别并推送成功；国内站将在 30 分钟后同步/);
  assert.match(popup, /result\.alreadySaved/);
});
