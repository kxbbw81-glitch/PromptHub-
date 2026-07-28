const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TextDecoder, TextEncoder } = require('node:util');

const backgroundSource = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');

function createHarness() {
  const storage = { prompthub_github_token: 'github_pat_test_token_with_write_permission' };
  const remote = { collections: [], putCalls: 0 };
  const event = { addListener() {} };
  const local = {
    async get(keys) {
      if (typeof keys === 'string') return { [keys]: storage[keys] };
      return Object.fromEntries((keys || Object.keys(storage)).map(key => [key, storage[key]]));
    },
    async set(values) { Object.assign(storage, values); },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    }
  };
  const context = {
    TextDecoder,
    TextEncoder,
    URL,
    console,
    setTimeout,
    clearTimeout,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    importScripts() {},
    chrome: {
      action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
      alarms: { create: async () => {}, onAlarm: event },
      contextMenus: { create() {}, onClicked: event },
      runtime: { onInstalled: event, onMessage: event, onStartup: event },
      scripting: { executeScript: async () => [] },
      storage: { local },
      tabs: { create: async () => ({}), query: async () => [], update: async () => ({}) }
    },
    fetch: async (_url, options = {}) => {
      if ((options.method || 'GET') === 'PUT') {
        remote.putCalls += 1;
        const body = JSON.parse(options.body);
        const decoded = Buffer.from(body.content, 'base64').toString('utf8');
        remote.collections = JSON.parse(decoded).collections;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      const content = Buffer.from(JSON.stringify({ collections: remote.collections }), 'utf8').toString('base64');
      return { ok: true, status: 200, json: async () => ({ sha: 'test-sha', content }) };
    }
  };

  vm.createContext(context);
  vm.runInContext(backgroundSource, context);
  return { context, remote, storage };
}

function prompt(id, body) {
  return {
    id,
    title: `Title ${id}`,
    prompt: body,
    category: '人像',
    tags: ['cinematic'],
    image: 'https://example.com/image.jpg',
    images: ['https://example.com/image.jpg'],
    url: 'https://example.com/post',
    domain: 'example.com',
    source: 'test',
    date: '2026-07-28',
    timestamp: 1
  };
}

test('concurrent collections are queued locally and committed to GitHub in one batch', async () => {
  const { context, remote, storage } = createHarness();
  const first = prompt('first', 'a cinematic studio portrait with soft light');
  const second = prompt('second', 'a detailed editorial fashion portrait in daylight');

  await Promise.all([context.addToQueue(first), context.addToQueue(second)]);
  assert.equal(storage.prompthub_queue.length, 2);

  const result = await context.syncToWebsite();
  assert.deepEqual({ success: result.success, count: result.count, skipped: result.skipped }, { success: true, count: 2, skipped: 0 });
  assert.equal(remote.putCalls, 1);
  assert.deepEqual(remote.collections.map(item => item.id), ['second', 'first']);
  assert.equal(storage.prompthub_queue, undefined);
});
