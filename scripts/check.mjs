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
const publicSurfaceFiles = ['index.html', 'poll.html', 'public/404.html', ...legalFiles.map((file) => `public/${file}`), 'src/main.js', 'src/poll.js'];
const publicSources = Object.fromEntries(publicSurfaceFiles.map((file) => [file, readFileSync(file, 'utf8')]));
const required = ['Editorial questions for a changing industry', 'Read the Episode 01 premise', 'Explore the editorial themes', 'Browser-local reader tool', 'Eight measurable questions', '25 years', '11 years at AWS', 'Head of Business Development at TMT Insights', 'Digital Entertainment Group (DEG)', 'YES threshold', 'Resolve by', 'Evidence / resolver', 'Why it matters:', 'Share this question'];
const themes = ['Customer Evolution', 'Media Supply Chain Evolution', 'Creator Evolution', 'Content Evolution', 'Commercial Evolution', 'Audio Evolution', 'VFX Evolution', 'Animation Evolution'];
const failures = [...required, ...themes].filter((term) => !html.toLowerCase().includes(term.toLowerCase())).map((term) => `Missing required copy: ${term}`);

const forbiddenNarration = /\b(?:preview|demo|draft|planned|planning|upcoming|coming soon|in[ -]development|not (?:yet )?open|link pending|links will appear|when (?:activated|an audience question opens))\b/i;
const unavailableProducts = /\b(?:Spotify|Apple Music|YouTube|LinkedIn)\b/i;
for (const [file, source] of Object.entries(publicSources)) {
  if (forbiddenNarration.test(source)) failures.push(`${file} contains roadmap or pre-release narration.`);
  if (unavailableProducts.test(source)) failures.push(`${file} exposes an unavailable platform or contributor product.`);
}
for (const forbidden of ['lorem ipsum', 'placeholder', 'game-changing', 'rapidly evolving landscape', 'leaderboard', 'linear-gradient', 'radial-gradient']) if ((html + css).toLowerCase().includes(forbidden)) failures.push(`Forbidden pattern: ${forbidden}`);

const assets = {
  'public/og-image.png': [1200, 630],
  'public/apple-touch-icon.png': [180, 180],
  'public/icon-192.png': [192, 192],
  'public/icon-512.png': [512, 512],
  'public/icon-maskable-512.png': [512, 512],
};
for (const file of ['server.mjs', 'railway.json', 'public/404.html', 'public/favicon.svg', 'public/favicon.ico', 'public/site.webmanifest', 'public/assets/ian-mcpherson.webp', ...Object.keys(assets)]) if (!existsSync(file)) failures.push(`Missing file: ${file}`);
for (const [file, expected] of Object.entries(assets)) {
  if (!existsSync(file)) continue;
  const { width, height } = pngSize(file);
  if (width !== expected[0] || height !== expected[1]) failures.push(`${file} must be ${expected.join('x')}, got ${width}x${height}.`);
}

if (!/<fieldset[\s\S]*?<legend[\s\S]*?type="radio"[\s\S]*?value="yes"[\s\S]*?type="radio"[\s\S]*?value="no"[\s\S]*?<\/fieldset>/.test(html)) failures.push('Private forecast must use YES/NO radios in a fieldset with a legend.');
if ((html.match(/data-question-call/g) || []).length !== 16) failures.push('Each of the eight question cards must expose private YES and NO controls.');
if (/type="range"|probability-output|min="1" max="99"/.test(html)) failures.push('Numeric probability slider must be absent.');
if (/<table[^>]+class="[^"]*\bledger\b/i.test(html)) failures.push('Homepage must not publish unavailable forecast ledger rows.');
for (const selector of ['preview-stamp', 'distribution', 'platform-card', 'contributors', 'commentary-app', 'linkedin-login']) if (new RegExp(`class="[^"]*\\b${selector}\\b|id="${selector}"`).test(html)) failures.push(`Homepage must omit unavailable ${selector}.`);

for (const metadata of ['rel="canonical"', 'name="twitter:title"', 'name="twitter:description"', 'name="twitter:image"', 'name="twitter:image:alt"', 'property="og:site_name"', 'property="og:locale"', 'name="color-scheme"', 'name="referrer"', 'rel="manifest"', 'rel="apple-touch-icon"']) if (!html.includes(metadata)) failures.push(`Missing metadata: ${metadata}`);
const description = (attribute) => html.match(new RegExp(`<meta ${attribute}="(?:og:description|twitter:description)" content="([^"]+)"`))?.[1];
if (description('property') !== description('name')) failures.push('Open Graph and Twitter descriptions must match.');
if ((html.match(/<details>/g) || []).length !== 7) failures.push('Season ledger must include seven native details rows for Themes 02–08.');
if ((html.match(/class="editorial-question"/g) || []).length !== 7) failures.push('Every disclosed season theme must include an editorial question.');
if ((html.match(/<dt>YES threshold<\/dt>/g) || []).length < 7 || (html.match(/<dt>Resolve by<\/dt>/g) || []).length < 7 || (html.match(/<dt>Evidence \/ resolver<\/dt>/g) || []).length < 7) failures.push('Every disclosed season theme must expose threshold, deadline, and evidence terms.');
if (/class="accessibility-section"|id="accessibility"/.test(html)) failures.push('Homepage must not contain the accessibility section.');
for (const file of legalFiles) if (!html.includes(`href="/${file}"`)) failures.push(`Homepage footer must link to /${file}.`);
if (!html.includes('name="robots" content="noindex, nofollow"')) failures.push('Homepage must remain noindex.');
if (!html.includes('https://hollywoodevolves.mcpherson.app/#forecast')) failures.push('Share fallback must deep-link to the forecast.');

const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'));
if (manifest.id !== '/' || manifest.scope !== '/') failures.push('Manifest id and scope must both be root.');
for (const icon of manifest.icons || []) {
  if (icon.src === '/icon-maskable-512.png' && icon.purpose !== 'maskable') failures.push('Inset maskable icon must have purpose maskable.');
  if (icon.src !== '/icon-maskable-512.png' && icon.purpose !== 'any') failures.push(`Ordinary icon ${icon.src} must have purpose any.`);
}
if (!manifest.icons?.some((icon) => icon.src === '/icon-maskable-512.png' && icon.sizes === '512x512')) failures.push('Manifest must declare the 512px inset maskable icon.');
const iconSource = readFileSync('public/icon-source.svg', 'utf8');
const maskableSource = readFileSync('public/icon-maskable-source.svg', 'utf8');
const maskTransform = maskableSource.match(/transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/);
if (!maskableSource.includes('viewBox="0 0 512 512"') || !maskTransform) failures.push('Maskable source must use a measurable inset transform.');
else {
  const [, tx, ty, scale] = maskTransform.map(Number);
  const safeRadius = 512 * 0.4;
  const artworkBounds = { left: 92, top: 88, right: 428, bottom: 424 };
  const corners = [[artworkBounds.left, artworkBounds.top], [artworkBounds.right, artworkBounds.top], [artworkBounds.right, artworkBounds.bottom], [artworkBounds.left, artworkBounds.bottom]];
  if (corners.some(([x, y]) => Math.hypot(tx + x * scale - 256, ty + y * scale - 256) > safeRadius)) failures.push('Essential maskable monogram geometry must stay inside the central 40% safe circle.');
}
if (!maskableSource.includes(iconSource.match(/<path fill="#f3efe6"[^>]+>/)?.[0] || '__missing__')) failures.push('Maskable source must retain the essential monogram artwork.');

for (const [file, page] of Object.entries(legalPages)) {
  for (const pattern of ['<a class="skip" href="#main">', '<header class="legal-header">', '<nav aria-label="Legal pages">', '<main class="legal-main" id="main">', '<footer class="legal-footer">', '<h1>', 'name="description"', 'name="theme-color"', 'name="robots" content="noindex, nofollow"', 'rel="canonical"', 'rel="icon"', 'rel="apple-touch-icon"', 'href="/legal.css"', 'Back to Hollywood Evolves']) if (!page.includes(pattern)) failures.push(`${file} missing expected semantics or metadata: ${pattern}`);
  if ((page.match(/<h1>/g) || []).length !== 1) failures.push(`${file} must contain exactly one h1.`);
  if (!page.includes(`href="https://hollywoodevolves.mcpherson.app/${file}"`)) failures.push(`${file} has an unexpected canonical URL.`);
}
for (const term of ['WCAG 2.2 Level AA', 'not a legal certification', 'Keyboard, viewport, reduced-motion']) if (!legalPages['accessibility.html'].includes(term)) failures.push(`Accessibility page missing current practice: ${term}`);
for (const term of ['he-private-forecast', 'he-private-question-calls', 'localStorage', 'not sent to Hollywood Evolves', 'Web Share', 'analytics', 'advertising trackers', 'Google Fonts', 'does not sell personal data', 'cookie banner']) if (!legalPages['privacy.html'].includes(term)) failures.push(`Privacy page missing current implementation detail: ${term}`);
for (const term of ['not betting or gambling products', 'investment, legal, or business advice', 'bypass security measures', 'respective owners', 'provided as available']) if (!legalPages['terms.html'].includes(term)) failures.push(`Terms page missing current term: ${term}`);

if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Content and implementation checks passed (${required.length + themes.length} required-copy assertions).`);
