/**
 * Guards Snapshot's small browser UI contract and visible button feedback.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('Snapshot actions have raised and visibly depressed button states', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

  assert.match(html, /id="copyButton"[^>]*class="primary"/);
  assert.match(html, /styles\.css\?v=0\.7\.8/);
  assert.match(html, /app\.js\?v=0\.7\.8/);
  assert.match(css, /0 4px 0 #66716b/);
  assert.match(css, /button:active:not\(:disabled\)/);
  assert.match(css, /transform: translateY\(4px\)/);
});
