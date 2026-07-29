const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'OPERATING_RULES.md'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
const releaseScript = fs.readFileSync(path.join(root, 'scripts/release-domestic-collections.js'), 'utf8');

test('the operating rulebook matches the primary collection architecture', () => {
  assert.match(rules, /data\/collections\.json`? 是收藏数据唯一的权威来源/);
  assert.match(rules, /收藏后自动写入 GitHub 主站/);
  assert.match(rules, /30 分钟后由 GitHub Action 发布到国内站/);
  assert.match(rules, /具体状态页/);
  assert.match(rules, /只有 GitHub 成功确认才是主站同步成功/);
  assert.match(rules, /Grok CLI/);
  assert.match(rules, /GROK_CANDIDATE_FORMAT\.md/);
  assert.match(rules, /禁止使用浏览器自动操作 X/);
  assert.match(rules, /默认不启用定时运行/);
  assert.match(app, /REMOTE_COLLECTIONS_URL/);
  assert.match(background, /queueAutomaticPrimarySync/);
  assert.match(background, /collectionSourceKey/);
  assert.match(releaseScript, /30 \* 60 \* 1000/);
});
