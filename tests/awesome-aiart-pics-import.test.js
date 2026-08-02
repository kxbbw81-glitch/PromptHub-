const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../scripts/import-awesome-aiart-pics-prompts.js');

const COMPLETE_PROMPT = 'Create a photorealistic editorial portrait of a woman standing beside a tall window in a calm city apartment. Use soft morning light, natural skin texture, a tailored ivory suit, shallow depth of field, subtle film grain, balanced negative space, realistic fabric detail, a 50mm lens perspective, and a clean refined composition without logos, watermarks, or distorted hands. Aspect ratio 4:5.';

function markdown({ title = '晨光城市人像', source = 'https://x.com/example/status/123', prompt = COMPLETE_PROMPT } = {}) {
  return `### [${title}](https://aiart.pics/prompt/morning-city-portrait)\n\n**作者**: [@Example](https://x.com/example)\n\n**来源**: [X](${source})\n\n<img src="https://img1.aiart.pics/images/prompts/20260101/morning-city-portrait-1.jpg" width="500" alt="${title}">\n\n\`\`\`\nPrompt: ${prompt}\n\`\`\`\n`;
}

test('imports a complete attributed CC BY image prompt', () => {
  const result = importer.importEntries(markdown(), [], '2026-08-02T12:00:00.000Z');
  assert.equal(result.accepted.length, 1);
  const item = result.accepted[0];
  assert.equal(item.license, 'CC BY 4.0');
  assert.equal(item.sourceRepository, 'Jermic/awesome-aiart-pics-prompts');
  assert.equal(item.sourceAuthor, '@Example');
  assert.equal(item.originalSourceUrl, 'https://x.com/example/status/123');
  assert.match(item.image, /^https:\/\/img1\.aiart\.pics\//);
  assert.equal(item.aspectRatio, '4:5');
});

test('rejects tutorials, restricted IP, incomplete prompts, and duplicates', () => {
  const existing = [{ id: 'existing', sourceUrl: 'https://aiart.pics/prompt/morning-city-portrait', prompt: COMPLETE_PROMPT }];
  const duplicate = importer.importEntries(markdown(), existing);
  const tutorial = importer.importEntries(markdown({ title: '时尚人像工作流' }), []);
  const restricted = importer.importEntries(markdown({ prompt: `${COMPLETE_PROMPT}\nCreate a Disney princess character.` }), []);
  const restrictedLocalized = importer.importEntries(markdown({ title: '盗梦空间城市人像' }), []);
  const incomplete = importer.importEntries(markdown({ prompt: 'short prompt' }), []);
  assert.equal(duplicate.accepted.length, 0);
  assert.equal(tutorial.accepted.length, 0);
  assert.equal(restricted.accepted.length, 0);
  assert.equal(restrictedLocalized.accepted.length, 0);
  assert.equal(incomplete.accepted.length, 0);
});
