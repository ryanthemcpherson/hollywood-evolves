import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const html = read('index.html');
const css = read('src/style.css');
const js = read('src/main.js');
const failures = [];
const required = ['Hollywood', 'Operating System', 'Customer Evolution', 'Media Supply Chain Evolution', 'Creator Evolution', 'Content Evolution', 'Commercial Evolution', 'Audio Evolution', 'VFX Evolution', 'Animation Evolution', 'December 31, 2029', 'Head of Business Development at TMT Insights', '11 years at AWS', 'Digital Entertainment Group (DEG)'];
for (const term of required) if (!html.includes(term)) failures.push(`Missing required copy: ${term}`);

const prohibited = /\b(?:demo|preview|draft|planned|coming[ -]soon|future[ -]system)\b|\b(?:Spotify|Apple Podcasts|YouTube)\b|\b\d{1,3}%\b/i;
if (prohibited.test(`${html}\n${js}`)) failures.push('Homepage or homepage JavaScript contains a prohibited state, fake value, or platform promise.');
for (const pattern of [/data-demo/i, /class="ledger"/i, /hero-dock/i, /@keyframes/i, /animation\s*:/i, /linear-gradient/i, /radial-gradient/i, /<style\b|\sstyle\s*=/i]) if (pattern.test(`${html}\n${css}`)) failures.push(`Forbidden homepage pattern: ${pattern}`);
for (const id of ['top', 'past', 'present', 'forecast', 'season', 'host', 'method']) if ((html.match(new RegExp(`id="${id}"`, 'g')) || []).length !== 1) failures.push(`Chapter ${id} must appear exactly once.`);
if ((html.match(/ian-mcpherson\.webp/g) || []).length !== 1) failures.push('Ian portrait must appear exactly once.');
if (!/<span class="operating-system">Operating System<\/span>/.test(html)) failures.push('Operating System must remain grouped.');
const questions = [...html.matchAll(/<p class="editorial-question">([^<]+)<\/p>/g)].map((match) => match[1].trim());
if (questions.length !== 8 || new Set(questions).size !== 8) failures.push('Eight singular editorial questions are required.');
if (/data-question-call|compact-call|name="question-0[1-8]-call"/.test(html) || /compact-call/.test(css) || js.includes('he-private-question-calls')) failures.push('The question pool must remain native disclosures without local voting controls or storage.');
if ((html.match(/<details/g) || []).length !== 7) failures.push('Themes 02–08 require native disclosures.');
if (!/--target:\s*44px/.test(css)) failures.push('The shared target minimum must be 44px.');
if (!/@media\s*\(max-width:\s*700px\)[\s\S]*\.season-contract\s*\{[^}]*display:\s*none/.test(css)) failures.push('Enhanced mobile contracts must use progressive disclosure.');
for (const term of ['localStorage', 'navigator.share', 'navigator.clipboard', "event.key === 'Escape'"]) if (!js.includes(term)) failures.push(`Missing interaction contract: ${term}`);

for (const metadata of ['rel="canonical"', 'name="twitter:title"', 'name="twitter:description"', 'name="twitter:image"', 'name="twitter:image:alt"', 'property="og:site_name"', 'property="og:locale"', 'name="color-scheme"', 'name="referrer"', 'rel="manifest"', 'rel="apple-touch-icon"', 'name="robots" content="noindex, nofollow"']) if (!html.includes(metadata)) failures.push(`Missing metadata: ${metadata}`);
if (!/<main id="main" tabindex="-1">/.test(html)) failures.push('Main must receive skip-link focus.');
for (const file of ['accessibility.html', 'privacy.html', 'terms.html']) if (!html.includes(`href="/${file}"`)) failures.push(`Missing legal link: ${file}`);
if (/<input[^>]+id="share-url"[^>]+value=/.test(html)) failures.push('Share URL must derive from canonical metadata.');
if (js.includes('https://hollywoodevolves.mcpherson.app')) failures.push('Share code must not duplicate the canonical origin.');

const files = ['server.mjs', 'railway.json', 'public/404.html', 'public/favicon.svg', 'public/favicon.ico', 'public/site.webmanifest', 'public/assets/ian-mcpherson.webp', 'public/fonts/dm-sans-latin-variable.woff2', 'public/fonts/dm-mono-latin-400.woff2', 'public/fonts/dm-mono-latin-500.woff2', 'public/fonts/newsreader-latin-variable.woff2', 'public/fonts/licenses/dm-sans-OFL.txt', 'public/fonts/licenses/dm-mono-OFL.txt', 'public/fonts/licenses/newsreader-OFL.txt'];
for (const file of files) if (!existsSync(file)) failures.push(`Missing file: ${file}`);
function pngSize(file) { const data = readFileSync(file); return [data.readUInt32BE(16), data.readUInt32BE(20)]; }
for (const [file, expected] of Object.entries({ 'public/og-image.png': [1200, 630], 'public/apple-touch-icon.png': [180, 180], 'public/icon-192.png': [192, 192], 'public/icon-512.png': [512, 512], 'public/icon-maskable-512.png': [512, 512] })) {
  if (!existsSync(file)) failures.push(`Missing file: ${file}`);
  else if (pngSize(file).join('x') !== expected.join('x')) failures.push(`${file} must be ${expected.join('x')}.`);
}
const brandCss = read('public/brand/brand.css');
for (const [family, fileName] of [['DM Sans', 'dm-sans-latin-variable.woff2'], ['DM Mono', 'dm-mono-latin-400.woff2'], ['Newsreader', 'newsreader-latin-variable.woff2']]) if (!brandCss.includes(`font-family: "${family}"`) || !brandCss.includes(fileName)) failures.push(`Missing local ${family}.`);
for (const file of ['accessibility.html', 'privacy.html', 'terms.html']) {
  const page = read(`public/${file}`);
  for (const marker of ['<a class="skip" href="#main">', '<main class="legal-main" id="main" tabindex="-1">', 'name="robots" content="noindex, nofollow"', 'Back to Hollywood Evolves']) if (!page.includes(marker)) failures.push(`${file} missing ${marker}`);
}
for (const term of ['WCAG 2.2 Level AA', 'not a legal certification']) if (!read('public/accessibility.html').includes(term)) failures.push(`Accessibility page missing ${term}`);
for (const term of ['he-private-forecast', 'localStorage', 'not sent to Hollywood Evolves', 'question pool has no voting controls', 'Web Share']) if (!read('public/privacy.html').includes(term)) failures.push(`Privacy page missing ${term}`);
for (const term of ['not betting or gambling products', 'investment, legal, or business advice']) if (!read('public/terms.html').includes(term)) failures.push(`Terms page missing ${term}`);

if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Content and implementation checks passed (${required.length} required-copy assertions; 8 unique questions).`);
