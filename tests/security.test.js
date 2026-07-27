const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const security = require('../js/security.js');

test('escapes imported prompt text before it is rendered as HTML', () => {
  const unsafe = '<img src=x onerror=alert(1)>"\'&';

  assert.equal(
    security.escapeHtml(unsafe),
    '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;'
  );
});

test('only allows HTTP(S) image URLs from imported content', () => {
  const fallback = 'https://picsum.photos/seed/fallback/500/500';

  assert.equal(security.sanitizeImageUrl('https://cdn.example.com/image.webp', fallback), 'https://cdn.example.com/image.webp');
  assert.equal(security.sanitizeImageUrl('javascript:alert(1)', fallback), fallback);
  assert.equal(security.sanitizeImageUrl('data:image/svg+xml,<svg onload=alert(1)>', fallback), fallback);
  assert.equal(security.sanitizeImageUrl('file:///C:/private.png', fallback), fallback);
});

test('removes unsafe, duplicate, and excessive imported image URLs', () => {
  const safeUrls = security.sanitizeImageUrls([
    'https://cdn.example.com/a.webp',
    'javascript:alert(1)',
    'https://cdn.example.com/a.webp',
    'https://cdn.example.com/b.webp'
  ]);

  assert.deepEqual(safeUrls, [
    'https://cdn.example.com/a.webp',
    'https://cdn.example.com/b.webp'
  ]);
});

test('Cloudflare static assets enforce baseline browser security headers', () => {
  const headers = fs.readFileSync(path.join(__dirname, '../_headers'), 'utf8');

  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(headers, /Content-Security-Policy: default-src 'self';/);
  assert.match(headers, /frame-ancestors 'none';/);
});

test('interactive pages do not rely on inline event handlers or inline executable scripts', () => {
  const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const generator = fs.readFileSync(path.join(__dirname, '../scripts/generate-seo-pages.js'), 'utf8');

  assert.doesNotMatch(app, /\bon(?:click|error|load)=/);
  assert.doesNotMatch(app, /node\.innerHTML\s*=\s*attrs\[key\]/);
  assert.doesNotMatch(app, /toast\.innerHTML\s*=/);
  assert.doesNotMatch(index, /\bon(?:click|error|load)=/);
  assert.doesNotMatch(generator, /\bon(?:click|error|load)=/);
  assert.match(generator, /<script src="\.\.\/\.\.\/js\/seo-page\.js/);
});
