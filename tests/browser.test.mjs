import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import puppeteer from 'puppeteer-core';

let browser;
let child;
let origin;

async function newPage() {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(request.url())) request.abort();
    else request.continue();
  });
  return page;
}

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

before(async () => {
  const port = await availablePort();
  child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.stdout.on('data', (chunk) => { if (chunk.toString().includes('listening')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', (code) => reject(new Error(`Server exited (${code})`)));
  });
  origin = `http://127.0.0.1:${port}`;
  browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

after(async () => {
  await browser?.close();
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  }
});

test('binary private call is keyboard operable, local-only, and clearable', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.focus('#forecast-yes');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => localStorage.getItem('he-private-forecast')), 'yes');
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.$eval('#forecast-yes', (input) => input.checked), true);
  await page.click('#reset-forecast');
  assert.equal(await page.evaluate(() => localStorage.getItem('he-private-forecast')), null);
  assert.equal(await page.$$eval('input[name="private-forecast"]:checked', (nodes) => nodes.length), 0);
  await page.close();
});

test('forecast and navigation still work when browser storage is unavailable', async () => {
  const page = await newPage();
  await page.evaluateOnNewDocument(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(Storage.prototype, method, { configurable: true, value() { throw new DOMException('Storage denied', 'SecurityError'); } });
    }
  });
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.click('.binary-choices label');
  assert.equal(await page.$eval('#forecast-yes', (input) => input.checked), true);
  await page.click('.menu-button');
  assert.equal(await page.$eval('.menu-button', (el) => el.getAttribute('aria-expanded')), 'true');
  await page.close();
});

test('mobile navigation remains visible and the inert Menu control stays hidden without JavaScript', async () => {
  const page = await newPage();
  await page.setJavaScriptEnabled(false);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const navigation = await page.$eval('nav[aria-label="Primary navigation"]', (nav) => ({
    menuDisplay: getComputedStyle(nav.querySelector('.menu-button')).display,
    links: [...nav.querySelectorAll('.nav-links a')].map((link) => ({
      text: link.textContent.trim(),
      display: getComputedStyle(link).display,
      width: link.getBoundingClientRect().width,
      height: link.getBoundingClientRect().height,
    })),
  }));
  assert.equal(navigation.menuDisplay, 'none');
  assert.equal(navigation.links.length, 6);
  assert.ok(navigation.links.every(({ display, width, height }) => display !== 'none' && width > 0 && height > 0));
  await page.close();
});

test('subject-first cover leads with a coded forecast instrument and no host portrait', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const cover = await page.$eval('.hero', (hero) => ({
    headline: hero.querySelector('h1')?.textContent.trim(),
    portraitCount: hero.querySelectorAll('img').length,
    actions: [...hero.querySelectorAll('.actions a')].map((link) => link.textContent.trim()),
    timing: hero.querySelector('.timing')?.textContent,
    instrument: hero.querySelector('.instrument')?.textContent,
    svgCount: hero.querySelectorAll('.instrument svg').length,
  }));
  assert.match(cover.headline, /Hollywood’s next operating system/);
  assert.equal(cover.portraitCount, 0);
  assert.deepEqual(cover.actions, ['Preview the Episode 01 draft question', 'Explore season one ↓']);
  assert.match(cover.timing, /November 2026/);
  assert.match(cover.timing, /January 2027/);
  assert.match(cover.instrument, /STATE: UNRESOLVED/);
  assert.match(cover.instrument, /MEDIA PIPELINE/);
  assert.match(cover.instrument, /AUDIO/);
  assert.match(cover.instrument, /DISTRIBUTION/);
  assert.equal(cover.svgCount, 2);
  await page.close();
});

test('homepage has one portrait and three explicit subject chapters', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const structure = await page.evaluate(() => ({
    portraits: [...document.images].filter((img) => img.getAttribute('src')?.endsWith('/assets/ian-mcpherson.webp')).length,
    hostPortraits: [...document.querySelectorAll('#host img')].filter((img) => img.getAttribute('src')?.endsWith('/assets/ian-mcpherson.webp')).length,
    chapters: ['past', 'present', 'forecast'].map((id) => ({ id, marker: document.querySelector(`#${id} .chapter-marker b`)?.textContent.trim() })),
  }));
  assert.equal(structure.portraits, 1);
  assert.equal(structure.hostPortraits, 1);
  assert.deepEqual(structure.chapters, [{ id: 'past', marker: 'PAST' }, { id: 'present', marker: 'PRESENT' }, { id: 'forecast', marker: 'FORECAST' }]);
  await page.close();
});

test('forecast ledger is a native table with a screen-reader caption and scoped headers', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const ledger = await page.$eval('.ledger', (table) => ({
    tag: table.tagName,
    caption: table.querySelector('caption')?.textContent.trim(),
    columns: [...table.querySelectorAll('thead th')].map((cell) => [cell.textContent.trim(), cell.scope]),
    rows: [...table.querySelectorAll('tbody tr')].map((row) => [row.querySelector('th')?.textContent.trim(), row.querySelector('th')?.scope]),
  }));
  assert.equal(ledger.tag, 'TABLE');
  assert.equal(ledger.caption, 'Episode 01 forecast status');
  assert.deepEqual(ledger.columns, [['View', 'col'], ['Probability', 'col'], ['Status', 'col']]);
  assert.deepEqual(ledger.rows, [['Guest', 'row'], ['Community', 'row'], ['Research System', 'row']]);
  await page.close();
});

test('authored focus rings remain two-color on dark forecast, binary proxy, and red footer surfaces', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const samples = [];
  for (const selector of ['#share-forecast', '#forecast-yes', 'footer a']) {
    await page.focus(selector);
    samples.push(await page.$eval(selector, (element) => {
      const target = element.matches('.binary-choices input') ? element.nextElementSibling : element;
      const style = getComputedStyle(target);
      return { outlineColor: style.outlineColor, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
    }));
  }
  for (const sample of samples) {
    assert.equal(sample.outlineWidth, '3px');
    assert.equal(sample.outlineColor, 'rgb(251, 247, 238)');
    assert.match(sample.boxShadow, /rgb\(21, 22, 21\).*0px 0px 0px 6px/);
  }
  await page.close();
});

test('mobile menu manages keyboard, outside click, scroll lock, and focus', async () => {
  const page = await newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.focus('.menu-button');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.menu-button', (el) => el.getAttribute('aria-expanded')), 'true');
  assert.equal(await page.$eval('body', (el) => el.classList.contains('menu-open')), true);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.$eval('.menu-button', (el) => [el.getAttribute('aria-expanded'), document.activeElement === el]), ['false', true]);
  await page.click('.menu-button');
  await page.mouse.click(380, 500);
  await page.waitForFunction(() => document.activeElement === document.querySelector('.menu-button'));
  assert.deepEqual(await page.$eval('.menu-button', (el) => [el.getAttribute('aria-expanded'), document.activeElement === el]), ['false', true]);
  await page.click('.menu-button');
  await page.click('#forecast-yes');
  assert.deepEqual(await page.$eval('#forecast-yes', (el) => [document.querySelector('.menu-button').getAttribute('aria-expanded'), document.activeElement === el]), ['false', true]);
  await page.click('.menu-button');
  await page.click('#menu a');
  assert.equal(await page.$eval('.menu-button', (el) => el.getAttribute('aria-expanded')), 'false');
  await page.waitForFunction(() => document.activeElement?.id === 'past');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'past');
  await page.close();
});

test('native share receives the canonical forecast payload', async () => {
  const page = await newPage();
  await page.evaluateOnNewDocument(() => {
    navigator.share = async (data) => { window.__sharedForecast = data; };
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.click('#share-forecast');
  assert.deepEqual(await page.evaluate(() => window.__sharedForecast), {
    title: 'Hollywood Evolves — Episode 01 forecast',
    text: 'Consider the draft Episode 01 forecast on the future of ad-supported streaming plans.',
    url: 'https://hollywoodevolves.mcpherson.app/#forecast',
  });
  assert.equal(await page.$eval('#share-status', (el) => el.textContent), 'Sharing request completed.');
  await page.close();
});

test('share copies the canonical URL when native share is unavailable', async () => {
  const page = await newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__copiedForecast = value; } } });
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.click('#share-forecast');
  assert.equal(await page.evaluate(() => window.__copiedForecast), 'https://hollywoodevolves.mcpherson.app/#forecast');
  assert.equal(await page.$eval('#share-status', (el) => el.textContent), 'Draft question URL copied.');
  await page.close();
});

test('share reveals and selects a readonly URL when sharing APIs are unavailable', async () => {
  const page = await newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.click('#share-forecast');
  assert.deepEqual(await page.$eval('#share-url', (input) => ({
    hidden: input.closest('#share-fallback').hidden,
    readonly: input.readOnly,
    selected: input.selectionStart === 0 && input.selectionEnd === input.value.length,
    focused: document.activeElement === input,
  })), { hidden: false, readonly: true, selected: true, focused: true });
  assert.equal(await page.$eval('#share-status', (el) => el.textContent), 'Select and copy the draft question URL.');
  await page.close();
});

test('season ledger uses native disclosure rows and honest draft contracts', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const ledger = await page.$eval('.season-ledger', (el) => ({
    details: el.querySelectorAll(':scope > li > details').length,
    summaries: el.querySelectorAll(':scope > li > details > summary').length,
    states: [...el.querySelectorAll('.draft-state')].map((node) => node.textContent.trim()),
    contracts: [...el.querySelectorAll('.episode-draft')].map((node) => ({
      question: node.querySelector('.draft-question')?.textContent.trim(),
      terms: [...node.querySelectorAll('dt')].map((term) => term.textContent.trim()),
    })),
    text: el.textContent,
  }));
  assert.equal(ledger.details, 7);
  assert.equal(ledger.summaries, 7);
  assert.equal(ledger.states.length, 8);
  assert.ok(ledger.states.every((state) => state === 'Draft question / criteria in review / not open'));
  assert.ok(ledger.contracts.every(({ question, terms }) => question && ['YES threshold', 'Resolve by', 'Evidence / resolver'].every((term) => terms.includes(term))));
  assert.match(ledger.text, /fully synthetic performer receive top billing/);
  assert.match(ledger.text, /final U\.S\. appellate decision/);
  for (const forbidden of ['probability', 'guest', 'votes', 'trends', 'comments', 'aired']) assert.doesNotMatch(ledger.text.toLowerCase(), new RegExp(forbidden));
  await page.close();
});

for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1366, 768], [1440, 900]]) test(`layout and axe WCAG 2.2 AA pass at ${width}x${height}`, async () => {
  const page = await newPage();
  await page.setViewport({ width, height });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow is ${overflow}px`);
  const aligned = await page.evaluate(() => {
    const lefts = [...document.querySelectorAll('.site-header .grid, main > section > .grid, footer > .grid')].map((el) => Math.round(el.getBoundingClientRect().left));
    return { lefts, heroBottom: Math.round(document.querySelector('.hero').getBoundingClientRect().bottom) };
  });
  assert.equal(new Set(aligned.lefts).size, 1, `shared grid left edges differ: ${aligned.lefts.join(', ')}`);
  if (width >= 1000) assert.ok(aligned.heroBottom <= height + 80, `hero extends unexpectedly to ${aligned.heroBottom}px`);
  const undersized = await page.evaluate(() => [...document.querySelectorAll('a, button, input, summary')].filter((el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || (el.matches('input') && Number(style.opacity) === 0)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  }).map((el) => `${el.tagName.toLowerCase()}.${el.className || el.id}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
  assert.deepEqual(undersized, [], `undersized targets: ${undersized.join(', ')}`);
  await page.addScriptTag({ content: await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
  const results = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa'] } }));
  assert.deepEqual(results.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) })), []);
  await page.close();
});

test('legal pages reflow, keep 44px targets, and pass axe at mobile and desktop widths', async () => {
  const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const path of ['/accessibility.html', '/privacy.html', '/terms.html']) for (const width of [390, 1440]) {
    const page = await newPage();
    await page.setViewport({ width, height: 900 });
    await page.goto(`${origin}${path}`, { waitUntil: 'load' });
    const audit = await page.evaluate(() => ({
      landmarks: ['header', 'nav', 'main', 'footer'].every((selector) => document.querySelector(selector)),
      skip: document.querySelector('.skip')?.getAttribute('href'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      undersized: [...document.querySelectorAll('a')].filter((el) => { const rect = el.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44); }).map((el) => el.textContent.trim()),
    }));
    assert.equal(audit.landmarks, true, path);
    assert.equal(audit.skip, '#main', path);
    assert.ok(audit.overflow <= 1, `${path} at ${width}px overflows by ${audit.overflow}px`);
    assert.deepEqual(audit.undersized, [], `${path} at ${width}px has undersized targets`);
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa'] } }).then((result) => result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) }))));
    assert.deepEqual(violations, [], `${path} at ${width}px has axe violations`);
    await page.close();
  }
});
