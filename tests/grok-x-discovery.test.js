const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const discovery = require('../scripts/grok-x-discovery.js');

const COMPLETE_PROMPT = 'Create a premium cinematic fashion portrait of an adult woman standing in a quiet modern gallery at blue hour. Use soft directional window light, a 50mm lens, shallow depth of field, natural skin texture, tailored charcoal clothing, subtle reflective stone surfaces, quiet luxury styling, gentle film grain, balanced negative space, photorealistic details, and no text, watermark, logo, extra fingers, distorted hands, plastic skin, or over-sharpening.';

test('builds a public-only Grok search prompt with strict acceptance criteria', () => {
  const prompt = discovery.buildDiscoveryPrompt({
    lookbackDays: 7,
    maxCandidatesPerQuery: 5,
    maxCandidatesTotal: 10,
    recognitionSignals: ['Prompt:'],
    excludedSignals: ['tutorial only'],
    discoveryQueries: ['Find image prompts']
  });

  assert.match(prompt, /public posts/i);
  assert.match(prompt, /private bookmarks, home timelines/i);
  assert.match(prompt, /specific x\.com/);
  assert.match(prompt, /at most 10 candidates total/);
  assert.match(prompt, /"schemaVersion":1/);
  assert.match(prompt, /grok-cli-public-x-search/);
  assert.match(prompt, /Do not include githubSyncedAt/);
});

test('scans a rotating priority creator batch before general keyword queries', () => {
  const creators = discovery.selectCreatorBatch([
    { handle: 'standard', tier: 'standard', focus: ['tools'] },
    { handle: 'core_a', tier: 'core', focus: ['image'] },
    { handle: 'core_b', tier: 'core', focus: ['video'] }
  ], 2, 0);
  const prompt = discovery.buildDiscoveryPrompt({
    lookbackDays: 7,
    maxCandidatesPerQuery: 5,
    maxCandidatesPerCreator: 1,
    maxCandidatesTotal: 10,
    recognitionSignals: ['Prompt:'],
    excludedSignals: ['tutorial only'],
    discoveryQueries: ['Find image prompts']
  }, creators);

  assert.deepEqual(creators.map(creator => creator.handle), ['core_a', 'core_b']);
  assert.match(prompt, /Priority creator phase[\s\S]*from:core_a/);
  assert.match(prompt, /Keyword phase \(run only after the creator phase\)/);
});

test('accepts the official handoff images and image fields', () => {
  const result = discovery.acceptCandidates([{
    id: 'x_900',
    sourceUrl: 'https://x.com/example/status/900',
    prompt: COMPLETE_PROMPT,
    mediaType: 'image',
    images: ['https://pbs.twimg.com/media/official.jpg?format=jpg&name=large'],
    image: 'https://pbs.twimg.com/media/official.jpg?format=jpg&name=large'
  }], [], '2026-07-29T10:00:00.000Z');

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].image, 'https://pbs.twimg.com/media/official.jpg?format=jpg&name=large');
  assert.deepEqual(result.accepted[0].images, ['https://pbs.twimg.com/media/official.jpg?format=jpg&name=large']);
});

test('keeps a direct video URL and poster for video-only collections', () => {
  const result = discovery.acceptCandidates([{
    sourceUrl: 'https://x.com/example/status/901',
    prompt: COMPLETE_PROMPT,
    mediaType: 'video',
    images: [],
    videoPoster: 'https://pbs.twimg.com/amplify_video_thumb/example.jpg',
    videoUrl: 'https://video.twimg.com/amplify_video/example.mp4',
    category: '视频'
  }], [], '2026-07-29T10:00:00.000Z');

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].videoPoster, 'https://pbs.twimg.com/amplify_video_thumb/example.jpg');
  assert.equal(result.accepted[0].videoSourceUrl, 'https://video.twimg.com/amplify_video/example.mp4');
  assert.equal(result.accepted[0].category, '视频提示词');
});

test('replaces untrusted Grok category labels with the shared Chinese rules', () => {
  const result = discovery.acceptCandidates([{
    sourceUrl: 'https://x.com/example/status/902',
    prompt: COMPLETE_PROMPT,
    mediaType: 'image',
    image: 'https://pbs.twimg.com/media/fashion.jpg',
    category: 'portrait',
    tags: ['fashion', 'couture', 'editorial']
  }], []);

  assert.equal(result.accepted[0].category, '时尚');
});

test('stores an e-commerce use-case type without losing video media metadata', () => {
  const result = discovery.acceptCandidates([{
    sourceUrl: 'https://x.com/example/status/903',
    prompt: `${COMPLETE_PROMPT} Create an authentic UGC product review and unboxing for a premium thermos.`,
    mediaType: 'video',
    videoPoster: 'https://pbs.twimg.com/amplify_video_thumb/commerce.jpg',
    videoUrl: 'https://video.twimg.com/amplify_video/commerce.mp4'
  }], []);

  assert.equal(result.accepted[0].category, '电商视觉');
  assert.equal(result.accepted[0].commerceType, 'UGC / 口碑');
  assert.equal(result.accepted[0].mediaType, 'video');
});

test('the test configuration caps discovery at ten candidates with enough agent turns', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/grok-x-discovery.json'), 'utf8'));
  const creators = discovery.loadCreatorLibrary(path.join(__dirname, '../config/grok-x-creators.json'));
  assert.equal(config.maxCandidatesTotal, 10);
  assert.equal(config.maxTurns, 12);
  assert.equal(config.creatorBatchSize, 5);
  assert.ok(config.recognitionSignals.includes('Logo/VI proposal'));
  assert.match(config.discoveryQueries.at(-1), /brand identity, logo design, visual identity/i);
  assert.ok(creators.length >= 30);
  assert.ok(creators.some(creator => creator.handle === 'op7418'));
  assert.ok(creators.some(creator => creator.handle === 'GrayNoteLab' && creator.tier === 'core'));
});

test('extracts candidate JSON from a Grok CLI response envelope', () => {
  const payload = discovery.extractCandidatePayload({
    output: [{ content: [{ text: JSON.stringify({ candidates: [{ sourceUrl: 'https://x.com/example/status/123' }] }) }] }]
  });

  assert.equal(payload.candidates[0].sourceUrl, 'https://x.com/example/status/123');
});

test('extracts a schema handoff preceded by Grok explanatory text', () => {
  const payload = discovery.extractCandidatePayload('Searching public X now.{"schemaVersion":1,"candidates":[{"sourceUrl":"https://x.com/example/status/128"}]}');

  assert.equal(payload.candidates[0].sourceUrl, 'https://x.com/example/status/128');
});

test('accepts a direct official candidate handoff object', () => {
  const payload = discovery.extractCandidatePayload({
    schemaVersion: 1,
    producer: 'grok-cli-public-x-search',
    candidates: [{ sourceUrl: 'https://x.com/example/status/123' }]
  });

  assert.equal(payload.candidates.length, 1);
});

test('accepts a collection snapshot as a recovery import without trusting its sync fields', () => {
  const payload = discovery.extractCandidatePayload({
    collections: [{
      sourceUrl: 'https://x.com/example/status/124',
      githubSyncedAt: 'untrusted'
    }]
  });

  assert.equal(payload.candidates[0].sourceUrl, 'https://x.com/example/status/124');
});

test('keeps the public-search cap but evaluates every record in a recovery snapshot', () => {
  const candidates = Array.from({ length: 12 }, (_, index) => ({ sourceUrl: `https://x.com/example/status/${index}` }));

  assert.equal(discovery.selectCandidatesForImport({ candidates }, { candidates }, 10).length, 10);
  assert.equal(discovery.selectCandidatesForImport({ collections: candidates }, { candidates }, 10).length, 12);
});

test('accepts a UTF-8 BOM on CLI output files', () => {
  const text = `\uFEFF${JSON.stringify({ candidates: [{ sourceUrl: 'https://x.com/example/status/123' }] })}`;
  const payload = discovery.parseCliOutputText(text);
  assert.equal(payload.candidates.length, 1);
});

test('accepts an image candidate once and rejects source and prompt duplicates', () => {
  const candidate = {
    sourceUrl: 'https://x.com/example/status/123?ref=x',
    title: 'Gallery fashion portrait',
    prompt: `GPT Image 2 on ChatGPT ${COMPLETE_PROMPT}`,
    mediaType: 'image',
    imageUrls: ['https://pbs.twimg.com/media/example.jpg?format=jpg&name=large'],
    category: '人像',
    tags: ['cinematic'],
    model: 'GPT Image'
  };
  const first = discovery.acceptCandidates([candidate], [], '2026-07-29T10:00:00.000Z');
  assert.equal(first.accepted.length, 1);
  assert.doesNotMatch(first.accepted[0].prompt, /^GPT Image 2/);
  assert.equal(first.accepted[0].id, 'grok_x_123');

  const repeatedSource = discovery.acceptCandidates([candidate], first.accepted);
  assert.equal(repeatedSource.accepted.length, 0);
  assert.equal(repeatedSource.rejected[0].reason, 'duplicate source URL');

  const repeatedPrompt = discovery.acceptCandidates([{ ...candidate, sourceUrl: 'https://x.com/another/status/456' }], first.accepted);
  assert.equal(repeatedPrompt.accepted.length, 0);
  assert.equal(repeatedPrompt.rejected[0].reason, 'duplicate prompt');
});

test('rejects incomplete prompts, feed URLs, and video records without a poster', () => {
  const result = discovery.acceptCandidates([
    { sourceUrl: 'https://x.com/i/bookmarks', prompt: COMPLETE_PROMPT, imageUrls: ['https://cdn.example.com/a.jpg'] },
    { sourceUrl: 'https://x.com/example/status/124', prompt: 'too short', imageUrls: ['https://cdn.example.com/a.jpg'] },
    { sourceUrl: 'https://x.com/example/status/125', prompt: COMPLETE_PROMPT, mediaType: 'video', imageUrls: [], videoPoster: '' }
  ], []);

  assert.deepEqual(result.rejected.map(item => item.reason), [
    'missing concrete X status URL',
    'prompt shorter than 160 characters',
    'missing HTTPS result media'
  ]);
});

test('the Grok runner is limited to public candidate discovery, not browser or Git automation', () => {
  const runner = fs.readFileSync(path.join(__dirname, '../scripts/run-grok-x-discovery.ps1'), 'utf8');
  assert.match(runner, /grok --prompt-file \$promptPath/);
  assert.match(runner, /No browser automation, cookies, X API calls, Git writes/);
  assert.match(runner, /--no-memory --no-plan --no-subagents --verbatim/);
  assert.match(runner, /for \(\$attempt = 1; \$attempt -le 2/);
  assert.match(runner, /Join-Path \$projectPath 'staging\\grok-x-cli-output\.json'/);
  assert.match(runner, /Grok CLI exited with code/);
  assert.doesNotMatch(runner, /bookmarks|git push|api\.x\.com/i);
});
