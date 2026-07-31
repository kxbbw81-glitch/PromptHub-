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

test('video prompts have a dedicated homepage category and filter', () => {
  assert.match(data, /name: "视频提示词"/);
  assert.match(app, /item\.mediaType === 'video'\s*\?\s*'视频提示词'/);
  assert.match(app, /'video': '视频提示词'/);
});

test('e-commerce prompts use a primary category with second-level use-case filters', () => {
  assert.match(data, /const CATEGORIES = \[\s*\{ name: "电商视觉"/);
  assert.match(app, /id="commerce-filter-chips"/);
  assert.match(app, /const COMMERCE_TYPES = \[/);
  assert.match(app, /p\.commerceType === currentCommerceType/);
  assert.match(app, /p\.mediaType === 'video' \|\| p\.category === '视频提示词'/);
});

test('the homepage uses the requested copy without Nano Banana branding', () => {
  assert.match(app, /探索高品质纳米提示词库。/);
  assert.doesNotMatch(app, /Nano Banana/);
  assert.doesNotMatch(data, /Nano Banana/);
  assert.doesNotMatch(seoGenerator, /Nano Banana/);
});

test('collections use GitHub as their source of truth instead of browser local storage', () => {
  assert.match(app, /const PRIMARY_COLLECTIONS_URL = 'data\/collections\.json';/);
  assert.match(app, /const DOMESTIC_COLLECTIONS_URL = '\/data\/collections\.json\?v=20260729b';/);
  assert.match(app, /return isDomesticSite\(\) \? DOMESTIC_COLLECTIONS_URL : PRIMARY_COLLECTIONS_URL;/);
  assert.match(app, /function getCollectionsRequestUrl\(\)/);
  assert.match(app, /url\.searchParams\.set\('_', String\(Date\.now\(\)\)\);/);
  assert.match(app, /await fetch\(getCollectionsRequestUrl\(\)/);
  assert.doesNotMatch(app, /raw\.githubusercontent\.com\/kxbbw81-glitch\/PromptHub-\/main\/data\/collections\.json/);
  assert.match(app, /isDomesticSite\(\) \? 300000 : 60000/);
  assert.doesNotMatch(app, /localStorage\.setItem\(COLLECTIONS_KEY/);
  assert.match(background, /const GITHUB_COLLECTIONS_API = 'https:\/\/api\.github\.com\/repos\/kxbbw81-glitch\/PromptHub-\/contents\/data\/collections\.json';/);
  assert.match(background, /async function syncQueueToGitHub\(queue\)/);
  assert.match(popup, /GitHub Token/);
});

test('the extension collects into a temporary unique queue before GitHub sync', () => {
  assert.match(app, /function collectionFingerprint\(item\)/);
  assert.match(app, /findDuplicateCollection\(getCollections\(\), safeItem\)/);
  assert.match(background, /function collectionFingerprint\(item\)/);
  assert.match(background, /alreadySaved: true, duplicateId:/);
  assert.match(background, /const skipped = entries\.length - additions\.length;/);
  assert.match(content, /alreadySaved: Boolean\(response\?\.alreadySaved\)/);
  assert.match(background, /async function addItemsToQueue\(items\)/);
  assert.match(background, /action === 'addItemsToQueue'/);
  assert.match(background, /\[\.\.\.queue, \.\.\.additions\]/);
  assert.match(background, /let queueMutation = Promise\.resolve\(\);/);
  assert.match(background, /function withQueueLock\(task\)/);
  assert.match(background, /const queueSnapshot = await getQueue\(\);/);
  assert.match(background, /const RECEIPT_KEY = 'prompthub_collection_receipts';/);
  assert.match(background, /async function verifyGitHubCollections\(token, entries\)/);
  assert.match(background, /outcome: 'saved'/);
  assert.match(background, /outcome: 'already_exists'/);
  assert.match(background, /const result = await syncQueueToGitHub\(queueSnapshot\);/);
  assert.match(background, /await removeSyncedQueueItems\(queueSnapshot\);/);
  assert.match(background, /for \(let attempt = 0; attempt < 5; attempt\+\+\)/);
  assert.match(background, /formatGitHubError\(error\)/);
  assert.match(popup, /action: 'addToQueue'/);
  assert.match(popup, /action: 'addItemsToQueue'/);
  assert.match(popup, /id="btn-collect-all"/);
  assert.match(popup, /已加入收藏队列，等待 GitHub 主站验证/);
  assert.match(popup, /function waitForCollectionVerification/);
  assert.match(popup, /function renderCollectionOutcome/);
  assert.match(popup, /主站已存在/);
  assert.match(popup, /#btn-notice/);
  assert.match(popup, /await updateQueueUI\(\);/);
  assert.doesNotMatch(popup, /已识别并推送成功；国内站将在 30 分钟后同步/);
});

test('new collections sort first across devices', () => {
  assert.match(app, /function getCollectionSortTime\(item\)/);
  assert.match(app, /sort\(\(left, right\) => getCollectionSortTime\(right\) - getCollectionSortTime\(left\)\)/);
  assert.match(background, /collectedAt: now, githubSyncedAt: now/);
  assert.match(background, /collectedAt: collections\[index\]\.collectedAt \|\| collections\[index\]\.githubSyncedAt \|\| now/);
});

test('the browser extension pane provides a direct download for the current package', () => {
  assert.match(app, /PromptHub-Extension-v3\.12\.0\.zip/);
  assert.match(app, /download="PromptHub-Extension-v3\.12\.0\.zip"/);
  assert.match(app, /下载浏览器插件/);
});

test('the extension records an image aspect ratio during prompt recognition', () => {
  assert.match(popup, /img\.naturalWidth \|\| img\.width \|\| rect\.width/);
  assert.match(popup, /aspectRatio: imageData\.aspectRatio \|\| extractAspectRatio\(promptText\)/);
  assert.match(content, /aspectRatio: imageData\.aspectRatio \|\| extractAspectRatio\(promptText\)/);
  assert.match(background, /aspectRatio: extractAspectRatio\(promptText\)/);
});

test('the extension reports the GitHub primary-site write result precisely', () => {
  assert.match(popup, /已写入 GitHub 主站 \$\{savedCount\} 个提示词/);
  assert.match(popup, /GitHub 主站无新增，\$\{skippedCount\} 个提示词已存在/);
});
