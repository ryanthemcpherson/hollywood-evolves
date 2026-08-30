import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');
const required = ['Preview · In development','Recording November 2026','Publishing January 2027','Draft question','Not yet open','not submitted, published, or counted','Verified industry panel','Working season themes','Remaining theme order and episode assignments are in development','25 years','11 years at AWS','Head of Business Development at TMT Insights','Digital Entertainment Group (DEG)','Brier score'];
const themes = ['Customer Evolution','Media Supply Chain Evolution','Creator Evolution','Content Evolution','Commercial Evolution','Audio Evolution','VFX Evolution','Animation Evolution'];
const failures = [...required,...themes].filter((term) => !html.toLowerCase().includes(term.toLowerCase())).map((term) => `Missing required copy: ${term}`);
for (const forbidden of ['lorem ipsum','placeholder','game-changing','rapidly evolving landscape','leaderboard','linear-gradient','radial-gradient']) if ((html + css).toLowerCase().includes(forbidden)) failures.push(`Forbidden pattern: ${forbidden}`);
for (const file of ['server.mjs','railway.json','public/404.html','public/favicon.svg','public/og-image.png','public/assets/ian-mcpherson.webp']) if (!existsSync(file)) failures.push(`Missing file: ${file}`);
if (!html.includes('min="1" max="99"')) failures.push('Slider must be bounded from 1–99.');
if (!/<label\b[^>]*\bfor="probability"/.test(html)) failures.push('Probability slider must have an associated label.');
if (!html.includes('name="robots" content="noindex, nofollow"')) failures.push('Preview must be noindex.');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Content and implementation checks passed (${required.length + themes.length} required-copy assertions).`);
