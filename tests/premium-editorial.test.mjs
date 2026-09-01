import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
test('composition is singular, truthful, and hard-edged', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('src/style.css')]);
  assert.equal((html.match(/ian-mcpherson\.webp/g) || []).length, 1);
  assert.equal((html.match(/data-question-id=/g) || []).length, 8);
  assert.equal((html.match(/class="primary-action"/g) || []).length, 1);
  assert.doesNotMatch(html, /Apple Podcasts|supply-instrument/);
  assert.doesNotMatch(css, /gradient|box-shadow|border-radius|@keyframes|animation\s*:/i);
});
test('native disclosure, local choice, sharing, and accessibility contracts remain', async () => {
  const [html, js, css] = await Promise.all([read('index.html'), read('src/main.js'), read('src/style.css')]);
  assert.equal((html.match(/<details/g) || []).length, 10);
  assert.equal((html.match(/class="atlas[^"]*"[\s\S]*?<details/g) || []).length >= 1, true);
  assert.match(html, /name="private-forecast"/); assert.match(css, /--target:\s*44px/);
  assert.doesNotMatch(js, /\.style\.width\s*=|setAttribute\(["']style["']/);
  for (const term of ['localStorage', 'navigator.share', 'navigator.clipboard', "event.key === 'Escape'"]) assert.match(js, new RegExp(term.replace('.', '\\.')));
});
