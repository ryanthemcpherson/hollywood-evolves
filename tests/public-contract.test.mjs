import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicSurfaceFiles = [
  'index.html',
  'poll.html',
  'public/404.html',
  'public/accessibility.html',
  'public/privacy.html',
  'public/terms.html',
  'src/main.js',
  'src/poll.js',
];

// Demo presentation is allowed only under the explicit labeling contract.
const forbiddenNarration = /\b(?:preview|draft|planned|planning|upcoming|coming soon|in[ -]development|not (?:yet )?open|link pending|links will appear|when (?:activated|an audience question opens))\b/i;
const unlabeledDemo = /\bdemo\b(?![-— ]| ?—)/i;

test('every shipped public page and JavaScript string presents only current, available behavior', async () => {
  for (const relativePath of publicSurfaceFiles) {
    const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, forbiddenNarration, `${relativePath} contains roadmap or pre-release narration`);
    if (relativePath.endsWith('.html')) assert.doesNotMatch(source.replace(/DEMO[-— ]/gi, ''), unlabeledDemo, `${relativePath} mentions demo data without an explicit DEMO label`);
  }
});

test('homepage keeps explicit demo labeling, hero platform destinations, and no commentary controls', async () => {
  const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const selector of ['preview-stamp', 'distribution', 'platform-card', 'contributors', 'commentary-app', 'linkedin-login']) {
    assert.doesNotMatch(homepage, new RegExp(`class="[^"]*\\b${selector}\\b|id="${selector}"`), selector);
  }
  assert.match(homepage, /class="hero-dock"/, 'hero platform dock');
  for (const platform of ['Spotify', 'Apple Podcasts', 'YouTube']) assert.match(homepage, new RegExp(`class="hero-dock"[\\s\\S]*<li[^>]*>${platform}</li>`), `hero dock names ${platform}`);
  assert.doesNotMatch(homepage, /Apple Music|Netflix, Disney\+, Max, Peacock/);
  assert.match(homepage, /class="demo-banner"/, 'explicit demo banner');
  assert.match(homepage, /data-demo-ledger/, 'demo forecast ledger element');
  assert.match(homepage, /Episode 01/);
  assert.match(homepage, /December 31, 2029/);
  assert.match(homepage, /YES threshold/);
  assert.match(homepage, /Evidence/);
  assert.match(homepage, /localStorage/);
  assert.match(homepage, /class="operating-system"/);
});
