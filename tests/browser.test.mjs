import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import test, { after, before } from 'node:test';
import puppeteer from 'puppeteer-core';

const VIEWPORTS = [[320, 844], [390, 844], [430, 844], [768, 900], [1366, 768], [1440, 900]];
const CANONICAL = 'https://hollywoodevolves.mcpherson.app/';
let browser;
let child;
let origin;
let localPort;

export function browserCandidates(platform = process.platform, env = process.env) {
  if (env.BROWSER_EXECUTABLE_PATH) return [env.BROWSER_EXECUTABLE_PATH];
  if (platform === 'win32') {
    return [
      env.PROGRAMFILES && join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env['PROGRAMFILES(X86)'] && join(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env.PROGRAMFILES && join(env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      env['PROGRAMFILES(X86)'] && join(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ].filter(Boolean);
  }
  const pathCandidates = (env.PATH || '').split(delimiter).flatMap((directory) =>
    ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge'].map((name) => join(directory, name)));
  return [...pathCandidates, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
}

function executable() {
  const path = browserCandidates().find(existsSync);
  if (!path) throw new Error('No supported Chromium browser found. Set BROWSER_EXECUTABLE_PATH.');
  return path;
}

async function randomPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}

async function page(width = 1366, height = 768) {
  const instance = await browser.newPage();
  await instance.setViewport({ width, height });
  await instance.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  return instance;
}

before(async () => {
  localPort = await randomPort();
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(localPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.stdout.on('data', (data) => { if (data.toString().includes('listening')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', (code) => reject(new Error(`Server exited (${code})`)));
  });
  origin = `http://127.0.0.1:${localPort}`;
  browser = await puppeteer.launch({
    executablePath: executable(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', `--explicitly-allowed-ports=${localPort}`],
  });
});

after(async () => {
  await browser?.close();
  if (child?.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  }
});

test('browser discovery is portable and the server uses an explicit randomized-port gate', () => {
  const windows = browserCandidates('win32', { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\reader\\AppData\\Local' });
  assert.ok(windows.some((candidate) => candidate.endsWith('Google/Chrome/Application/chrome.exe')));
  assert.ok(windows.some((candidate) => candidate.endsWith('Microsoft/Edge/Application/msedge.exe')));
  assert.ok(browserCandidates('linux', { PATH: '/bin:/usr/bin' }).some((candidate) => candidate.endsWith('/chromium')));
  assert.ok(Number.isInteger(localPort) && localPort > 0 && localPort !== 5173);
  assert.equal(origin, `http://127.0.0.1:${localPort}`);
  assert.ok(browser.process().spawnargs.includes(`--explicitly-allowed-ports=${localPort}`));
});

test('subject-first cover has one clear action and no host portrait', async () => {
  const p = await page();
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  const cover = await p.$eval('.hero', (hero) => ({
    heading: hero.querySelector('h1').textContent.trim(),
    actions: [...hero.querySelectorAll('a')].map((node) => node.textContent.trim()),
    portraits: hero.querySelectorAll('img').length,
    bottom: Math.round(hero.getBoundingClientRect().bottom),
  }));
  assert.match(cover.heading, /Technology.*Hollywood/);
  assert.deepEqual(cover.actions, ['Read the first question ↓']);
  assert.equal(cover.portraits, 0);
  assert.ok(cover.bottom <= 840, JSON.stringify(cover));
  await p.close();
});

test('homepage viewport matrix preserves reflow, grid, type, target, and reading budgets', async () => {
  const records = [];
  for (const [width, height] of VIEWPORTS) {
    const p = await page(width, height);
    await p.goto(origin, { waitUntil: 'networkidle0' });
    const metrics = await p.evaluate(() => {
      const visible = (node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const targets = [...document.querySelectorAll('a,button,summary,label,input:not([type="radio"])')]
        .filter(visible).map((node) => {
          const rect = node.getBoundingClientRect();
          return { node: `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}`, width: rect.width, height: rect.height };
        });
      const gridChecks = [...document.querySelectorAll('.header-grid,.chapter>.grid')].flatMap((grid) => {
        const style = getComputedStyle(grid);
        const columns = style.gridTemplateColumns.split(' ').map(Number);
        const gap = Number.parseFloat(style.columnGap);
        const start = grid.getBoundingClientRect().left;
        const lines = [start];
        for (const column of columns) lines.push(lines.at(-1) + column + gap);
        return [...grid.children].filter(visible).map((child) => {
          const left = child.getBoundingClientRect().left;
          return { child: child.tagName, error: Math.min(...lines.map((line) => Math.abs(left - line))) };
        });
      });
      const headingClips = [...document.querySelectorAll('h1,h2')].filter(visible).map((heading) => {
        const style = getComputedStyle(heading);
        const lineHeight = Number.parseFloat(style.lineHeight);
        return { text: heading.textContent.trim(), clipped: ['hidden', 'clip'].includes(style.overflow) || heading.clientHeight + 2 < lineHeight };
      });
      const mainText = document.querySelector('main').innerText;
      const paragraphs = [...document.querySelectorAll('main p')].filter(visible);
      const operating = document.querySelector('.operating-system');
      return {
        width: innerWidth,
        height: document.documentElement.scrollHeight,
        viewports: document.documentElement.scrollHeight / innerHeight,
        words: mainText.split(/\s+/).filter(Boolean).length,
        blocks: [...document.querySelectorAll('main>section')].filter(visible).map(({ id, className }) => id || className.split(' ')[0]),
        paragraphs: paragraphs.length,
        longParagraphs: paragraphs.filter((node) => node.innerText.split(/\s+/).filter(Boolean).length >= 20).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        smallTargets: targets.filter(({ width: targetWidth, height: targetHeight }) => targetWidth < 43.5 || targetHeight < 43.5),
        gridErrors: gridChecks.filter(({ error }) => error > 1.5),
        headingClips: headingClips.filter(({ clipped }) => clipped),
        operatingRects: operating.getClientRects().length,
        operatingWhiteSpace: getComputedStyle(operating).whiteSpace,
      };
    });
    records.push(metrics);
    assert.ok(metrics.overflow <= 1, `${width}x${height}: overflow ${metrics.overflow}px`);
    assert.deepEqual(metrics.smallTargets, [], `${width}x${height} small targets`);
    assert.deepEqual(metrics.gridErrors, [], `${width}x${height} off-grid children`);
    assert.deepEqual(metrics.headingClips, [], `${width}x${height} clipped headings`);
    assert.ok(metrics.operatingRects === 1 || metrics.operatingWhiteSpace === 'nowrap', `${width}x${height}: Operating System wraps`);
    assert.equal(metrics.blocks.length, 6, `${width}x${height}: essential chapter count`);
    assert.ok(metrics.words > 300 && metrics.paragraphs >= 15 && metrics.longParagraphs >= 5, JSON.stringify(metrics));
    await p.close();
  }
  const mobile390 = records.find(({ width }) => width === 390);
  assert.ok(mobile390.viewports < 8.4, JSON.stringify(mobile390));
  assert.ok(mobile390.words < 615, JSON.stringify(mobile390));
  console.log(`HOMEPAGE_MATRIX ${JSON.stringify(records)}`);
});

test('homepage stays free of console, page, and CSP errors after representative interactions', async () => {
  const p = await page(390, 844);
  const failures = [];
  p.on('console', (message) => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });
  p.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (event) => {
    console.error(`CSP: ${event.violatedDirective} ${event.blockedURI}`);
  }));
  await p.goto(origin, { waitUntil: 'networkidle0' });
  await p.click('.menu-button');
  await p.keyboard.press('Escape');
  await p.click('#question-04 summary');
  await p.click('#share-forecast');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(failures, []);
  await p.close();
});

test('reduced motion is static and does not move content', async () => {
  const p = await page();
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(origin, { waitUntil: 'networkidle0' });
  const state = await p.evaluate(async () => {
    const authored = [...document.querySelectorAll('body *')].filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const moving = authored.filter((node) => {
      const style = getComputedStyle(node);
      return style.animationName !== 'none' || style.transitionDuration.split(',').some((value) => Number.parseFloat(value) > 0);
    }).map((node) => node.tagName);
    const tracked = [...document.querySelectorAll('main>section,.supply-instrument,.artifact')];
    const before = tracked.map((node) => node.getBoundingClientRect().toJSON());
    await new Promise((resolve) => setTimeout(resolve, 250));
    const after = tracked.map((node) => node.getBoundingClientRect().toJSON());
    return { motion: matchMedia('(prefers-reduced-motion: reduce)').matches, moving, before, after, scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior };
  });
  assert.equal(state.motion, true);
  assert.equal(state.scrollBehavior, 'auto');
  assert.deepEqual(state.moving, []);
  assert.deepEqual(state.after, state.before);
  await p.close();
});

test('forced colors preserves meaningful Episode 01 selection and disclosure focus states', async () => {
  const p = await page(390, 844);
  await p._client().send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'forced-colors', value: 'active' }] });
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  await p.click('.reader-call label:has(input[value="yes"])');
  await p.evaluate(() => document.body.focus());
  for (let index = 0; index < 40; index += 1) {
    await p.keyboard.press('Tab');
    if (await p.evaluate(() => document.activeElement.matches('#question-03 summary'))) break;
  }
  const state = await p.evaluate(() => {
    const input = document.querySelector('#forecast-yes');
    const selected = getComputedStyle(input.nextElementSibling);
    const summary = document.querySelector('#question-03 summary');
    const focus = getComputedStyle(summary);
    return {
      active: matchMedia('(forced-colors: active)').matches,
      checked: input.checked,
      focused: document.activeElement === summary,
      selectedOutline: `${selected.outlineStyle} ${selected.outlineWidth}`,
      focusOutline: `${focus.outlineStyle} ${focus.outlineWidth}`,
    };
  });
  assert.equal(state.active, true);
  assert.equal(state.checked, true);
  assert.equal(state.focused, true);
  assert.match(state.selectedOutline, /solid (?:3|4)px/);
  assert.match(state.focusOutline, /solid 3px/);
  await p.close();
});

test('skip link, mobile menu, and native disclosures preserve keyboard focus', async () => {
  const p = await page(390, 844);
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.activeElement.classList.contains('skip')), true);
  await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'main');

  await p.focus('.menu-button');
  await p.keyboard.press('Enter');
  assert.equal(await p.$eval('.menu-button', (button) => button.getAttribute('aria-expanded')), 'true');
  await p.keyboard.press('Escape');
  assert.deepEqual(await p.$eval('.menu-button', (button) => [button.getAttribute('aria-expanded'), document.activeElement === button]), ['false', true]);

  await p.focus('#question-03 summary');
  await p.keyboard.press('Enter');
  assert.equal(await p.$eval('#question-03 details', (details) => details.open), true);
  await p.keyboard.press('Enter');
  assert.deepEqual(await p.$eval('#question-03 details', (details) => [details.open, document.activeElement === details.querySelector('summary')]), [false, true]);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('#question-03 details').open);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !document.querySelector('#question-03 details').open && document.activeElement === document.querySelector('#question-03 summary'));
  assert.deepEqual(await p.$eval('#question-03 details', (details) => [details.open, document.activeElement === details.querySelector('summary')]), [false, true]);
  await p.close();
});

test('the featured Episode 01 private call persists without question-pool voting controls', async () => {
  const p = await page(390, 844);
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.removeItem('he-private-forecast'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.click('.reader-call label:has(input[value="yes"])');
  assert.equal(await p.$eval('#forecast-yes', (input) => input.checked), true);
  assert.equal(await p.evaluate(() => localStorage.getItem('he-private-forecast')), 'yes');
  assert.equal(await p.$('[data-question-call], .compact-call'), null);
  await p.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await p.$eval('#forecast-yes', (input) => input.checked), true);
  await p.close();
});

test('all seven pool summaries are pointer and keyboard operable with readable contracts', async () => {
  const p = await page(390, 844);
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  for (let number = 2; number <= 8; number += 1) {
    const id = `question-0${number}`;
    await p.click(`#${id} summary`);
    assert.equal(await p.$eval(`#${id} details`, ({ open }) => open), true, `${id} pointer open`);
    const contract = await p.$eval(`#${id} .season-contract`, (node) => ({
      question: node.querySelector('.editorial-question').textContent.trim(),
      terms: [...node.querySelectorAll('dt')].map(({ textContent }) => textContent.trim()),
    }));
    assert.ok(contract.question.endsWith('?'), `${id} readable question`);
    assert.deepEqual(contract.terms, ['Threshold', 'Deadline', 'Evidence']);
    await p.click(`#${id} summary`);
    await p.focus(`#${id} summary`);
    await p.keyboard.press('Enter');
    assert.equal(await p.$eval(`#${id} details`, ({ open }) => open), true, `${id} keyboard open`);
    await p.keyboard.press('Enter');
  }
  assert.equal(await p.$('[data-question-call], .compact-call'), null);
  await p.close();
});

test('visible season summaries win their center-point hit tests', async () => {
  for (const [width, height] of [[390, 844], [1366, 768]]) {
    const p = await page(width, height);
    await p.goto(origin, { waitUntil: 'domcontentloaded' });
    const misses = await p.evaluate(async () => {
      const misses = [];
      document.documentElement.style.scrollBehavior = 'auto';
      for (const node of document.querySelectorAll('.season-slate summary')) {
        const style = getComputedStyle(node);
        let rect = node.getBoundingClientRect();
        if (style.display === 'none' || rect.width <= 0 || rect.height <= 0) continue;
        node.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise((resolve) => requestAnimationFrame(resolve));
        rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (node !== hit && !node.contains(hit)) misses.push({ node: node.outerHTML.slice(0, 100), hit: hit?.outerHTML.slice(0, 100) });
      }
      return misses;
    });
    assert.deepEqual(misses, [], `${width}px center-point misses`);
    await p.close();
  }
});

test('malformed and unknown fragments are ignored without breaking local calls or sharing', async () => {
  for (const fragment of ['#%5B', '#question-does-not-exist']) {
    const p = await page();
    const failures = [];
    p.on('pageerror', (error) => failures.push(error.message));
    await p.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: (data) => { window.__shared = data; return Promise.resolve(); } });
    });
    await p.goto(`${origin}/${fragment}`, { waitUntil: 'domcontentloaded' });
    await p.click('.reader-call label:has(input[value="yes"])');
    assert.equal(await p.$eval('#forecast-yes', ({ checked }) => checked), true);
    await p.click('#share-forecast');
    await p.waitForFunction(() => window.__shared);
    assert.equal(await p.evaluate(() => window.__shared.url), `${CANONICAL}#question-01`);
    assert.deepEqual(failures, [], fragment);
    await p.close();
  }
});

async function sharePage(question, setup) {
  const p = await page();
  await p.evaluateOnNewDocument(setup);
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  await p.click('#question-04 summary');
  if (question !== 'question-04') await p.click(`#${question} summary`);
  assert.equal(await p.$eval('#question-04 details', ({ open }) => open), true);
  assert.equal(await p.$eval(`#${question} details`, ({ open }) => open), true);
  assert.equal(await p.evaluate(() => location.hash), `#${question}`);
  await p.click('#share-forecast');
  return p;
}

test('native share receives the canonical active-question URL from a real click', async () => {
  const p = await sharePage('question-05', () => Object.defineProperty(navigator, 'share', { configurable: true, value: (data) => { window.__shared = data; return Promise.resolve(); } }));
  await p.waitForFunction(() => window.__shared);
  assert.equal(await p.evaluate(() => window.__shared.url), `${CANONICAL}#question-05`);
  assert.equal(await p.$eval('#share-status', (node) => node.textContent), 'Sharing request completed.');
  await p.close();
});

test('clipboard fallback copies the canonical active-question URL from a real click', async () => {
  const p = await sharePage('question-06', () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (value) => { window.__copied = value; return Promise.resolve(); } } });
  });
  await p.waitForFunction(() => window.__copied);
  assert.equal(await p.evaluate(() => window.__copied), `${CANONICAL}#question-06`);
  assert.equal(await p.$eval('#share-status', (node) => node.textContent), 'Question URL copied.');
  await p.close();
});

test('manual fallback reveals, focuses, and selects the canonical active-question URL', async () => {
  const p = await sharePage('question-07', () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await p.waitForFunction(() => !document.querySelector('#share-fallback').hidden);
  const state = await p.$eval('#share-url', (input) => ({
    value: input.value,
    readonly: input.readOnly,
    focused: document.activeElement === input,
    selected: input.selectionStart === 0 && input.selectionEnd === input.value.length,
  }));
  assert.deepEqual(state, { value: `${CANONICAL}#question-07`, readonly: true, focused: true, selected: true });
  await p.close();
});

test('no-JS at narrow widths retains nav, eight questions/contracts, story, and reflow', async () => {
  for (const width of [320, 390]) {
    const p = await page(width, 844);
    await p.setJavaScriptEnabled(false);
    await p.goto(origin, { waitUntil: 'domcontentloaded' });
    const state = await p.evaluate(() => {
      const visible = (node) => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
      return {
        menuButton: getComputedStyle(document.querySelector('.menu-button')).display,
        navLinks: [...document.querySelectorAll('.nav-links a')].filter(visible).length,
        questions: document.querySelectorAll('.editorial-question').length,
        visibleQuestions: [...document.querySelectorAll('.editorial-question')].filter(visible).length,
        contracts: 1 + [...document.querySelectorAll('.season-contract')].filter(visible).length,
        chapters: [...document.querySelectorAll('main>section')].filter(visible).length,
        words: document.querySelector('main').innerText.split(/\s+/).filter(Boolean).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.deepEqual(state, { menuButton: 'none', navLinks: 6, questions: 8, visibleQuestions: 8, contracts: 8, chapters: 6, words: state.words, overflow: state.overflow });
    assert.ok(state.words >= 450, `${width}px no-JS story has ${state.words} words`);
    assert.ok(state.overflow <= 1, `${width}px no-JS overflow ${state.overflow}px`);
    await p.close();
  }
});

test('homepage passes axe at all required release viewports', async () => {
  const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const [width, height] of VIEWPORTS) {
    const p = await page(width, height);
    await p.goto(origin, { waitUntil: 'domcontentloaded' });
    await p.evaluate(axe);
    const violations = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa'] } }).then(({ violations }) => violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))));
    assert.deepEqual(violations, [], `homepage at ${width}x${height}`);
    await p.close();
  }
});

test('legal pages pass axe at representative mobile and desktop widths', async () => {
  const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const width of [390, 1440]) for (const path of ['/accessibility.html', '/privacy.html', '/terms.html']) {
    const p = await page(width, 900);
    await p.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(axe);
    const violations = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa'] } }).then(({ violations }) => violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))));
    assert.deepEqual(violations, [], `${path} at ${width}px`);
    await p.close();
  }
});

test('homepage fonts load only from the local origin', async () => {
  const p = await page();
  const requests = [];
  p.on('request', (request) => { if (request.resourceType() === 'font') requests.push(request.url()); });
  await p.goto(origin, { waitUntil: 'networkidle0' });
  assert.ok(requests.length >= 3);
  assert.ok(requests.every((url) => new URL(url).origin === origin), requests.join('\n'));
  await p.close();
});
