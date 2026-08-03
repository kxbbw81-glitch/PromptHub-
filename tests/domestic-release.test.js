const test = require('node:test');
const assert = require('node:assert/strict');
const { DOMESTIC_DELAY_MS, releaseEligibleCollections } = require('../scripts/release-domestic-collections');

test('releases only collections that have waited at least thirty minutes', () => {
  const now = Date.parse('2026-07-28T12:00:00.000Z');
  const collections = [
    { id: 'due', githubSyncedAt: new Date(now - DOMESTIC_DELAY_MS).toISOString(), domesticSyncedAt: null },
    { id: 'recent', githubSyncedAt: new Date(now - DOMESTIC_DELAY_MS + 1).toISOString(), domesticSyncedAt: null },
    { id: 'released', githubSyncedAt: new Date(now - DOMESTIC_DELAY_MS * 2).toISOString(), domesticSyncedAt: '2026-07-28T11:00:00.000Z' }
  ];

  assert.equal(releaseEligibleCollections(collections, now), 1);
  assert.equal(collections[0].domesticSyncedAt, '2026-07-28T12:00:00.000Z');
  assert.equal(collections[1].domesticSyncedAt, null);
  assert.equal(collections[2].domesticSyncedAt, '2026-07-28T11:00:00.000Z');
});

test('releases a later GitHub title correction after the same thirty-minute delay', () => {
  const now = Date.parse('2026-07-28T12:00:00.000Z');
  const collections = [{
    id: 'title-correction',
    githubSyncedAt: new Date(now - DOMESTIC_DELAY_MS).toISOString(),
    domesticSyncedAt: '2026-07-28T11:00:00.000Z'
  }];

  assert.equal(releaseEligibleCollections(collections, now), 1);
  assert.equal(collections[0].domesticSyncedAt, '2026-07-28T12:00:00.000Z');
});
