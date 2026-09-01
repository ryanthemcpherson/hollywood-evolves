import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('first screen is a semantic three-act episode cut with truthful distribution', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.match(html, /The technologies that changed Hollywood—and the odds on what changes next\./);
  assert.match(html, /role="tablist"[^>]*aria-label="Episode acts"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  for (const act of ['Past', 'Present', 'Forecast']) assert.match(html, new RegExp(`<b>${act}<\\/b>`, 'i'));
  assert.equal((html.match(/class="act-explanation/g) || []).length, 3);
  assert.match(js, /aria-selected/);
  assert.doesNotMatch(js, /setInterval|autoplay/i);
  assert.equal((html.match(/class="platform-item"/g) || []).length, 3);
  for (const platform of ['Spotify', 'Apple Music', 'YouTube']) assert.match(html, new RegExp(`>\\s*${platform}\\s*<`));
  assert.equal((html.match(/>Link pending/g) || []).length, 3);
  assert.doesNotMatch(html, /Apple Podcasts|href="[^"]+"[^>]*class="platform-item"/);
  assert.equal((html.match(/class="primary-action"/g) || []).length, 1);
});

test('the semantic tabs are the single three-act narrative instrument', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /class="act-stage"/);
  for (const [ordinal, act, descriptor] of [
    ['01', 'Past', 'Constraint'],
    ['02', 'Present', 'Signal'],
    ['03', 'Forecast', 'Call'],
  ]) {
    assert.match(html, new RegExp(`role="tab"[\\s\\S]*?${ordinal}[\\s\\S]*?${act}[\\s\\S]*?${descriptor}[\\s\\S]*?<\\/button>`, 'i'));
  }
});

test('Episode 01 destination placeholders are truthful semantic non-links', async () => {
  const html = await read('index.html');
  assert.match(html, /Episode 01 destinations/);
  assert.equal((html.match(/>Link pending</g) || []).length, 3);
  assert.equal((html.match(/data-platform=/g) || []).length, 3);
  assert.equal((html.match(/data-state="pending"/g) || []).length, 3);
  assert.equal((html.match(/data-url=""/g) || []).length, 3);
  assert.doesNotMatch(html, /Distribution \/ pending URLs|>\s*Pending\s*</);
});

test('first screen uses built geometry and discloses illustrative data without JavaScript', async () => {
  const html = await read('index.html');
  assert.match(html, /ILLUSTRATIVE FORECAST DATA · NOT LIVE/);
  assert.match(html, /class="episode-instrument"/);
  assert.doesNotMatch(html, /supply-instrument|Media supply chain · physical to cloud/i);
  assert.match(html, /<noscript[^>]*>[\s\S]*illustrative/i);
});

test('progressive hydration renders three views, evidence, outcome, and eight distinct atlas splits safely', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.match(js, /fetch\(['"]\/api\/demo-state/);
  assert.match(js, /response\.ok/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML/);
  for (const label of ['Guest', 'Community', 'Research System']) assert.match(js, new RegExp(label));
  assert.match(js, /Demo data unavailable/);
  assert.match(js, /Unresolved \(demo\)/);
  assert.equal((html.match(/data-question-id=/g) || []).length, 8);
  assert.match(js, /state\.questions/);
  assert.match(js, /yes.*no|no.*yes/s);
});

test('atlas exposes eight native contract affordances and a mobile browse cue', async () => {
  const html = await read('index.html');
  assert.equal((html.match(/class="contract-affordance"/g) || []).length, 8);
  assert.equal((html.match(/>Contract \+</g) || []).length, 8);
  assert.match(html, /class="atlas-cue"[^>]*>Browse all 8 questions →</);
});

test('the single portrait has an explicit responsive face-safe crop', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('src/style.css')]);
  assert.equal((html.match(/ian-mcpherson\.webp/g) || []).length, 1);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.host img\s*\{[^}]*object-position:\s*50% 34%/);
});
