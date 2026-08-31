import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import puppeteer from 'puppeteer-core';

let browser;
let child;
let origin;

function browserExecutablePath() {
  const configured = process.env.BROWSER_EXECUTABLE_PATH;
  if (configured) {
    if (!existsSync(configured)) throw new Error(`BROWSER_EXECUTABLE_PATH does not exist: ${configured}`);
    return configured;
  }

  const candidates = process.platform === 'win32'
    ? [
      process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  const detected = candidates.filter(Boolean).find((candidate) => existsSync(candidate));
  if (!detected) throw new Error('No supported Chromium browser found. Set BROWSER_EXECUTABLE_PATH.');
  return detected;
}

async function newPage() {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
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
  browser = await puppeteer.launch({ executablePath: browserExecutablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
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

test('unavailable poll route returns the branded 404 without poll controls', async () => {
  const page = await newPage();
  const response = await page.goto(`${origin}/poll/he-episode-01-customer-evolution-v1?src=newsletter`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 404);
  assert.equal(await page.$eval('h1', (heading) => heading.textContent.trim()), 'This page didn’t make the cut.');
  assert.equal(await page.$$eval('[data-poll-root], #audience-poll, [data-choice]', (nodes) => nodes.length), 0);
  await page.close();
});

test('open poll modal is optional, explicit, accessible, and one-response-per-browser', async () => {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const pollDocument = await readFile(new URL('../dist/poll.html', import.meta.url), 'utf8');
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: pollDocument });
    } else if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(request.url())) request.abort();
    else request.continue();
  });
  await page.evaluateOnNewDocument(() => {
    let recorded = false;
    window.fetch = async (url, options = {}) => {
      if (options.method === 'POST') {
        window.__pollSubmission = JSON.parse(options.body);
        recorded = true;
        return new Response(JSON.stringify({ accepted: true }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        question: { id: 'he-episode-01-customer-evolution-v1', prompt: 'Will this open test resolve YES?', state: 'open', opensAt: '2026-08-01T00:00:00.000Z', closesAt: '2026-09-01T00:00:00.000Z' },
        results: {
          directForecasts: { total: recorded ? 1 : 0, yes: recorded ? 1 : 0, no: 0, averageConfidence: recorded ? 81 : null, bySource: {} },
          linkedInReactions: { total: 0, yes: 0, no: 0, byCampaign: {} },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  });
  await page.goto(`${origin}/poll/he-episode-01-customer-evolution-v1?src=newsletter`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#audience-poll')?.open);
  assert.equal(await page.$eval('#audience-poll', (dialog) => document.activeElement === dialog || dialog.contains(document.activeElement)), true);
  const controls = await page.$$eval('[data-choice], #poll-confidence, .poll-submit, .poll-skip, .poll-close', (nodes) => nodes.map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  assert.ok(controls.every(({ width, height }) => width >= 44 && height >= 44));
  await page.click('[data-choice="yes"]');
  await page.type('#poll-confidence', '81');
  await page.click('.poll-submit');
  await page.waitForFunction(() => !document.querySelector('#audience-poll').open);
  const submission = await page.evaluate(() => window.__pollSubmission);
  assert.deepEqual({ choice: submission.choice, confidence: submission.confidence, source: submission.source, consent: submission.consent }, { choice: 'yes', confidence: 81, source: 'newsletter', consent: true });
  assert.ok(submission.browserToken.length >= 16);
  assert.ok(submission.idempotencyKey.length >= 16);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await page.$eval('#audience-poll', (dialog) => dialog.open), false);
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

test('homepage skip link moves focus to main content', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  assert.equal(await page.$eval('.skip', (link) => document.activeElement === link), true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#main');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
  await page.close();
});

test('legal skip links move focus to main content', async () => {
  for (const path of ['/accessibility.html', '/privacy.html', '/terms.html']) {
    const page = await newPage();
    await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    await page.keyboard.press('Tab');
    assert.equal(await page.$eval('.skip', (link) => document.activeElement === link), true, path);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#main');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main', path);
    await page.close();
  }
});

test('subject-first cover leads with a confident program entry and simplified instrument', async () => {
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
  assert.deepEqual(cover.actions, ['Read the Episode 01 premise', 'Explore the editorial themes ↓']);
  assert.match(cover.timing, /November 2026/);
  assert.match(cover.timing, /January 2027/);
  assert.match(cover.timing, /Program dates/);
  assert.match(cover.instrument, /QUESTION/);
  assert.match(cover.instrument, /EVIDENCE/);
  assert.match(cover.instrument, /OUTCOME/);
  assert.doesNotMatch(cover.instrument, /draft|not open|in development/i);
  assert.equal(cover.svgCount, 2);
  await page.close();
});

test('forecast instrument tabs expose truthful states and support keyboard navigation', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const initial = await page.$eval('.instrument', (instrument) => ({
    state: instrument.dataset.instrumentState,
    selected: instrument.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(),
    tabs: [...instrument.querySelectorAll('[role="tab"]')].map((tab) => ({ controls: tab.getAttribute('aria-controls'), tabindex: tab.tabIndex, width: tab.getBoundingClientRect().width, height: tab.getBoundingClientRect().height })),
    live: instrument.querySelector('.instrument-readout')?.getAttribute('aria-live'),
    visible: [...instrument.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.textContent.replace(/\s+/g, ' ').trim()),
    text: instrument.textContent.replace(/\s+/g, ' '),
  }));
  assert.equal(initial.state, 'evidence');
  assert.equal(initial.selected, '01 Evidence');
  assert.equal(initial.live, 'polite');
  assert.ok(initial.tabs.every(({ controls, width, height }) => controls && width >= 44 && height >= 44));
  assert.deepEqual(initial.tabs.map(({ tabindex }) => tabindex), [0, -1, -1]);
  assert.equal(initial.visible.length, 1);
  assert.match(initial.visible[0], /Name the reporting that can answer the question/);
  for (const copy of [/Name the reporting that can answer the question/, /Save a private YES or NO/, /Compare eligible evidence with the stated threshold and deadline/]) assert.match(initial.text, copy);
  assert.doesNotMatch(initial.text, /draft|not open|in development/i);
  for (const jargon of [/UNRESOLVED GATE/i, /PUBLIC LEDGER/i, /01 Capture/i, /02 Forecast/i, /03 Resolve/i]) assert.doesNotMatch(initial.text, jargon);

  await page.focus('#instrument-tab-evidence');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.$eval('.instrument', (instrument) => [instrument.dataset.instrumentState, document.activeElement?.id, instrument.querySelector('[role="tabpanel"]:not([hidden])')?.id]), ['views', 'instrument-tab-views', 'instrument-panel-views']);
  await page.keyboard.press('End');
  assert.deepEqual(await page.$eval('.instrument', (instrument) => [instrument.dataset.instrumentState, document.activeElement?.id, instrument.querySelector('[role="tabpanel"]:not([hidden])')?.id]), ['outcome', 'instrument-tab-outcome', 'instrument-panel-outcome']);
  await page.focus('#instrument-tab-evidence');
  assert.equal(await page.$eval('.instrument', (instrument) => instrument.dataset.instrumentState), 'evidence');
  await page.click('#instrument-tab-outcome');
  assert.equal(await page.$eval('.instrument', (instrument) => instrument.dataset.instrumentState), 'outcome');
  assert.equal(await page.$eval('.instrument-foot a', (link) => link.getAttribute('href')), '#forecast');
  await page.close();
});

test('instrument core explanation survives without JavaScript', async () => {
  const page = await newPage();
  await page.setJavaScriptEnabled(false);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const panels = await page.$$eval('.instrument-readout [role="tabpanel"]', (nodes) => nodes.map((panel) => ({ hidden: panel.hidden, text: panel.textContent.replace(/\s+/g, ' ').trim(), height: panel.getBoundingClientRect().height })));
  assert.equal(panels.length, 3);
  assert.ok(panels.every(({ hidden, height }) => !hidden && height > 0));
  const explanation = panels.map(({ text }) => text).join(' ');
  assert.match(explanation, /Name the reporting that can answer the question/);
  assert.match(explanation, /Save a private YES or NO/);
  assert.match(explanation, /Compare eligible evidence with the stated threshold and deadline/);
  assert.doesNotMatch(explanation, /draft|not open|in development/i);
  await page.close();
});

test('instrument geometry is contained and pointer perspective resets', async () => {
  const page = await newPage();
  await page.evaluateOnNewDocument(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(hover: hover) and (pointer: fine)' ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; } } : nativeMatchMedia(query);
  });
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const geometry = await page.$eval('.instrument', (instrument) => {
    const stage = instrument.querySelector('.instrument-stage').getBoundingClientRect();
    const gate = instrument.querySelector('.forecast-gate').getBoundingClientRect();
    const path = instrument.querySelector('.production-path').getBoundingClientRect();
    const controls = instrument.querySelector('.instrument-controls').getBoundingClientRect();
    return { gateInside: gate.left >= stage.left && gate.right <= stage.right && gate.top >= stage.top && gate.bottom <= stage.bottom, gateTextCentered: getComputedStyle(instrument.querySelector('.forecast-gate')).textAlign, pathAboveControls: path.bottom <= controls.top, instrumentBottom: instrument.getBoundingClientRect().bottom };
  });
  assert.deepEqual(geometry, { ...geometry, gateInside: true, gateTextCentered: 'center', pathAboveControls: true });
  assert.ok(geometry.instrumentBottom <= 768, `instrument extends below viewport to ${geometry.instrumentBottom}px`);
  const stage = await page.$('.instrument-stage');
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width - 4, box.y + 8);
  assert.notEqual(await page.$eval('.instrument-stage', (el) => el.style.getPropertyValue('--pointer-x')), '');
  await page.mouse.move(1, 1);
  assert.deepEqual(await page.$eval('.instrument-stage', (el) => [el.style.getPropertyValue('--pointer-x'), el.style.getPropertyValue('--pointer-y')]), ['', '']);
  await page.close();

  const reduced = await newPage();
  await reduced.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await reduced.goto(origin, { waitUntil: 'domcontentloaded' });
  const reducedBox = await (await reduced.$('.instrument-stage')).boundingBox();
  await reduced.mouse.move(reducedBox.x + reducedBox.width - 4, reducedBox.y + 8);
  assert.deepEqual(await reduced.$eval('.instrument-stage', (el) => ({ x: el.style.getPropertyValue('--pointer-x'), transform: getComputedStyle(el).transform, transition: getComputedStyle(el).transitionDuration })), { x: '', transform: 'none', transition: '0s' });
  assert.ok((await reduced.$$eval('.lens, .signal-ribbon, .forecast-gate strong', (nodes) => nodes.map((el) => getComputedStyle(el).animationName))).every((name) => name === 'none'));
  await reduced.close();
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

test('homepage presents the hero dock, demo ledger, and no commentary controls', async () => {
  const page = await newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.$$eval('.distribution, .platform-card, #commentary-app, #linkedin-login', (nodes) => nodes.length), 0);
  assert.deepEqual(await page.$$eval('.hero-dock li', (nodes) => nodes.map((node) => node.textContent)), ['Spotify', 'Apple Podcasts', 'YouTube']);
  await page.evaluate(() => { document.documentElement.dataset.demoState = 'ready'; });
  const dock = await page.$eval('.hero-dock', (node) => {
    const bounds = node.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, viewportHeight: innerHeight };
  });
  assert.ok(dock.top >= 0 && dock.bottom <= dock.viewportHeight, `hero dock must remain fully visible in the initial mobile screen with the demo disclosure: ${JSON.stringify(dock)}`);
  assert.deepEqual(await page.$$eval('[data-demo-ledger] tbody td:nth-child(2)', (nodes) => nodes.map((node) => node.textContent.trim())), ['—', '—', '—']);
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
    assert.equal(sample.outlineColor, 'rgb(250, 247, 240)');
    assert.match(sample.boxShadow, /rgb\(23, 23, 21\).*0px 0px 0px 6px/);
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
    text: 'Consider the Episode 01 question about the future of ad-supported streaming plans.',
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
  assert.equal(await page.$eval('#share-status', (el) => el.textContent), 'Question URL copied.');
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
  assert.equal(await page.$eval('#share-status', (el) => el.textContent), 'Select and copy the question URL.');
  await page.close();
});

test('season ledger uses native disclosure rows and complete editorial questions', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const ledger = await page.$eval('.season-ledger', (el) => ({
    details: el.querySelectorAll(':scope > li > details').length,
    summaries: el.querySelectorAll(':scope > li > details > summary').length,
    states: [...el.querySelectorAll('.editorial-state')].map((node) => node.textContent.trim()),
    contracts: [...el.querySelectorAll('.episode-frame')].map((node) => ({
      question: node.querySelector('.editorial-question')?.textContent.trim(),
      terms: [...node.querySelectorAll('dt')].map((term) => term.textContent.trim()),
    })),
    text: el.textContent,
  }));
  assert.equal(ledger.details, 7);
  assert.equal(ledger.summaries, 7);
  assert.equal(ledger.states.length, 8);
  assert.ok(ledger.states.every(Boolean));
  assert.ok(ledger.contracts.every(({ question, terms }) => question && ['YES threshold', 'Resolve by', 'Evidence / resolver'].every((term) => terms.includes(term))));
  assert.match(ledger.text, /fully synthetic performer receive top billing/);
  assert.match(ledger.text, /final U\.S\. appellate decision/);
  for (const forbidden of ['probability', 'guest', 'votes', 'trends', 'comments', 'aired']) assert.doesNotMatch(ledger.text.toLowerCase(), new RegExp(forbidden));
  assert.doesNotMatch(ledger.text, /draft|not open|in development/i);
  await page.close();
});

test('past and present share one responsive split chapter with a forecast jump', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const desktop = await page.evaluate(() => {
    const past = document.querySelector('#past').getBoundingClientRect();
    const present = document.querySelector('#present').getBoundingClientRect();
    const wrapper = document.querySelector('.evolution-split');
    const jump = wrapper.querySelector('a[href="#forecast"]');
    return { siblings: past.parentElement === present.parentElement, sideBySide: Math.abs(past.top - present.top) < 2 && past.right <= present.left + 2, jump: Boolean(jump), jumpHeight: jump.getBoundingClientRect().height };
  });
  assert.deepEqual(desktop, { siblings: true, sideBySide: true, jump: true, jumpHeight: 86 });
  await page.setViewport({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const past = document.querySelector('#past').getBoundingClientRect();
    const present = document.querySelector('#present').getBoundingClientRect();
    return present.top >= past.bottom - 2;
  });
  assert.equal(mobile, true);
  await page.focus('.forecast-jump');
  assert.equal(await page.$eval('.forecast-jump', (el) => document.activeElement === el), true);
  await page.close();
});

test('eight truthful motion cards link to stable native question details and offer private YES/NO calls', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const cards = await page.$$eval('.motion-card', (nodes) => nodes.map((card) => {
    const link = card.querySelector('.motion-card-link');
    return {
      href: link?.hash,
      target: Boolean(link?.hash && document.querySelector(link.hash)),
      text: card.textContent.replace(/\s+/g, ' ').trim(),
      calls: [...card.querySelectorAll('input[data-question-call]')].map((input) => input.value),
    };
  }));
  assert.equal(cards.length, 8);
  assert.equal(new Set(cards.map(({ href }) => href)).size, 8);
  assert.ok(cards.every(({ target, text, calls }) => target && /YES\s+—/.test(text) && /NO\s+—/.test(text) && /Threshold · deadline · evidence/.test(text) && calls.join(',') === 'yes,no'));
  assert.ok(cards.every(({ text }) => !/draft|not open|in development/i.test(text)));
  await page.waitForFunction(() => {
    const card = document.querySelector('.motion-card[data-question-id="question-01"]');
    const rail = document.querySelector('.question-rail');
    const cardRect = card.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    return getComputedStyle(card).pointerEvents !== 'none' && cardRect.left >= railRect.left && cardRect.right <= railRect.right;
  });
  await page.hover('.question-rail');
  await page.click('.motion-card[data-question-id="question-01"] .card-call label:first-of-type');
  await page.focus('.motion-card[data-question-id="question-02"] input[value="no"]');
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('he-private-question-calls'))), { 'question-01': 'yes', 'question-02': 'no' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.$eval('.motion-card[data-question-id="question-01"] input[value="yes"]', (input) => input.checked), true);
  assert.equal(await page.$eval('.motion-card[data-question-id="question-02"] input[value="no"]', (input) => input.checked), true);
  await page.$eval('.motion-card-link[href="#question-02"]', (link) => link.click());
  assert.equal(await page.$eval('#question-02 details', (el) => el.open), true);
  const animation = await page.$eval('.motion-card', (el) => ({ running: getComputedStyle(el).animationName !== 'none', paused: getComputedStyle(el.closest('.question-rail')).getPropertyValue('--unused') }));
  assert.equal(animation.running, true);
  await page.close();

  const reduced = await newPage();
  await reduced.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await reduced.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.ok((await reduced.$$eval('.motion-card', (nodes) => nodes.map((el) => getComputedStyle(el).animationName))).every((name) => name === 'none'));
  await reduced.close();
});

test('mobile keeps the swipeable question field and direct private calls visible', async () => {
  const page = await newPage();
  await page.evaluateOnNewDocument(() => localStorage.removeItem('he-private-question-calls'));
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const layout = await page.evaluate(() => {
    const field = document.querySelector('.question-field');
    const rail = document.querySelector('.question-rail');
    const cards = [...document.querySelectorAll('.motion-card')];
    const targets = [...document.querySelectorAll('.card-call label')];
    return {
      fieldDisplay: getComputedStyle(field).display,
      fieldWidth: field.getBoundingClientRect().width,
      railScrollable: rail.scrollWidth > rail.clientWidth,
      cardWidths: cards.map((card) => card.getBoundingClientRect().width),
      targets: targets.map((target) => target.getBoundingClientRect().height),
      duplicateLedgerDisplay: getComputedStyle(document.querySelector('.season-ledger')).display,
    };
  });
  assert.notEqual(layout.fieldDisplay, 'none');
  assert.ok(layout.fieldWidth > 300 && layout.fieldWidth <= 390);
  assert.equal(layout.railScrollable, true);
  assert.ok(layout.cardWidths.every((width) => width >= 250 && width < 390));
  assert.ok(layout.targets.every((height) => height >= 44));
  assert.equal(layout.duplicateLedgerDisplay, 'none');
  await page.click('.motion-card[data-question-id="question-01"] .card-call label:first-of-type');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('he-private-question-calls'))), { 'question-01': 'yes' });
  await page.close();
});

test('mobile question tap expands full context vertically without disabling neighboring cards', async () => {
  const page = await newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const selector = '.motion-card[data-question-id="question-03"]';
  const before = await page.$eval(selector, (card) => ({
    width: card.getBoundingClientRect().width,
    height: card.getBoundingClientRect().height,
  }));
  await page.focus(`${selector} .motion-card-link`);
  await page.keyboard.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 700));
  const expanded = await page.$eval(selector, (card) => {
    const context = card.querySelector('.card-context');
    const neighbors = [...card.parentElement.querySelectorAll('.motion-card:not(.is-expanded)')];
    const rect = card.getBoundingClientRect();
    const contextRect = context.getBoundingClientRect();
    const callsRect = card.querySelector('.card-call').getBoundingClientRect();
    return {
      expanded: card.classList.contains('is-expanded'),
      ariaExpanded: card.querySelector('.motion-card-link').getAttribute('aria-expanded'),
      width: rect.width,
      height: rect.height,
      context: context?.textContent.replace(/\s+/g, ' ').trim(),
      contextTop: contextRect.top,
      contextBottom: contextRect.bottom,
      callsBottom: callsRect.bottom,
      viewportHeight: innerHeight,
      neighborShifts: neighbors.map((neighbor) => neighbor.style.getPropertyValue('--card-shift')),
      neighborsInteractive: neighbors.every((neighbor) => getComputedStyle(neighbor).pointerEvents === 'auto'),
    };
  });
  assert.equal(expanded.expanded, true);
  assert.equal(expanded.ariaExpanded, 'true');
  assert.ok(expanded.width <= before.width + 1, `mobile card widened from ${before.width}px to ${expanded.width}px`);
  assert.ok(expanded.height > before.height + 150, `mobile card did not expand vertically: ${before.height}px to ${expanded.height}px`);
  assert.match(expanded.context, /Why it matters:/);
  assert.match(expanded.context, /YES threshold/);
  assert.match(expanded.context, /Resolve by/);
  assert.ok(expanded.contextTop >= 64 && expanded.contextTop <= 112, `expanded context starts outside the immediate reading area: ${expanded.contextTop}px`);
  assert.ok(expanded.contextBottom < expanded.viewportHeight, `expanded context ends below the viewport: ${expanded.contextBottom}px`);
  assert.ok(expanded.callsBottom < expanded.viewportHeight, `YES/NO controls end below the viewport: ${expanded.callsBottom}px`);
  assert.ok(expanded.neighborShifts.every((shift) => shift === ''));
  assert.equal(expanded.neighborsInteractive, true);
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval(selector, (card) => card.classList.contains('is-expanded')), false);
  await page.close();
});

test('question-card inspection pauses in place and tracks the pointer without moving the target', async () => {
  const page = await newPage();
  await page.evaluateOnNewDocument(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(hover: hover) and (pointer: fine)' ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; } } : nativeMatchMedia(query);
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.$eval('.question-rail', (rail) => rail.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(() => [...document.querySelectorAll('.motion-card')].some((card) => {
    const rail = document.querySelector('.question-rail');
    const cardRect = card.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const center = document.elementFromPoint(cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2);
    return getComputedStyle(card).pointerEvents !== 'none'
      && cardRect.left >= railRect.left
      && cardRect.right <= railRect.right
      && card.contains(center);
  }));
  const questionId = await page.evaluate(() => [...document.querySelectorAll('.motion-card')].find((card) => {
    const rect = card.getBoundingClientRect();
    return getComputedStyle(card).pointerEvents !== 'none'
      && card.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })?.dataset.questionId);
  const card = await page.$(`.motion-card[data-question-id="${questionId}"]`);
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForFunction((id) => getComputedStyle(document.querySelector(`.motion-card[data-question-id="${id}"]`)).animationPlayState === 'paused', {}, questionId);
  const before = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, transform: getComputedStyle(element).transform };
  });
  await new Promise((resolve) => setTimeout(resolve, 220));
  const after = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      top: rect.top,
      transform: style.transform,
      animationName: style.animationName,
      animationPlayState: style.animationPlayState,
      pointerX: element.style.getPropertyValue('--card-pointer-x'),
      pointerY: element.style.getPropertyValue('--card-pointer-y'),
      markerOpacity: getComputedStyle(element, '::before').opacity,
      markerRadius: getComputedStyle(element, '::before').borderRadius,
      edgeMarkerOpacity: getComputedStyle(element, '::after').opacity,
    };
  });
  assert.ok(Math.abs(after.left - before.left) < 1, `card moved ${after.left - before.left}px horizontally on hover`);
  assert.ok(Math.abs(after.top - before.top) < 1, `card moved ${after.top - before.top}px vertically on hover`);
  assert.equal(after.transform, before.transform);
  assert.equal(after.animationName, 'question-flow');
  assert.equal(after.animationPlayState, 'paused');
  assert.match(after.pointerX, /%$/);
  assert.match(after.pointerY, /%$/);
  assert.equal(after.markerOpacity, '1');
  assert.equal(after.markerRadius, '0px');
  assert.equal(after.edgeMarkerOpacity, '1');
  await page.close();
});

test('every fully visible moving card exposes clickable question, YES, and NO targets', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.$eval('.question-rail', (rail) => rail.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.$$eval('.motion-card', (cards) => cards.forEach((card) => card.getAnimations().forEach((animation) => animation.pause())));
  await page.waitForFunction(() => [...document.querySelectorAll('.motion-card')].every((card) => card.getAnimations().every((animation) => animation.playState === 'paused')));
  const hitTest = await page.evaluate(() => {
    const railRect = document.querySelector('.question-rail').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.motion-card')].filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left >= railRect.left && rect.right <= railRect.right && rect.top >= railRect.top && rect.bottom <= railRect.bottom;
    });
    const misses = [];
    for (const card of cards) {
      const targets = [card.querySelector('.motion-card-link'), ...card.querySelectorAll('.card-call label')];
      targets.forEach((target, index) => {
        const rect = target.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!card.contains(hit)) misses.push(`${card.dataset.questionId}:${index}`);
      });
    }
    return { visible: cards.length, misses };
  });
  assert.ok(hitTest.visible >= 2, `expected at least two fully visible cards, found ${hitTest.visible}`);
  assert.deepEqual(hitTest.misses, []);
  await page.close();
});

test('question-card YES and NO controls advertise pointer interaction and hover state', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.$eval('.question-rail', (rail) => rail.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const questionId = await page.evaluate(() => [...document.querySelectorAll('.motion-card')].find((card) => {
    const label = card.querySelector('.card-call label:first-of-type');
    const rect = label.getBoundingClientRect();
    return card.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })?.dataset.questionId);
  await page.hover(`.motion-card[data-question-id="${questionId}"]`);
  await page.waitForFunction((id) => getComputedStyle(document.querySelector(`.motion-card[data-question-id="${id}"]`)).animationPlayState === 'paused', {}, questionId);
  const label = await page.$(`.motion-card[data-question-id="${questionId}"] .card-call label:first-of-type`);
  await label.hover();
  await new Promise((resolve) => setTimeout(resolve, 180));
  const cue = await label.evaluate((element) => {
    const span = element.querySelector('span');
    const probe = document.createElement('i');
    probe.style.background = 'var(--blue)';
    document.body.append(probe);
    const signal = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      labelCursor: getComputedStyle(element).cursor,
      spanCursor: getComputedStyle(span).cursor,
      background: getComputedStyle(span).backgroundColor,
      signal,
    };
  });
  assert.equal(cue.labelCursor, 'pointer');
  assert.equal(cue.spanCursor, 'pointer');
  assert.equal(cue.background, cue.signal);
  await page.close();
});

test('question-card link expands full context, displaces neighbors, and closes with Escape', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const selector = '.motion-card[data-question-id="question-03"]';
  const before = await page.$eval(selector, (card) => card.getBoundingClientRect().width);
  await page.focus(`${selector} .motion-card-link`);
  await page.keyboard.press('Enter');
  const expanded = await page.$eval(selector, (card) => {
    const context = card.querySelector('.card-context');
    const neighbors = [...card.parentElement.querySelectorAll('.motion-card:not(.is-expanded)')];
    return {
      expanded: card.classList.contains('is-expanded'),
      ariaExpanded: card.querySelector('.motion-card-link').getAttribute('aria-expanded'),
      width: card.getBoundingClientRect().width,
      context: context?.textContent.replace(/\s+/g, ' ').trim(),
      closeButton: context?.querySelector('button[data-card-close]')?.textContent.trim(),
      shifts: neighbors.map((neighbor) => Number.parseFloat(neighbor.style.getPropertyValue('--card-shift'))),
      neighborsInert: neighbors.every((neighbor) => getComputedStyle(neighbor).pointerEvents === 'none'),
    };
  });
  assert.equal(expanded.expanded, true);
  assert.equal(expanded.ariaExpanded, 'true');
  assert.ok(expanded.width > before * 1.8, `expanded width ${expanded.width}px did not substantially exceed ${before}px`);
  assert.match(expanded.context, /Why it matters:/);
  assert.match(expanded.context, /YES threshold/);
  assert.match(expanded.context, /Resolve by/);
  assert.match(expanded.context, /Evidence \/ resolver/);
  assert.doesNotMatch(expanded.context, /draft|not open|in development/i);
  assert.equal(expanded.closeButton, '× Close context');
  assert.ok(expanded.shifts.every((shift) => Math.abs(shift) >= 360));
  assert.equal(expanded.neighborsInert, true);
  await page.keyboard.press('Escape');
  const collapsed = await page.$eval(selector, (card) => ({
    expanded: card.classList.contains('is-expanded'),
    ariaExpanded: card.querySelector('.motion-card-link').getAttribute('aria-expanded'),
    context: Boolean(card.querySelector('.card-context')),
    focused: document.activeElement === card.querySelector('.motion-card-link'),
  }));
  assert.deepEqual(collapsed, { expanded: false, ariaExpanded: 'false', context: false, focused: true });
  await page.close();
});

test('question context follows browser Back and Forward history', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const selector = '.motion-card[data-question-id="question-03"]';
  await page.$eval(`${selector} .motion-card-link`, (link) => link.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const scrollBeforeOpen = await page.evaluate(() => scrollY);
  await page.click(`${selector} .motion-card-link`);
  await page.waitForFunction(() => location.hash === '#question-03', { timeout: 2000 });
  assert.equal(await page.$eval(selector, (card) => card.classList.contains('is-expanded')), true);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBeforeOpen) <= 1, 'opening context changed the page scroll position');

  await page.evaluate(() => history.back());
  await page.waitForFunction(() => location.hash === '' && !document.querySelector('.motion-card.is-expanded'));
  await page.evaluate(() => history.forward());
  await page.waitForFunction(() => location.hash === '#question-03' && document.querySelector('.motion-card[data-question-id="question-03"]')?.classList.contains('is-expanded'), { timeout: 2000 });
  await page.close();
});

test('direct question fragments restore context and close in place', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${origin}/#question-05`, { waitUntil: 'domcontentloaded' });
  const selector = '.motion-card[data-question-id="question-05"]';
  await page.waitForFunction(() => document.querySelector('.motion-card[data-question-id="question-05"]')?.classList.contains('is-expanded'), { timeout: 2000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => location.hash === '' && !document.querySelector('.motion-card.is-expanded'));
  assert.equal(await page.evaluate(() => location.pathname), '/');
  assert.equal(await page.$eval(`${selector} .motion-card-link`, (link) => document.activeElement === link), true);

  await page.goto(`${origin}/#host`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.evaluate(() => location.hash), '#host');
  assert.equal(await page.$('.motion-card.is-expanded'), null);
  await page.close();
});

test('question context close button removes its history entry and restores trigger focus', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const selector = '.motion-card[data-question-id="question-03"]';
  await page.click(`${selector} .motion-card-link`);
  await page.waitForFunction(() => location.hash === '#question-03', { timeout: 2000 });
  await page.click(`${selector} [data-card-close]`);
  await page.waitForFunction(() => location.hash === '' && !document.querySelector('.motion-card.is-expanded'));
  assert.equal(await page.$eval(`${selector} .motion-card-link`, (link) => document.activeElement === link), true);
  await page.close();
});

test('closing full context restarts unfocused card movement while preserving trigger focus', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const selector = '.motion-card[data-question-id="question-03"]';
  await page.focus(`${selector} .motion-card-link`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 700));
  const before = await page.evaluate(() => [...document.querySelectorAll('.motion-card:not([data-question-id="question-03"])')].map((card) => ({
    id: card.dataset.questionId,
    left: card.getBoundingClientRect().left,
    state: getComputedStyle(card).animationPlayState,
  })));
  await new Promise((resolve) => setTimeout(resolve, 350));
  const after = await page.evaluate(() => [...document.querySelectorAll('.motion-card:not([data-question-id="question-03"])')].map((card) => ({
    id: card.dataset.questionId,
    left: card.getBoundingClientRect().left,
    state: getComputedStyle(card).animationPlayState,
  })));
  assert.equal(await page.$eval(`${selector} .motion-card-link`, (link) => document.activeElement === link), true);
  assert.ok(after.every(({ state }) => state === 'running'), `unfocused cards did not resume: ${JSON.stringify(after)}`);
  assert.ok(after.some((card, index) => Math.abs(card.left - before[index].left) > 5), `unfocused cards remained stationary: ${JSON.stringify({ before, after })}`);
  await page.close();
});

test('moving question cards use a readable travel duration', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const durations = await page.$$eval('.motion-card', (cards) => cards.map((card) => Number.parseFloat(getComputedStyle(card).animationDuration)));
  assert.ok(durations.every((duration) => duration >= 40), `question cards move too quickly: ${JSON.stringify(durations)}`);
  await page.close();
});

test('moving question cards use restrained perspective for legible text', async () => {
  const page = await newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const transforms = await page.$$eval('.motion-card', (cards) => cards.map((card) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
    return {
      tilt: Math.abs(Math.atan2(matrix.m13, matrix.m11) * 180 / Math.PI),
      depth: Math.abs(matrix.m43),
    };
  }));
  assert.ok(Math.max(...transforms.map(({ tilt }) => tilt)) <= 5, `question-card tilt is too strong: ${JSON.stringify(transforms)}`);
  assert.ok(Math.max(...transforms.map(({ depth }) => depth)) <= 25, `question-card depth is too strong: ${JSON.stringify(transforms)}`);
  await page.close();
});

test('season presents eight editorial questions without roadmap narration', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const text = await page.$eval('#season', (section) => section.textContent.replace(/\s+/g, ' '));
  assert.match(text, /Eight measurable questions/i);
  assert.match(text, /Customer Evolution/i);
  assert.match(text, /Animation Evolution/i);
  assert.doesNotMatch(text, /draft|not open|coming soon|in development/i);
  await page.close();
});

async function mobileEditorialMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;
    const paragraphs = [...document.querySelectorAll('main p')].filter(visible);
    const contentBlocks = [...document.querySelectorAll('main > section, main h1, main h2, main h3, main p, main li')].filter(visible);
    const scrollHeight = document.documentElement.scrollHeight;
    const cardWords = [...document.querySelectorAll('.motion-card')].map((card) => words(card.innerText));
    const horizontalWords = cardWords.slice(1).reduce((total, count) => total + count, 0);
    return {
      scrollHeight,
      viewportLengths: Number((scrollHeight / innerHeight).toFixed(1)),
      // Offscreen snap cards add breadth, not vertical reading load. Count the visible lead card only.
      mainWords: words(document.querySelector('main').innerText) - horizontalWords,
      visibleBlocks: contentBlocks.length,
      paragraphs: paragraphs.length,
      longParagraphs: paragraphs.filter((paragraph) => paragraph.textContent.trim().length >= 160).length,
    };
  });
}

test('mobile editions stay within an intentional reading and scroll budget', async () => {
  const page = await newPage();
  // Budgets include the hero platform dock and the demo forecast ledger added by demo mode.
  const budgets = { scrollHeight: 7300, viewportLengths: 8.7, mainWords: 760, visibleBlocks: 70, paragraphs: 34, longParagraphs: 2 };
  const preservationFloors = { mainWords: 550, visibleBlocks: 60, paragraphs: 25 };
  const measurements = {};
  for (const width of [320, 375, 390, 430]) {
    await page.setViewport({ width, height: 844 });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const metrics = await mobileEditorialMetrics(page);
    measurements[width] = metrics;
    for (const [name, maximum] of Object.entries(budgets)) {
      assert.ok(metrics[name] <= maximum, `${name} ${metrics[name]} exceeds ${width}px mobile budget ${maximum}; metrics=${JSON.stringify(metrics)}`);
    }
    for (const [name, minimum] of Object.entries(preservationFloors)) {
      assert.ok(metrics[name] >= minimum, `${name} ${metrics[name]} falls below ${width}px editorial preservation floor ${minimum}; metrics=${JSON.stringify(metrics)}`);
    }
  }
  console.log(`mobile editorial metrics: ${JSON.stringify(measurements)}`);
  await page.close();
});

test('mobile theme cards keep all eight editorial contracts reachable without horizontal page trapping', async () => {
  const page = await newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.doesNotMatch(await page.$eval('.season-header', (header) => header.textContent), /open any theme/i);
  const contracts = [];
  for (const link of await page.$$('.motion-card-link')) {
    await link.focus();
    await link.press('Enter');
    contracts.push(await link.evaluate((questionLink) => {
      const card = questionLink.closest('.motion-card');
      const context = card.querySelector('.card-context');
      return {
        expanded: card.classList.contains('is-expanded'),
        question: context?.querySelector('.editorial-question')?.textContent.trim(),
        terms: [...context?.querySelectorAll('dt') || []].map((term) => term.textContent.trim()),
        rendered: context?.getBoundingClientRect().height > 0,
      };
    }));
    await page.keyboard.press('Escape');
  }
  assert.equal(contracts.length, 8);
  assert.ok(contracts.every(({ expanded, question, rendered }) => expanded && question && rendered));
  assert.ok(['YES threshold', 'Deadline', 'Evidence'].every((term) => contracts[0].terms.includes(term)));
  assert.ok(contracts.slice(1).every(({ terms }) => ['YES threshold', 'Resolve by', 'Evidence / resolver'].every((term) => terms.includes(term))));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
  await page.close();

  const noScript = await newPage();
  await noScript.setJavaScriptEnabled(false);
  await noScript.setViewport({ width: 390, height: 844 });
  await noScript.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.deepEqual(await noScript.$eval('#season', (season) => ({
    rows: season.querySelectorAll('.season-ledger > li').length,
    summaries: season.querySelectorAll('.season-ledger summary').length,
    duplicateField: getComputedStyle(season.querySelector('.question-field')).display,
  })), { rows: 8, summaries: 7, duplicateField: 'none' });
  const noScriptSummaries = await noScript.$$('.season-ledger summary');
  for (const summary of noScriptSummaries) await summary.click();
  assert.ok(await noScript.$$eval('.season-ledger details', (details) => details.every((disclosure) => disclosure.open && disclosure.querySelector('.episode-frame').getBoundingClientRect().height > 0 && /YES threshold/.test(disclosure.textContent))));
  await noScript.close();
});

for (const [width, height] of [[320, 844], [375, 844], [390, 844], [430, 844], [768, 900], [1366, 768], [1440, 900]]) test(`layout and axe WCAG 2.2 AA pass at ${width}x${height}`, async () => {
  const page = await newPage();
  await page.setViewport({ width, height });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `horizontal overflow is ${overflow}px`);
  const aligned = await page.evaluate(() => {
    const lefts = [...document.querySelectorAll('.site-header .grid, main > section > .grid, footer > .grid')].map((el) => Math.round(el.getBoundingClientRect().left));
    const phrase = document.querySelector('.operating-system');
    const phraseRect = phrase.getBoundingClientRect();
    return { lefts, heroBottom: Math.round(document.querySelector('.hero').getBoundingClientRect().bottom), phraseRects: phrase.getClientRects().length, phraseInside: phraseRect.left >= 0 && phraseRect.right <= innerWidth };
  });
  assert.equal(new Set(aligned.lefts).size, 1, `shared grid left edges differ: ${aligned.lefts.join(', ')}`);
  assert.equal(aligned.phraseRects, 1, 'Operating System must have exactly one client rect');
  assert.equal(aligned.phraseInside, true, 'Operating System must stay inside the viewport');
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

test('demo banner stays hidden when demo mode is off', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => new Promise((resolve) => setTimeout(() => resolve(true), 150)));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.demoState), undefined);
  assert.equal(await page.$eval('.demo-banner', (node) => getComputedStyle(node).display), 'none');
  await page.close();
});

test('demo-state failure shows an explicit unavailable banner without sample values', async () => {
  const page = await browser.newPage();
  await page.setBypassCSP(true);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().endsWith('/api/demo-state')) request.abort();
    else if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(request.url())) request.abort();
    else request.continue();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.demoState === 'unavailable', { timeout: 5000 });
  assert.match(await page.$eval('.demo-banner', (node) => node.textContent), /DEMO DATA UNAVAILABLE/);
  assert.equal(await page.$$eval('.demo-card-aggregate', (nodes) => nodes.length), 0);
  assert.equal(await page.$eval('[data-demo-ledger]', (node) => node.hasAttribute('data-demo')), false);
  await page.close();
});
