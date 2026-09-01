import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const prohibited = /\b(?:demo|preview|draft|planned|coming[ -]soon|future[ -]system)\b|\b(?:Spotify|Apple Podcasts|YouTube)\b|\b\d{1,3}%\b/i;

test('homepage contains no unavailable states, fake values, or platform promises', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.doesNotMatch(`${html}\n${js}`, prohibited);
  assert.doesNotMatch(html, /data-demo|class="ledger"|hero-dock|demo-banner/);
});

test('editorial narrative is singular, subject-first, and chaptered', async () => {
  const html = await read('index.html');
  assert.match(html, /<h1[^>]*>[\s\S]*Hollywood[\s\S]*technology/i);
  for (const id of ['top', 'past', 'present', 'forecast', 'season', 'host', 'method']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} chapter`);
  }
  assert.equal((html.match(/ian-mcpherson\.webp/g) || []).length, 1);
  assert.match(html, /<span class="operating-system">Operating System<\/span>/);
  const questions = [...html.matchAll(/<p class="editorial-question">([^<]+)<\/p>/g)].map((match) => match[1].trim());
  assert.equal(questions.length, 8);
  assert.equal(new Set(questions).size, 8, 'each question is narrated once');
});

test('mobile contract is concise and every authored target is at least 44px', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('src/style.css')]);
  assert.equal((html.match(/data-question-call/g) || []).length, 16);
  assert.match(css, /--target:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*\.season-contract\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /@keyframes|animation\s*:/);
});

test('choice, canonical share, native details, and keyboard code remain', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.match(html, /name="private-forecast"/);
  assert.match(html, /rel="canonical"/);
  assert.equal((html.match(/<details/g) || []).length, 7);
  for (const term of ['localStorage', 'navigator.share', 'navigator.clipboard', "event.key === 'Escape'"]) assert.match(js, new RegExp(term.replace('.', '\\.')));
});
