const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TextDecoder, TextEncoder } = require('node:util');

const backgroundSource = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');

function createHarness() {
  const storage = { prompthub_github_token: 'github_pat_test_token_with_write_permission' };
  const remote = { collections: [], putCalls: 0, omitApiContent: false, rawGetCalls: 0, conflictOnce: false, alwaysConflict: false };
  const alarms = [];
  const alarmListeners = [];
  const event = { addListener() {} };
  const alarmsEvent = { addListener(listener) { alarmListeners.push(listener); } };
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
    setTimeout: (callback, ms) => setTimeout(callback, Math.min(Number(ms) || 0, 1)),
    clearTimeout,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    importScripts() {},
    chrome: {
      action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
      alarms: {
        create: async (name, options) => { alarms.push({ name, options }); },
        onAlarm: alarmsEvent
      },
      contextMenus: { create() {}, onClicked: event },
      runtime: { onInstalled: event, onMessage: event, onStartup: event },
      scripting: { executeScript: async () => [] },
      storage: { local },
      tabs: { create: async () => ({}), query: async () => [], update: async () => ({}) }
    },
    fetch: async (url, options = {}) => {
      if ((options.method || 'GET') === 'PUT') {
        remote.putCalls += 1;
        if (remote.alwaysConflict || (remote.conflictOnce && remote.putCalls === 1)) {
          return { ok: false, status: 409, json: async () => ({ message: 'conflict' }) };
        }
        const body = JSON.parse(options.body);
        const decoded = Buffer.from(body.content, 'base64').toString('utf8');
        remote.collections = JSON.parse(decoded).collections;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (String(url).includes('raw.githubusercontent.com')) {
        remote.rawGetCalls += 1;
        return { ok: true, status: 200, text: async () => JSON.stringify({ collections: remote.collections }) };
      }
      const content = Buffer.from(JSON.stringify({ collections: remote.collections }), 'utf8').toString('base64');
      return {
        ok: true,
        status: 200,
        json: async () => remote.omitApiContent
          ? { sha: 'test-sha', encoding: 'none' }
          : { sha: 'test-sha', content }
      };
    }
  };

  vm.createContext(context);
  vm.runInContext(backgroundSource, context);
  return { context, remote, storage, alarms, alarmListeners };
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

test('one-click collection batches detected prompts into one queued GitHub write', async () => {
  const { context, remote, storage } = createHarness();
  const first = prompt('batch-first', 'A cinematic portrait of an adult woman in a quiet gallery, soft side window light, tailored navy suit, realistic skin texture, 85mm lens, shallow depth of field, balanced editorial framing, muted color grade, photorealistic finish, no text, no watermark.');
  const second = prompt('batch-second', 'A detailed architectural photograph of a calm concrete courtyard with reflecting water, warm dusk light, clean geometric composition, native plants, subtle film grain, 24mm lens, realistic materials, high-end editorial finish, photorealistic, no text, no logo.');
  const duplicateSource = { ...first, id: 'batch-duplicate', title: 'Duplicate source', prompt: `${first.prompt} Extra wording.` };
  const incomplete = prompt('batch-incomplete', 'A short prompt,');

  const result = await context.addItemsToQueue([first, second, duplicateSource, incomplete]);

  assert.equal(result.success, true);
  assert.equal(result.added, 2);
  assert.equal(result.rejected, 1);
  assert.deepEqual([...result.trackedIds], ['batch-first', 'batch-second']);
  assert.equal((await waitForReceipt(context, 'batch-first')).state, 'verified');
  assert.equal((await waitForReceipt(context, 'batch-second')).state, 'verified');
  assert.equal(remote.putCalls, 1);
  assert.deepEqual(remote.collections.map(item => item.id), ['batch-second', 'batch-first']);
  assert.equal(storage.prompthub_queue, undefined);
});

test('one-click collection identifies the prompt already on the GitHub primary site', async () => {
  const { context, remote } = createHarness();
  const existing = prompt('batch-existing', 'A refined interior portrait of an adult woman in a sunlit studio, linen textures, soft window shadows, a 50mm lens, realistic skin and fabric, warm neutral palette, editorial composition, shallow depth of field, photorealistic finish, no text, no watermark.');
  const newPrompt = prompt('batch-new', 'A cinematic product photograph of a dark green glass bottle on textured stone, soft side light, restrained reflections, subtle atmospheric haze, 85mm lens, high-end commercial styling, natural material detail, balanced composition, photorealistic finish, no text, no watermark.');
  remote.collections = [existing];

  const result = await context.addItemsToQueue([existing, newPrompt]);

  assert.deepEqual(Array.from(result.outcomes, outcome => outcome.outcome), ['queued', 'queued']);
  assert.equal((await waitForReceipt(context, 'batch-existing')).outcome, 'already_exists');
  assert.equal((await waitForReceipt(context, 'batch-new')).outcome, 'saved');
  assert.deepEqual(remote.collections.map(item => item.id), ['batch-new', 'batch-existing']);
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

test('falls back to raw GitHub collections when the contents API omits large file content', async () => {
  const { context, remote } = createHarness();
  remote.omitApiContent = true;
  remote.collections = [prompt('existing-large-file', 'A cinematic portrait of an adult woman beside a large window, soft natural light, realistic skin texture, tailored coat, warm neutral interior, 85mm lens, shallow depth of field, editorial photography, photorealistic finish, no text, no watermark.')];
  const next = prompt('raw-fallback-new', 'A premium product photograph of a matte black ceramic cup on a stone table, warm side light, soft steam, subtle reflection, minimalist styling, 85mm lens, shallow depth of field, high-end commercial photography, realistic texture, no text, no logo, no watermark.');

  const result = await context.addToQueue(next);

  assert.equal(result.pendingVerification, true);
  assert.equal((await waitForReceipt(context, 'raw-fallback-new')).outcome, 'saved');
  assert.equal(remote.rawGetCalls >= 1, true);
  assert.deepEqual(remote.collections.map(item => item.id), ['raw-fallback-new', 'existing-large-file']);
});

test('GitHub save conflicts are retried against a fresh remote snapshot', async () => {
  const { context, remote, storage } = createHarness();
  remote.conflictOnce = true;
  const first = prompt('conflict-retry', 'A precise commercial product photograph of a brushed steel kettle on a black stone counter, soft side lighting, subtle steam, realistic metal reflections, shallow depth of field, premium catalog styling, 85mm lens, photorealistic finish, no text, no logo, no watermark.');

  const result = await context.addToQueue(first);

  assert.equal(result.pendingVerification, true);
  assert.equal((await waitForReceipt(context, 'conflict-retry')).outcome, 'saved');
  assert.equal(remote.putCalls, 2);
  assert.deepEqual(remote.collections.map(item => item.id), ['conflict-retry']);
  assert.equal(storage.prompthub_queue, undefined);
});

test('repeated GitHub save conflicts keep the queue and schedule automatic retry', async () => {
  const { context, remote, storage, alarms } = createHarness();
  remote.alwaysConflict = true;
  const first = prompt('conflict-queued', 'A cinematic e-commerce hero image of a transparent perfume bottle on wet black acrylic, controlled rim light, clean reflection, luxury cosmetics styling, realistic glass refraction, soft background gradient, 100mm lens, photorealistic finish, no text, no logo, no watermark.');

  await context.addToQueue(first);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const receipt = await context.getCollectionReceipt('conflict-queued');
    if (receipt?.state === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  const receipt = await context.getCollectionReceipt('conflict-queued');
  assert.equal(receipt.state, 'failed');
  assert.equal(receipt.error, 'GitHub 正在更新收藏数据，已保留队列并自动重试');
  assert.equal(storage.prompthub_queue.length, 1);
  assert.ok(alarms.some(alarm => alarm.name === 'prompthub_primary_retry'));
});
