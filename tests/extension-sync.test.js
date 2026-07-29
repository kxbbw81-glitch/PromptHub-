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
    url: `https://example.com/post/${id}`,
    sourceUrl: `https://example.com/post/${id}`,
    domain: 'example.com',
    source: 'test',
    date: '2026-07-28',
    timestamp: 1
  };
}

async function waitForReceipt(context, id) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const receipt = await context.getCollectionReceipt(id);
    if (receipt?.state === 'verified') return receipt;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  return context.getCollectionReceipt(id);
}

test('concurrent collections are saved locally before automatic GitHub primary sync', async () => {
  const { context, remote, storage } = createHarness();
  const first = prompt('first', 'A cinematic studio portrait of an adult woman with soft window light, natural skin texture, a dark tailored jacket, editorial composition, 85mm lens, shallow depth of field, subtle film grain, detailed shadows, photorealistic finish, no text, no logo, no watermark.');
  const second = prompt('second', 'A detailed editorial fashion portrait in daylight with a full-body pose, modern architecture, clean styling, soft reflected light, realistic fabric texture, a 50mm lens, balanced composition, high-end magazine photography, photorealistic finish, no text, no watermark.');

  const results = await Promise.all([context.addToQueue(first), context.addToQueue(second)]);

  assert.ok(results.every(result => result.success && result.pendingVerification));
  assert.equal((await waitForReceipt(context, 'first')).state, 'verified');
  assert.equal((await waitForReceipt(context, 'second')).state, 'verified');
  assert.ok(remote.putCalls >= 1);
  assert.deepEqual(remote.collections.map(item => item.id), ['second', 'first']);
  assert.equal(storage.prompthub_queue, undefined);
});

test('incomplete prompts and duplicate source posts never reach the primary site', async () => {
  const { context, remote } = createHarness();
  const complete = prompt('complete', 'A cinematic editorial portrait of an adult woman standing in a quiet modern gallery, soft directional daylight, tailored black coat, realistic fabric texture, 85mm lens, shallow depth of field, gentle shadows, refined color palette, high-end magazine photography, photorealistic finish, no text, no watermark.');
  const samePost = { ...complete, id: 'same-post', prompt: `${complete.prompt} Additional styling notes.`, title: 'Same source' };
  const incomplete = prompt('incomplete', 'A cinematic portrait with soft light,');

  const first = await context.addToQueue(complete);
  await context.queueAutomaticPrimarySync();
  const duplicate = await context.addToQueue(samePost);
  await context.queueAutomaticPrimarySync();
  const rejected = await context.addToQueue(incomplete);

  assert.equal(first.pendingVerification, true);
  assert.equal(duplicate.pendingVerification, true);
  assert.equal(rejected.success, false);
  assert.deepEqual(remote.collections.map(item => item.id), ['complete']);
  assert.equal((await context.getCollectionReceipt('same-post')).state, 'verified');
});
