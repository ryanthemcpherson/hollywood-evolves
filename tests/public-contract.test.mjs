import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
test('public surface explicitly labels illustrative state and pending non-links', async () => {
  const html = await read('index.html');
  assert.match(html, /ILLUSTRATIVE FORECAST DATA · NOT LIVE/);
  assert.equal((html.match(/class="platform-item"/g) || []).length, 3);
  assert.match(html, /Episode 01 destinations · no episode published/i);
  assert.match(html, /Apple Music/); assert.doesNotMatch(html, /Apple Podcasts/); assert.match(html, /Demo data unavailable/);
});
test('local reader call is separate from demo state', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.match(html, /private call · browser only/i); assert.match(html, /Separate from every DEMO value/);
  assert.match(js, /he-private-forecast/); assert.doesNotMatch(js, /localStorage\.(?:setItem|getItem)\([^)]*demo/i);
});
