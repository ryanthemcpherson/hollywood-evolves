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

const forbiddenNarration = /\b(?:preview|demo|draft|planned|planning|upcoming|coming soon|in[ -]development|not (?:yet )?open|link pending|links will appear|when (?:activated|an audience question opens))\b/i;
const unavailableProducts = /\b(?:Spotify|Apple Music|YouTube|LinkedIn)\b/i;

test('every shipped public page and JavaScript string presents only current, available behavior', async () => {
  for (const relativePath of publicSurfaceFiles) {
    const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, forbiddenNarration, `${relativePath} contains roadmap or pre-release narration`);
    assert.doesNotMatch(source, unavailableProducts, `${relativePath} exposes an unavailable platform or contributor product`);
  }
});

test('homepage omits unavailable destinations, commentary controls, and unpublished forecast rows', async () => {
  const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const selector of ['preview-stamp', 'demo-banner', 'hero-dock', 'distribution', 'platform-card', 'contributors', 'commentary-app', 'linkedin-login']) {
    assert.doesNotMatch(homepage, new RegExp(`class="[^"]*\\b${selector}\\b|id="${selector}"`), selector);
  }
  assert.doesNotMatch(homepage, /data-demo-ledger|Spotify|Apple Music|YouTube/i, 'demo ledger or unavailable platform destination');
  assert.doesNotMatch(homepage, /<table[^>]+class="[^"]*\\bledger\\b/i, 'unpublished forecast ledger');
  assert.match(homepage, /Episode 01/);
  assert.match(homepage, /December 31, 2029/);
  assert.match(homepage, /YES threshold/);
  assert.match(homepage, /Evidence/);
  assert.match(homepage, /localStorage/);
  assert.match(homepage, /class="operating-system"/);
});

test('server and package expose no demo mode, demo-state route, or PostgreSQL dependency', async () => {
  const [server, packageSource, lock] = await Promise.all([
    readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(server, /DEMO_MODE|demo-state|DemoDataRepository|hollywood-evolves-demo/);
  assert.equal(Object.hasOwn(JSON.parse(packageSource).dependencies, 'pg'), false);
  const lockfile = JSON.parse(lock);
  assert.equal(Object.hasOwn(lockfile.packages[''].dependencies, 'pg'), false);
  assert.equal(Object.keys(lockfile.packages).some((name) => name === 'node_modules/pg' || name.startsWith('node_modules/pg-')), false);
});
