import { readFileSync, existsSync } from 'node:fs';

function pngSize(file) {
  const data = readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== signature) throw new Error(`${file} is not a valid PNG.`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');
const legalFiles = ['accessibility.html', 'privacy.html', 'terms.html'];
const legalPages = Object.fromEntries(legalFiles.map((file) => [file, readFileSync(`public/${file}`, 'utf8')]));
const required = ['Preview · In development','Recording November 2026','Publishing January 2027','Draft question','criteria in review','not open','Not yet open','not submitted, published, or counted','Verified industry panel','Working season questions','Remaining theme order and episode assignments are in development','25 years','11 years at AWS','Head of Business Development at TMT Insights','Digital Entertainment Group (DEG)','Brier score','YES threshold','Resolve by','Evidence / resolver','Why it matters:','Share this draft question'];
const themes = ['Customer Evolution','Media Supply Chain Evolution','Creator Evolution','Content Evolution','Commercial Evolution','Audio Evolution','VFX Evolution','Animation Evolution'];
const failures = [...required,...themes].filter((term) => !html.toLowerCase().includes(term.toLowerCase())).map((term) => `Missing required copy: ${term}`);
for (const forbidden of ['lorem ipsum','placeholder','game-changing','rapidly evolving landscape','leaderboard','linear-gradient','radial-gradient']) if ((html + css).toLowerCase().includes(forbidden)) failures.push(`Forbidden pattern: ${forbidden}`);
const assets = {
  'public/og-image.png': [1200, 630],
  'public/apple-touch-icon.png': [180, 180],
  'public/icon-192.png': [192, 192],
  'public/icon-512.png': [512, 512],
};
for (const file of ['server.mjs','railway.json','public/404.html','public/favicon.svg','public/favicon.ico','public/site.webmanifest','public/assets/ian-mcpherson.webp', ...Object.keys(assets)]) if (!existsSync(file)) failures.push(`Missing file: ${file}`);
for (const [file, expected] of Object.entries(assets)) {
  if (!existsSync(file)) continue;
  const { width, height } = pngSize(file);
  if (width !== expected[0] || height !== expected[1]) failures.push(`${file} must be ${expected.join('x')}, got ${width}x${height}.`);
}
if (!/<fieldset[\s\S]*?<legend[\s\S]*?type="radio"[\s\S]*?value="yes"[\s\S]*?type="radio"[\s\S]*?value="no"[\s\S]*?<\/fieldset>/.test(html)) failures.push('Private forecast must use YES/NO radios in a fieldset with a legend.');
if (/type="range"|probability-output|min="1" max="99"/.test(html)) failures.push('Numeric probability slider must be removed.');
for (const metadata of ['rel="canonical"','name="twitter:title"','name="twitter:description"','name="twitter:image"','name="twitter:image:alt"','property="og:site_name"','property="og:locale"','name="color-scheme"','name="referrer"','rel="manifest"','rel="apple-touch-icon"']) if (!html.includes(metadata)) failures.push(`Missing metadata: ${metadata}`);
const description = (attribute) => html.match(new RegExp(`<meta ${attribute}="(?:og:description|twitter:description)" content="([^"]+)"`))?.[1];
if (description('property') !== description('name')) failures.push('Open Graph and Twitter descriptions must match.');
if ((html.match(/<details>/g) || []).length !== 7) failures.push('Season ledger must include seven native details rows for Episodes 02–08.');
if ((html.match(/Draft question \/ criteria in review \/ not open/g) || []).length !== 8) failures.push('Every season theme must carry the exact draft state.');
for (const term of ['probability','guest','votes','trends','comments','aired']) {
  const season = html.match(/<ol class="season-ledger">([\s\S]*?)<\/ol>/)?.[1] || '';
  if (season.toLowerCase().includes(term)) failures.push(`Season ledger must not claim or show ${term}.`);
}
if (/class="accessibility-section"|id="accessibility"/.test(html)) failures.push('Homepage must not contain the accessibility section.');
for (const file of legalFiles) if (!html.includes(`href="/${file}"`)) failures.push(`Homepage footer must link to /${file}.`);
if (!html.includes('name="robots" content="noindex, nofollow"')) failures.push('Preview must be noindex.');
for (const [file, page] of Object.entries(legalPages)) {
  for (const pattern of ['<a class="skip" href="#main">', '<header class="legal-header">', '<nav aria-label="Legal pages">', '<main class="legal-main" id="main">', '<footer class="legal-footer">', '<h1>', 'name="description"', 'name="theme-color"', 'name="robots" content="noindex, nofollow"', 'rel="canonical"', 'rel="icon"', 'rel="apple-touch-icon"', 'href="/legal.css"', 'Back to Hollywood Evolves']) {
    if (!page.includes(pattern)) failures.push(`${file} missing expected semantics or metadata: ${pattern}`);
  }
  if ((page.match(/<h1>/g) || []).length !== 1) failures.push(`${file} must contain exactly one h1.`);
  if (!page.includes(`href="https://hollywoodevolves.mcpherson.app/${file}"`)) failures.push(`${file} has an unexpected canonical URL.`);
}
for (const term of ['WCAG 2.2 Level AA', 'not a legal certification', 'same channel you used to access this preview']) if (!legalPages['accessibility.html'].includes(term)) failures.push(`Accessibility page missing required qualification: ${term}`);
for (const term of ['he-private-forecast', 'no user accounts', 'analytics', 'advertising trackers', 'community-submission backend', 'Google Fonts', 'does not sell personal data', 'cookie banner', 'identity verification']) if (!legalPages['privacy.html'].includes(term)) failures.push(`Privacy page missing current implementation detail: ${term}`);
for (const term of ['not betting or gambling products', 'investment, legal, or business advice', 'may change until a forecast is formally opened', 'scrape', 'respective owners', 'not a representation that counsel has reviewed']) if (!legalPages['terms.html'].includes(term)) failures.push(`Terms page missing required preview term: ${term}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Content and implementation checks passed (${required.length + themes.length} required-copy assertions).`);
