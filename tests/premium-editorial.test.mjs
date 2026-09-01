import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const prohibited = /\b(?:demo|preview|draft|planned|coming[ -]soon|future[ -]system)\b|\b(?:Spotify|Apple Podcasts|YouTube)\b|\b\d{1,3}%\b/i;

test('homepage contains no unavailable states, fake values, or platform promises', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.doesNotMatch(`${html}\n${js}`, prohibited);
  assert.doesNotMatch(html, /data-demo|class="ledger"|hero-dock|demo-banner/);
  assert.doesNotMatch(html, /\bpartnership with\b|\bin partnership\b/i);
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
  assert.match(html, /Editorial question pool/i);
  assert.doesNotMatch(html, /Season one editorial slate/i);
  assert.doesNotMatch(html, /Streaming began by removing commercial breaks/i);
  assert.match(html, /Subscription streaming sold viewers an ad-free alternative/);
  assert.match(html, /private reader call/i);
  assert.match(html, /not (?:an? )?(?:episode )?probability ledger/i);
});

test('hero explains the one-way-to-feedback shift with a semantic control map', async () => {
  const html = await read('index.html');
  const hero = html.match(/<section class="hero\b[\s\S]*?<\/section>/)?.[0];
  assert.ok(hero, 'hero section exists');
  assert.equal(hero.includes('supply-instrument'), false, 'hero must not retain .supply-instrument');
  assert.doesNotMatch(hero, /<svg\b/, 'hero must not contain SVG');
  assert.match(hero, /<figure class="control-map"(?:\s|>)/);
  const flows = [...hero.matchAll(/<(ol|ul)\b[^>]*class="control-map__stages[^\"]*"[^>]*>([\s\S]*?)<\/\1>/g)]
    .map(([, element, content]) => ({
      element,
      stages: [...content.matchAll(/<li[^>]*>([^<]+)<\/li>/g)].map(([, stage]) => stage.trim()),
    }));
  assert.deepEqual(flows, [
    { element: 'ol', stages: ['Studio', 'Release', 'Audience'] },
    { element: 'ul', stages: ['Production', 'Cloud', 'Audience'] },
  ]);
  assert.match(hero, /<dt>Then<\/dt>[\s\S]*?<ol\b/);
  assert.match(hero, /<dt>Now<\/dt>[\s\S]*?<ul\b/);
  assert.match(hero, /<figcaption[^>]*>A one-way pipeline became a feedback system\.<\/figcaption>/);
});

test('mobile contract is concise and every authored target is at least 44px', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('src/style.css')]);
  assert.doesNotMatch(html, /data-question-call|compact-call|question-0[1-8]-call/);
  assert.doesNotMatch(css, /compact-call/);
  assert.match(css, /--target:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*\.season-contract\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /@keyframes|animation\s*:/);
  assert.match(css, /\.season-slate summary::after\s*\{[^}]*content:\s*"\+"/);
  assert.match(css, /\.season-slate details\[open\]>summary::after\s*\{[^}]*content:\s*"−"/);
});

test('choice, canonical share, native details, and keyboard code remain', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.match(html, /name="private-forecast"/);
  assert.match(html, /rel="canonical"/);
  assert.equal((html.match(/<details/g) || []).length, 7);
  for (const term of ['localStorage', 'navigator.share', 'navigator.clipboard', "event.key === 'Escape'"]) assert.match(js, new RegExp(term.replace('.', '\\.')));
});
