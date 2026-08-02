const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'extension/popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'extension/popup.html'), 'utf8');
const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const facets = fs.readFileSync(path.join(root, 'js/explore-facets.js'), 'utf8');
const dailyCuration = fs.readFileSync(path.join(root, 'js/daily-curation.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const seoGenerator = fs.readFileSync(path.join(root, 'scripts/generate-seo-pages.js'), 'utf8');

test('prompt details do not render the unrequested generation action', () => {
  assert.doesNotMatch(app, /Try \/ 去生成/);
  assert.doesNotMatch(app, /function getTryUrl/);
});

test('the header exposes a disclaimer route with free-use and rights boundaries', () => {
  assert.match(index, /href="#\/disclaimer" data-action="navigate" data-route="disclaimer">免责声明/);
  assert.match(app, /function renderDisclaimer\(\)/);
  assert.match(app, /PromptHub 对公开展示的提示词内容不收取访问、浏览或复制费用/);
  assert.match(app, /\['home', 'import', 'collections', 'disclaimer'\]/);
  assert.match(app, /else if \(route === 'disclaimer'\) renderDisclaimer\(\);/);
  assert.match(css, /\.legal-layout[\s\S]*grid-template-columns: 190px minmax\(0, 760px\)/);
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
  assert.match(css, /\.hero-gallery\s*\{\s*height: clamp\(864px, calc\(\(100svh - var\(--header-h\)\) \* 1\.2\), 1344px\);/);
  assert.match(css, /height: clamp\(696px, calc\(\(100svh - 16px\) \* 1\.2\), 912px\);/);
});

test('the homepage curates a fresh daily selection instead of fixed liked prompts', () => {
  assert.match(index, /js\/daily-curation\.js\?v=20260802a/);
  assert.match(app, /const dailyCuratedPrompts = dailyCuration\.getDailyCuratedPrompts\(allPromptItems, 16\);/);
  assert.match(app, /const todayTop = dailyCuratedPrompts\.slice\(0, 6\);/);
  assert.match(app, /每日自动分析主站内容/);
  assert.match(dailyCuration, /timeZone: 'Asia\/Shanghai'/);
  assert.match(dailyCuration, /const freshness = itemDateKey === dateKey \? 340/);
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
  assert.match(app, /state\.commerceType !== 'All' && prompt\.commerceType !== state\.commerceType/);
  assert.match(app, /p\.mediaType === 'video' \|\| p\.category === '视频提示词'/);
});

test('explore uses four parallel type, style, scene, and e-commerce facets', () => {
  assert.match(index, /js\/explore-facets\.js\?v=20260802c/);
  assert.match(index, /js\/daily-curation\.js\?v=20260802a/);
  assert.match(index, /css\/style\.css\?v=20260802f/);
  assert.match(index, /js\/app\.js\?v=20260802h/);
  assert.match(app, /id="content-type-filter-chips"/);
  assert.match(app, /id="style-filter-chips"/);
  assert.match(app, /id="scene-filter-chips"/);
  assert.match(app, /id="commerce-filter-chips"/);
  assert.doesNotMatch(app, /id="theme-filter-chips"/);
  assert.match(app, /currentContentType/);
  assert.match(app, /currentStyle/);
  assert.match(app, /currentScene/);
  assert.match(app, /params\.set\('type', currentContentType\)/);
  assert.match(app, /params\.set\('style', currentStyle\)/);
  assert.match(app, /params\.set\('scene', currentScene\)/);
  assert.match(facets, /界面与屏幕/);
  assert.match(facets, /图表与信息图/);
  assert.match(app, /const COMMERCE_FILTERS = \[/);
  assert.match(app, /<h2 class="explore-facet-label">电商视觉<\/h2>/);
  assert.match(app, /const LEGACY_CATEGORY_FACETS = \{/);
  assert.match(css, /\.explore-facet-panel[\s\S]*background: #181818/);
  assert.match(app, /prompts-grid prompts-masonry/);
  assert.match(app, /container explore-gallery-container/);
  assert.match(css, /\.prompts-masonry[\s\S]*column-count: 3/);
  assert.match(css, /\.explore-gallery-container[\s\S]*max-width: 1680px/);
  assert.match(css, /\.prompts-masonry \.prompt-card-img[\s\S]*object-fit: cover/);
  assert.match(css, /\.prompts-masonry \.prompt-card-tags[\s\S]*display: none/);
  assert.match(css, /\.prompts-masonry \.card-img-count[\s\S]*display: none/);
  assert.match(app, /id="explore-load-sentinel"/);
  assert.match(app, /const EXPLORE_INITIAL_BATCH = 36/);
  assert.match(app, /IntersectionObserver/);
  assert.doesNotMatch(app, /每页 \$\{PAGE_SIZE\} 个/);
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
  assert.match(background, /const GITHUB_BLOB_API_BASE = 'https:\/\/api\.github\.com\/repos\/kxbbw81-glitch\/PromptHub-\/git\/blobs\/';/);
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
  assert.match(background, /for \(let attempt = 0; attempt < 8; attempt\+\+\)/);
  assert.match(background, /const PRIMARY_RETRY_ALARM_NAME = 'prompthub_primary_retry';/);
  assert.match(background, /async function schedulePrimaryRetry\(\)/);
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
  assert.match(app, /PromptHub-Extension-v3\.16\.0\.zip/);
  assert.match(app, /download="PromptHub-Extension-v3\.16\.0\.zip"/);
  assert.match(app, /下载浏览器插件/);
});

test('the extension visible version matches the packaged manifest version', () => {
  assert.match(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'), /"version": "3\.16\.0"/);
  assert.match(popupHtml, /AI 提示词收集器 v3\.16\.0/);
});

test('paste and manual import flows expose a visible save button', () => {
  assert.match(app, /id="imp-save-preview-btn"[^>]*>保存到收藏/);
  assert.match(app, /data-action="save-manual">保存到收藏/);
  assert.match(app, /action === 'save-manual'/);
  assert.match(app, /window\.saveManual\(\)/);
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
  assert.match(popup, /收藏已保留在队列中，修复后可再次同步/);
  assert.match(background, /GITHUB_LARGE_FILE_BYTES/);
  assert.match(background, /isLargeFile/);
  assert.match(background, /GitHub raw read failed, falling back to blob/);
});
