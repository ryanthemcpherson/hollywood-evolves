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
function executable() {
  if (process.env.BROWSER_EXECUTABLE_PATH) return process.env.BROWSER_EXECUTABLE_PATH;
  const path = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
  if (!path) throw new Error('No supported Chromium browser found. Set BROWSER_EXECUTABLE_PATH.');
  return path;
}
async function port() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function page(width = 1366, height = 768) {
  const instance = await browser.newPage();
  await instance.setBypassCSP(true);
  await instance.setViewport({ width, height });
  await instance.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  return instance;
}
before(async () => {
  const localPort = await port();
  child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(localPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
    child.stdout.on('data', (data) => { if (data.toString().includes('listening')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', (code) => reject(new Error(`Server exited (${code})`)));
  });
  origin = `http://127.0.0.1:${localPort}`;
  browser = await puppeteer.launch({ executablePath: executable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', `--explicitly-allowed-ports=${localPort}`] });
});
after(async () => {
  await browser?.close();
  if (child?.exitCode === null) { const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await exited; }
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

test('local calls persist, clear, and survive unavailable storage', async () => {
  const p = await page(390, 844);
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  await p.click('#forecast-yes');
  assert.equal(await p.evaluate(() => localStorage.getItem('he-private-forecast')), 'yes');
  await p.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await p.$eval('#forecast-yes', (input) => input.checked), true);
  await p.click('#reset-forecast');
  assert.equal(await p.evaluate(() => localStorage.getItem('he-private-forecast')), null);
  await p.close();

  const denied = await page(390, 844);
  await denied.evaluateOnNewDocument(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, { configurable: true, value() { throw new DOMException('Denied', 'SecurityError'); } });
  });
  await denied.goto(origin, { waitUntil: 'domcontentloaded' });
  await denied.click('#forecast-no');
  assert.equal(await denied.$eval('#forecast-no', (input) => input.checked), true);
  await denied.close();
});

test('mobile menu escape and native question disclosure are keyboard operable', async () => {
  const p = await page(390, 844);
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
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
  await p.close();
});

test('no-JS reading order retains navigation and all question contracts', async () => {
  const p = await page(390, 844);
  await p.setJavaScriptEnabled(false);
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  const state = await p.evaluate(() => ({
    menu: getComputedStyle(document.querySelector('.menu-button')).display,
    links: [...document.querySelectorAll('.nav-links a')].every((node) => node.getBoundingClientRect().height > 0),
    contracts: [...document.querySelectorAll('.season-contract')].filter((node) => getComputedStyle(node).display !== 'none').length,
  }));
  assert.deepEqual(state, { menu: 'none', links: true, contracts: 7 });
  await p.close();
});

test('canonical sharing follows an active season question', async () => {
  const p = await page();
  await p.goto(origin, { waitUntil: 'domcontentloaded' });
  await p.click('#question-04 summary');
  await p.waitForFunction(() => document.querySelector('#share-forecast')?.dataset.shareUrl?.endsWith('#question-04'));
  assert.equal(await p.$eval('#share-forecast', (button) => button.dataset.shareUrl), 'https://hollywoodevolves.mcpherson.app/#question-04');
  await p.close();
});

test('mobile edition meets reading, geometry, and target budgets', async () => {
  const p = await page(390, 844);
  await p.goto(origin, { waitUntil: 'networkidle0' });
  const metrics = await p.evaluate(() => {
    const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
    const words = document.querySelector('main').innerText.split(/\s+/).filter(Boolean).length;
    const targets = [...document.querySelectorAll('a,button,summary,label,input:not([type="radio"])')].filter(visible).map((node) => { const rect = node.getBoundingClientRect(); return { tag: node.tagName, width: rect.width, height: rect.height }; });
    const sections = Object.fromEntries(['top', 'past', 'present', 'forecast', 'season', 'host', 'method'].map((id) => { const rect = document.querySelector(`#${id}`).getBoundingClientRect(); return [id, Math.round(rect.height)]; }));
    return { height: document.documentElement.scrollHeight, words, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, minTarget: Math.min(...targets.map(({ width, height }) => Math.min(width, height))), small: targets.filter(({ width, height }) => width < 44 || height < 44), sections };
  });
  console.log(`MOBILE_GEOMETRY ${JSON.stringify(metrics)}`);
  assert.ok(metrics.height < 6500, `page is ${metrics.height}px`);
  assert.ok(metrics.words < 550, `visible word count is ${metrics.words}`);
  assert.ok(metrics.overflow <= 1, `overflow is ${metrics.overflow}px`);
  assert.deepEqual(metrics.small, []);
  await p.close();
});

test('desktop geometry uses one grid without overflow and one portrait', async () => {
  const p = await page();
  await p.goto(origin, { waitUntil: 'networkidle0' });
  const metrics = await p.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    portraits: document.querySelectorAll('img[src$="ian-mcpherson.webp"]').length,
    sections: Object.fromEntries(['top', 'past', 'present', 'forecast', 'season', 'host', 'method'].map((id) => [id, Math.round(document.querySelector(`#${id}`).getBoundingClientRect().height)])),
  }));
  console.log(`DESKTOP_GEOMETRY ${JSON.stringify(metrics)}`);
  assert.ok(metrics.height < 6200);
  assert.ok(metrics.overflow <= 1);
  assert.equal(metrics.portraits, 1);
  await p.close();
});

test('homepage and legal pages pass axe at mobile and desktop widths', async () => {
  const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const width of [390, 1440]) for (const path of ['/', '/accessibility.html', '/privacy.html', '/terms.html']) {
    const p = await page(width, 900);
    await p.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    await p.addScriptTag({ content: axe });
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
