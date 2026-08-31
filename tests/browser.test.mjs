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

test('draft poll magic link is truthful, accessible, and does not solicit a response', async () => {
  const page = await newPage();
  await page.goto(`${origin}/poll/he-episode-01-customer-evolution-v1?src=linkedin`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#poll-title')?.textContent.includes('Will at least three'));
  const state = await page.evaluate(() => ({
    title: document.querySelector('#poll-title')?.textContent.trim(),
    status: document.querySelector('#poll-state')?.textContent.trim(),
    dialogOpen: document.querySelector('#audience-poll')?.open,
    resultsHidden: document.querySelector('#poll-results')?.hidden,
    source: document.querySelector('[data-poll-root]')?.dataset.source,
  }));
  assert.match(state.title, /ad-supported plans/);
  assert.match(state.status, /draft.*not open/i);
  assert.equal(state.dialogOpen, false);
  assert.equal(state.resultsHidden, true);
  assert.equal(state.source, 'linkedin');
  await page.close();
});

test('homepage query deep link preserves question ID and source attribution', async () => {
  const page = await newPage();
  await page.goto(`${origin}/?poll=he-episode-01-customer-evolution-v1&src=qr`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.pathname.startsWith('/poll/'));
  assert.equal(await page.evaluate(() => `${location.pathname}${location.search}`), '/poll/he-episode-01-customer-evolution-v1?src=qr');
  await page.close();
});

test('open poll modal is optional, explicit, accessible, and one-response-per-browser', async () => {
  const page = await newPage();
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
  const controls = await page.$$eval('[data-choice], #poll-confidence, .poll-submit, .poll-skip, .poll-close', (nodes) => nodes.map((node) => ({ text: node.textContent.trim(), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
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
  assert.match(cover.instrument, /NOT OPEN/);
  assert.match(cover.instrument, /EVIDENCE/);
  assert.match(cover.instrument, /THREE VIEWS/);
  assert.match(cover.instrument, /OUTCOME/);
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
  assert.match(initial.visible[0], /Public reporting published before the agreed cutoff/);
  for (const copy of [/Guest, Community, and Research System will remain separately labeled/, /No probability is currently published/, /agreed threshold and eligible evidence will eventually resolve/, /Current status: not open · unresolved/]) assert.match(initial.text, copy);
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
  assert.match(explanation, /Public reporting published before the agreed cutoff/);
  assert.match(explanation, /Guest, Community, and Research System/);
  assert.match(explanation, /currently not open and unresolved/);
  await page.close();
});

test('future platform destinations are exactly three honest non-link placeholders', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const distribution = await page.$eval('.distribution', (section) => ({
    intro: section.querySelector('.distribution-intro')?.textContent.replace(/\s+/g, ' ').trim(),
    cards: [...section.querySelectorAll('.platform-card')].map((card) => ({ platform: card.dataset.platform, url: card.dataset.url, tag: card.tagName, hrefs: card.querySelectorAll('[href]').length, text: card.textContent.replace(/\s+/g, ' ').trim() })),
  }));
  assert.match(distribution.intro, /Links will appear when Episode 01 publishes in January 2027/);
  assert.deepEqual(distribution.cards.map(({ platform }) => platform), ['Spotify', 'Apple Music', 'YouTube']);
  assert.ok(distribution.cards.every(({ url, tag, hrefs, text }) => url === 'pending' && tag === 'ARTICLE' && hrefs === 0 && /Coming January 2027/.test(text) && /Link pending/.test(text)));
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

test('commentary panel is truthful and non-soliciting while LinkedIn login is unconfigured', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /not active/i.test(document.querySelector('#commentary-status')?.textContent || ''));
  const panel = await page.$eval('#commentary-app', (element) => ({
    questionId: element.dataset.questionId,
    status: element.querySelector('#commentary-status')?.textContent.trim(),
    loginHidden: element.querySelector('#linkedin-login')?.hidden,
    formHidden: element.querySelector('#commentary-form')?.hidden,
    consent: {
      required: element.querySelector('#commentary-consent')?.required,
      checked: element.querySelector('#commentary-consent')?.checked,
    },
    deleteAccount: {
      type: element.querySelector('#commentary-delete-account')?.type,
      text: element.querySelector('#commentary-delete-account')?.textContent.trim(),
    },
    comments: element.querySelectorAll('#published-commentary li:not(.empty-commentary)').length,
  }));
  assert.equal(panel.questionId, 'he-episode-01-customer-evolution-v1');
  assert.match(panel.status, /not active in this preview/i);
  assert.equal(panel.loginHidden, true);
  assert.equal(panel.formHidden, true);
  assert.deepEqual(panel.consent, { required: true, checked: false });
  assert.deepEqual(panel.deleteAccount, { type: 'button', text: 'Delete account and submissions' });
  assert.equal(panel.comments, 0);
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
  assert.ok(cards.every(({ target, text, calls }) => target && /YES\s+—/.test(text) && /NO\s+—/.test(text) && /criteria in review/.test(text) && /not open/.test(text) && calls.join(',') === 'yes,no'));
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
  const rail = await page.$('.question-rail');
  const railBox = await rail.boundingBox();
  await page.mouse.move(railBox.x + 4, railBox.y + 4);
  await page.waitForFunction(() => [...document.querySelectorAll('.motion-card')].every((card) => getComputedStyle(card).animationPlayState === 'paused'));
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
  const rail = await page.$('.question-rail');
  const railBox = await rail.boundingBox();
  await page.mouse.move(railBox.x + 4, railBox.y + 4);
  await page.waitForFunction(() => [...document.querySelectorAll('.motion-card')].every((card) => getComputedStyle(card).animationPlayState === 'paused'));
  const questionId = await page.evaluate(() => [...document.querySelectorAll('.motion-card')].find((card) => {
    const label = card.querySelector('.card-call label:first-of-type');
    const rect = label.getBoundingClientRect();
    return card.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })?.dataset.questionId);
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
  assert.match(expanded.context, /Draft contract · criteria in review · not open/);
  assert.match(expanded.context, /YES threshold/);
  assert.match(expanded.context, /Resolve by/);
  assert.match(expanded.context, /Evidence \/ resolver/);
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

test('episode model follows the three-forecast system brief', async () => {
  const page = await newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const text = await page.$eval('#season', (section) => section.textContent.replace(/\s+/g, ' '));
  assert.match(text, /three forecasts per episode/i);
  assert.match(text, /structural/i);
  assert.match(text, /operating/i);
  assert.match(text, /fast-resolving/i);
  assert.match(text, /question pool/i);
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
