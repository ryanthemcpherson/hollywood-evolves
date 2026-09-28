import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const prohibited = /\b(?:demo|preview|draft|planned|coming[ -]soon|future[ -]system)\b|\b(?:Spotify|Apple Podcasts|YouTube)\b|\b\d{1,3}%\b/i;
const section = (html, className) => html.match(new RegExp(`<section class="${className}\\b[\\s\\S]*?<\\/section>`))?.[0];
const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('homepage contains no unavailable states, fake values, or platform promises', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.doesNotMatch(`${html}\n${js}`, prohibited);
  assert.doesNotMatch(html, /data-demo|class="ledger"|hero-dock|demo-banner/);
});

test('the cover states the executive brief thesis and production credit', async () => {
  const html = await read('index.html');
  const hero = section(html, 'hero');
  assert.ok(hero, 'hero section exists');
  assert.match(hero, /<h1 id="hero-title">Hollywood keeps reinventing itself\. <span class="hero-question">What happens next\?<\/span><\/h1>/);
  assert.match(text(hero), /tools, talent, and business models have repeatedly reinvented themselves/);
  assert.match(text(hero), /Produced by TMT Insights in partnership with the Digital Entertainment Group, marking DEG’s 30th anniversary\./);
  assert.match(hero, /<a class="primary-action" href="#forecast">/);
  assert.match(hero, /<img src="\/art\/hero\.svg" alt=""/);
  assert.doesNotMatch(hero, /ian-mcpherson/);
});

test('the format chapter reproduces the brief’s three-act running order and guest pairing', async () => {
  const html = await read('index.html');
  const format = section(html, 'format chapter');
  assert.ok(format, 'format chapter exists');
  const acts = [...format.matchAll(/<li class="act act--(\w+)"><span class="act-time">(\d+) min<\/span><strong>([^<]+)<\/strong>/g)]
    .map(([, key, minutes, title]) => ({ key, minutes: Number(minutes), title }));
  assert.deepEqual(acts, [
    { key: 'intro', minutes: 5, title: 'Introduction' },
    { key: 'past', minutes: 10, title: 'Act I — The Past' },
    { key: 'present', minutes: 10, title: 'Act II — The Present' },
    { key: 'future', minutes: 10, title: 'Act III — Future Synthesis' },
  ]);
  for (const role of ['The host', 'The historical guest', 'The operating guest']) assert.match(format, new RegExp(`<strong>${role}</strong>`));
  assert.match(text(format), /the audience casts a Community Forecast against it/);
});

test('Season One follows the brief’s numbered slate with synopses and illustrations', async () => {
  const html = await read('index.html');
  const season = section(html, 'season chapter');
  assert.ok(season, 'season chapter exists');
  const episodes = [...season.matchAll(/<p class="episode-number">Episode (\d{2})<\/p><h3>([^<]+)<\/h3>/g)].map(([, number, title]) => `${number} ${title}`);
  assert.deepEqual(episodes, [
    '01 Customer Evolution', '02 Media Supply Chain Evolution', '03 Creator Evolution', '04 Content Evolution',
    '05 Commercial Evolution', '06 Audio Evolution', '07 VFX Evolution', '08 Animation Evolution',
  ]);
  assert.equal((season.match(/class="episode-synopsis"/g) || []).length, 8);
  for (let number = 1; number <= 8; number += 1) assert.match(season, new RegExp(`<img src="/art/episode-0${number}\\.svg" alt=""`));
  for (const phrase of ['1947 theatergoer', 'Complexity Tax', 'Contract Player', 'Synthetic Idol', 'fixed, finished event', 'broadcast syndication', 'synchronized sound', 'Georges Méliès', 'theater-filler shorts']) {
    assert.ok(season.includes(phrase), `synopsis phrase: ${phrase}`);
  }
  assert.equal((season.match(/<details/g) || []).length, 7);
  assert.match(season, /<a class="episode-link" href="#question-01">/);
});

test('the history chapter sets dated past and present pivots against every episode', async () => {
  const html = await read('index.html');
  const history = section(html, 'history chapter');
  assert.ok(history, 'history chapter exists');
  const eras = [...history.matchAll(/<div class="era era--(past|present)">[\s\S]*?<\/ol>/g)].map(([markup, era]) => ({
    era,
    milestones: [...markup.matchAll(/<time datetime="(\d{4})">\d{4}<\/time><p>[^\n]+?<\/p><a href="#([a-z0-9-]+)">Episode (\d{2}) · ([^<]+)<\/a>/g)]
      .map(([, year, target, number, title]) => ({ year: Number(year), target, number, title })),
  }));
  assert.deepEqual(eras.map(({ era, milestones }) => [era, milestones.length]), [['past', 7], ['present', 7]]);
  for (const { era, milestones } of eras) {
    const years = milestones.map(({ year }) => year);
    assert.deepEqual(years, [...years].sort((a, b) => a - b), `${era} milestones run in date order`);
    assert.ok(era === 'past' ? years.every((year) => year < 1990) : years.every((year) => year >= 1990), `${era}: ${years}`);
  }
  const titles = new Map([...html.matchAll(/<p class="episode-number">Episode (\d{2})<\/p><h3>([^<]+) Evolution<\/h3>/g)].map(([, number, title]) => [number, title]));
  const all = eras.flatMap(({ milestones }) => milestones);
  for (const { year, target, number, title } of all) {
    assert.ok(html.includes(`id="${target}"`), `${year} links to an existing anchor`);
    assert.equal(target.endsWith(`-${number}`), true, `${year} links to its own episode`);
    assert.equal(title, titles.get(number), `${year} names Episode ${number} correctly`);
  }
  assert.deepEqual([...new Set(all.map(({ number }) => number))].sort(), ['01', '02', '03', '04', '05', '06', '07', '08']);
});

test('the social card pairs the thesis with the projector art and the canonical wordmark', async () => {
  const [card, wordmark, png] = await Promise.all([
    read('public/brand/social-card.svg'),
    read('public/brand/wordmark-inverse.svg'),
    readFile(new URL('../public/brand/social-card.png', import.meta.url)),
  ]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.match(card, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630"/);
  for (const line of ['Hollywood keeps', 'reinventing itself.', 'What happens next?', 'AN EXECUTIVE PODCAST SERIES · SEASON ONE']) assert.ok(card.includes(`>${line}</text>`), line);
  const wordmarkBody = wordmark.trim().replace(/^<svg\b[^>]*>/, '').replace(/<title[^>]*>.*?<\/title>/, '');
  assert.ok(card.includes(wordmarkBody), 'embeds the canonical inverse wordmark unchanged');
  assert.doesNotMatch(card, /partnership|<script|<image|href="(?:https?:|\/\/)/i);
});

test('each editorial question appears once with a complete contract', async () => {
  const html = await read('index.html');
  const questions = [...html.matchAll(/<p class="editorial-question">([^<]+)<\/p>/g)].map((match) => match[1].trim());
  assert.equal(questions.length, 8);
  assert.equal(new Set(questions).size, 8, 'each question is narrated once');
  for (const term of ['Threshold', 'Deadline', 'Evidence']) assert.equal((html.match(new RegExp(`<dt>${term}</dt>`, 'g')) || []).length, 8);
  for (let number = 2; number <= 8; number += 1) assert.match(html, new RegExp(`<li class="episode" id="question-0${number}">`));
});

test('the Episode 01 chapter pairs the measurable question with a private probability forecast', async () => {
  const html = await read('index.html');
  const chapter = section(html, 'forecast chapter');
  assert.ok(chapter, 'forecast chapter exists');
  assert.match(chapter, /<h2 id="forecast-title">When does the ad tier become the main tier\?<\/h2>/);
  assert.match(chapter, /<article class="question-block" id="question-01"/);
  assert.match(chapter, /Will at least three of Netflix, Disney\+, HBO Max, Peacock, and Paramount\+ report more U\.S\. subscribers/);
  assert.match(chapter, /<input id="forecast-probability" type="range" min="0" max="100" step="1" value="50"/);
  assert.match(chapter, /<output id="forecast-output" for="forecast-probability">Not set<\/output>/);
  assert.match(text(chapter), /not submitted, published, or counted in a Community Forecast/);
  assert.doesNotMatch(chapter, /type="radio"/);
});

test('the prediction-market chapter uses the brief’s Expert Alpha, Community Forecast, and Market Update loop', async () => {
  const html = await read('index.html');
  const market = section(html, 'market chapter');
  assert.ok(market, 'market chapter exists');
  const steps = [...market.matchAll(/<li><span>(\d{2})<\/span><strong>([^<]+)<\/strong>/g)].map(([, number, title]) => `${number} ${title}`);
  assert.deepEqual(steps, ['01 Expert Alpha', '02 Community Forecast', '03 Market Update']);
  assert.match(text(market), /calibration, not crowning winners/);
});

test('illustrations are original, self-contained, brand-colored vector art', async () => {
  const brand = new Set(['#171715', '#F3EFE6', '#E5DED1', '#A8342A', '#78A9B5', '#625D55', '#FAF7F0']);
  for (const file of ['hero', 'chairs', ...Array.from({ length: 8 }, (_, index) => `episode-0${index + 1}`)]) {
    const art = await read(`public/art/${file}.svg`);
    assert.match(art, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+" width="\d+" height="\d+">/);
    assert.doesNotMatch(art, /<script|<style|<image|\sstyle=|href="(?:https?:|\/\/)/i, file);
    const colors = [...art.matchAll(/#[0-9a-f]{6}\b/gi)].map(([value]) => value.toUpperCase());
    assert.ok(colors.length > 0 && colors.every((value) => brand.has(value)), `${file}: ${[...new Set(colors)]}`);
  }
});

test('mobile contract keeps authored targets at 44px, native disclosures, and no motion', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('src/style.css')]);
  assert.doesNotMatch(html, /data-question-call|compact-call|question-0[1-8]-call/);
  assert.match(css, /--target:\s*44px/);
  assert.doesNotMatch(css, /@keyframes|animation\s*:|transition\s*:/);
  assert.match(css, /\.season-slate summary::after\s*\{[^}]*content:\s*"\+"/);
  assert.match(css, /\.season-slate details\[open\]>summary::after\s*\{[^}]*content:\s*"−"/);
  assert.match(css, /\.probability label\{[^}]*min-height:var\(--target\)/);
});

test('forecast, canonical share, native details, and keyboard code remain', async () => {
  const [html, js] = await Promise.all([read('index.html'), read('src/main.js')]);
  assert.match(html, /rel="canonical"/);
  assert.equal((html.match(/<details/g) || []).length, 7);
  for (const term of ['localStorage', 'he-private-forecast', 'aria-valuetext', 'navigator.share', 'navigator.clipboard', "event.key === 'Escape'"]) {
    assert.ok(js.includes(term), term);
  }
});
