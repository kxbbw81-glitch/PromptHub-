const fs = require('node:fs');
const path = require('node:path');
const { reclassifyCollections } = require('./category-rules');

const filePath = path.join(__dirname, '../data/collections.json');
const original = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const result = reclassifyCollections(original);

if (result.changed) {
  result.payload.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(result.payload, null, 2)}\n`);
}

console.log(JSON.stringify({ changed: result.changed, total: result.payload.collections.length }));
