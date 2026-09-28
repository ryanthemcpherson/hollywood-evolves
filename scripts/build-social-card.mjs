// Rasterizes public/brand/social-card.svg to the 1200×630 PNG used for Open Graph and Twitter previews.
// Run `npm run art` first, then `npm run social-card`; both outputs are committed.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = new URL('../', import.meta.url);
const font = (file) => new URL(`public/fonts/${file}`, root).href;
const svgMarkup = readFileSync(new URL('public/brand/social-card.svg', root), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Newsreader";src:url("${font('newsreader-latin-variable.woff2')}") format("woff2");font-weight:400 600}
@font-face{font-family:"DM Mono";src:url("${font('dm-mono-latin-500.woff2')}") format("woff2");font-weight:500}
html,body{margin:0;background:#171715}svg{display:block}
</style></head><body>${svgMarkup}</body></html>`;

const candidates = [
  process.env.BROWSER_EXECUTABLE_PATH,
  process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error('No Chromium-family browser found. Set BROWSER_EXECUTABLE_PATH.');

const workDirectory = mkdtempSync(join(tmpdir(), 'he-social-card-'));
const page = join(workDirectory, 'card.html');
writeFileSync(page, html);
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--allow-file-access-from-files'] });
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' });
  const fontsReady = await tab.evaluate(async () => {
    await document.fonts.load('66px Newsreader');
    await document.fonts.load('500 19px "DM Mono"');
    return document.fonts.check('66px Newsreader') && document.fonts.check('500 19px "DM Mono"');
  });
  if (!fontsReady) throw new Error('Brand fonts failed to load; refusing to render the social card with fallback type.');
  await tab.screenshot({ path: fileURLToPath(new URL('public/brand/social-card.png', root)), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('Rendered public/brand/social-card.png (1200×630).');
} finally {
  await browser.close();
  rmSync(workDirectory, { recursive: true, force: true });
}
