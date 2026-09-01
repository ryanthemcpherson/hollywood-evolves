import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('homepage publishes only the editorial experience that exists', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.doesNotMatch(`${html}\n${js}`, /\b(?:demo|preview|draft|planned|coming[ -]soon|future[ -]system)\b|\b(?:Spotify|Apple Podcasts|YouTube)\b|\b\d{1,3}%\b/i);
  assert.doesNotMatch(html, /data-demo|hero-dock|data-instrument-rotation|class="ledger"/);
  assert.match(html, /Episode 01/);
  assert.match(html, /December 31, 2029/);
  assert.match(html, /Browser-local reader call/);
  assert.match(html, /rel="canonical"/);
  assert.match(js, /localStorage/);
});

test('homepage uses one editorial slate and complete question contracts', async () => {
  const html = await read('index.html');
  assert.equal((html.match(/<details/g) || []).length, 7);
  assert.equal((html.match(/class="editorial-question"/g) || []).length, 8);
  assert.equal((html.match(/<dt>Threshold<\/dt>/g) || []).length, 8);
  assert.equal((html.match(/<dt>Deadline<\/dt>/g) || []).length, 8);
  assert.equal((html.match(/<dt>Evidence<\/dt>/g) || []).length, 8);
  assert.equal((html.match(/data-question-call/g) || []).length, 16);
  assert.equal((html.match(/ian-mcpherson\.webp/g) || []).length, 1);
  assert.match(html, /<span class="operating-system">Operating System<\/span>/);
});
