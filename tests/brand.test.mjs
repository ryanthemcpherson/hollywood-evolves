import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const pages = ['index.html', 'poll.html', 'public/accessibility.html', 'public/privacy.html', 'public/terms.html'];
const fontFaces = [
  ['DM Sans', 'public/fonts/dm-sans-latin-variable.woff2', '400 600'],
  ['DM Mono', 'public/fonts/dm-mono-latin-400.woff2', '400'],
  ['DM Mono', 'public/fonts/dm-mono-latin-500.woff2', '500'],
  ['Newsreader', 'public/fonts/newsreader-latin-variable.woff2', '400 600'],
];
const fontLicenses = ['public/fonts/licenses/dm-sans-OFL.txt', 'public/fonts/licenses/dm-mono-OFL.txt', 'public/fonts/licenses/newsreader-OFL.txt'];

function metaContent(html, attribute, value) {
  return html.match(new RegExp(`<meta[^>]+${attribute}="${value}"[^>]+content="([^"]+)"`))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+${attribute}="${value}"`))?.[1];
}

test('the brand contract is complete and references approved assets', () => {
  for (const path of ['DESIGN.md', 'public/brand/brand.json', 'public/brand/brand.css', 'public/brand/wordmark.svg', 'public/brand/wordmark-inverse.svg', 'public/brand/monogram.svg', 'public/brand/social-card.svg', 'public/brand/social-card.png']) {
    assert.equal(existsSync(resolve(root, path)), true, `Missing canonical brand file: ${path}`);
  }

  const brand = JSON.parse(read('public/brand/brand.json'));
  assert.deepEqual(brand.colors, {
    paper: '#f3efe6',
    paperAlt: '#e5ded1',
    ink: '#171715',
    muted: '#625d55',
    rule: '#aaa398',
    accent: '#a8342a',
    signal: '#78a9b5',
    white: '#faf7f0',
  });
  assert.equal(brand.assets.wordmark, '/brand/wordmark.svg');
  assert.equal(brand.assets.wordmarkInverse, '/brand/wordmark-inverse.svg');
  assert.equal(brand.assets.monogram, '/brand/monogram.svg');
  assert.equal(brand.assets.socialCard, '/brand/social-card.png');
});

test('brand fonts and licenses are local, declared, and absent from external page dependencies', () => {
  const brandCss = read('public/brand/brand.css');
  for (const licensePath of fontLicenses) {
    assert.equal(existsSync(resolve(root, licensePath)), true, `Missing font license: ${licensePath}`);
    assert.ok(read(licensePath).length > 1000, `${licensePath} does not contain the full license`);
  }
  for (const [family, fontPath, weightRange] of fontFaces) {
    assert.equal(existsSync(resolve(root, fontPath)), true, `Missing local font: ${fontPath}`);
    const fileName = fontPath.split('/').at(-1);
    const declaration = brandCss.match(new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${family}"[^}]*${fileName.replace('.', '\\.')}[^}]*\\}`, 's'))?.[0] ?? '';
    assert.match(declaration, new RegExp(`url\\("/fonts/${fileName}"\\)\\s*format\\("woff2"\\)`), `${family} must use its local WOFF2 asset`);
    assert.match(declaration, new RegExp(`font-weight:\\s*${weightRange.replace(' ', '\\s+')}`), `${family} has the wrong weight range`);
    assert.match(declaration, /font-display:\s*swap/, `${family} must use font-display: swap`);
  }
  assert.match(brandCss, /font-optical-sizing:\s*auto/, 'Newsreader optical sizing must remain enabled');

  for (const page of [...pages, 'public/404.html']) {
    const html = read(page);
    assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com|rel="preconnect"[^>]+google|<link[^>]+https?:\/\/[^>]+rel="stylesheet"/i, `${page} includes an external font dependency`);
  }
});

test('every page uses the canonical palette, wordmark, and rich-preview image', () => {
  const brand = JSON.parse(read('public/brand/brand.json'));
  const absoluteSocialCard = `${brand.canonicalUrl}${brand.assets.socialCard}`;

  for (const page of pages) {
    const html = read(page);
    assert.equal(metaContent(html, 'name', 'theme-color'), brand.colors.paper, `${page} has the wrong theme color`);
    const wordmark = page === 'poll.html' ? 'wordmark-inverse' : 'wordmark';
    assert.match(html, new RegExp(`<img[^>]+src="/brand/${wordmark}\\.svg"[^>]+alt="Hollywood Evolves"`), `${page} does not use the correct canonical wordmark`);
    assert.equal(metaContent(html, 'property', 'og:image'), absoluteSocialCard, `${page} has the wrong Open Graph image`);
    assert.equal(metaContent(html, 'name', 'twitter:image'), absoluteSocialCard, `${page} has the wrong Twitter image`);
  }

  const manifest = JSON.parse(read('public/site.webmanifest'));
  assert.equal(manifest.background_color, brand.colors.paper);
  assert.equal(manifest.theme_color, brand.colors.paper);
});

test('stylesheets consume shared brand tokens instead of redefining the palette', () => {
  const brandCss = read('public/brand/brand.css');
  for (const token of ['paper', 'paper-alt', 'ink', 'muted', 'rule', 'accent', 'signal', 'white', 'font-sans', 'font-serif', 'font-mono']) {
    assert.match(brandCss, new RegExp(`--brand-${token}:`), `Missing --brand-${token}`);
  }

  for (const stylesheet of ['src/style.css', 'public/legal.css']) {
    const css = read(stylesheet);
    assert.match(css, /^@import url\("\/brand\/brand\.css"\);/, `${stylesheet} must import canonical tokens`);
    assert.doesNotMatch(css, /--(?:ivory|paper|ink|muted|rule|red|blue|white):#[0-9a-f]{6}/i, `${stylesheet} redefines brand colors`);
  }
});

test('dark surfaces use the approved inverse wordmark without flattening its colors', () => {
  const home = read('index.html');
  const poll = read('poll.html');
  const brandCss = read('public/brand/brand.css');

  assert.match(home, /<footer>[\s\S]*?src="\/brand\/wordmark-inverse\.svg"/);
  assert.match(poll, /<header class="poll-header">[\s\S]*?src="\/brand\/wordmark-inverse\.svg"/);
  assert.doesNotMatch(brandCss, /filter:\s*brightness\(0\)\s*invert\(1\)/);
});
