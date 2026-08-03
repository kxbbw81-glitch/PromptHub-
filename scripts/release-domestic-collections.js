const fs = require('node:fs');
const path = require('node:path');

const COLLECTIONS_PATH = path.join(__dirname, '..', 'data', 'collections.json');
const DOMESTIC_DELAY_MS = 30 * 60 * 1000;

function releaseEligibleCollections(collections, now = Date.now()) {
  const releasedAt = new Date(now).toISOString();
  let released = 0;

  for (const item of collections) {
    const syncedAt = Date.parse(item.githubSyncedAt || item.collectedAt || '');
    const domesticSyncedAt = Date.parse(item.domesticSyncedAt || '');
    if (!Number.isFinite(syncedAt) || now - syncedAt < DOMESTIC_DELAY_MS) continue;
    if (Number.isFinite(domesticSyncedAt) && domesticSyncedAt >= syncedAt) continue;
    item.domesticSyncedAt = releasedAt;
    released += 1;
  }

  return released;
}

function run() {
  const payload = JSON.parse(fs.readFileSync(COLLECTIONS_PATH, 'utf8'));
  const collections = Array.isArray(payload) ? payload : payload.collections;
  if (!Array.isArray(collections)) throw new Error('collections.json format is invalid');

  const released = releaseEligibleCollections(collections);
  if (!released) {
    console.log('No domestic collections are due.');
    return false;
  }

  if (Array.isArray(payload)) {
    fs.writeFileSync(COLLECTIONS_PATH, JSON.stringify(collections, null, 2) + '\n');
  } else {
    payload.updatedAt = new Date().toISOString();
    fs.writeFileSync(COLLECTIONS_PATH, JSON.stringify(payload, null, 2) + '\n');
  }
  console.log(`Released ${released} collection(s) to the domestic site.`);
  return true;
}

if (require.main === module) run();

module.exports = { DOMESTIC_DELAY_MS, releaseEligibleCollections };
