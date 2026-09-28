// Generates the flat, cut-paper editorial illustrations in public/art/.
// Run with `npm run art` after editing; the SVG output is committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const color = {
  ink: '#171715',
  paper: '#F3EFE6',
  alt: '#E5DED1',
  red: '#A8342A',
  blue: '#78A9B5',
  muted: '#625D55',
  white: '#FAF7F0',
};

const round = (value) => Math.round(value * 10) / 10;
const polar = (cx, cy, radius, degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return [round(cx + radius * Math.cos(radians)), round(cy + radius * Math.sin(radians))];
};
const svg = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${body}\n</svg>\n`;
const poster = (background, body) => svg(300, 400, `<rect width="300" height="400" fill="${background}"/>\n${body}`);

function starPoints(cx, cy, outer, inner) {
  return Array.from({ length: 10 }, (_, index) => polar(cx, cy, index % 2 ? inner : outer, -90 + index * 36).join(',')).join(' ');
}

function arc(cx, cy, radius, from, to) {
  const [x1, y1] = polar(cx, cy, radius, from);
  const [x2, y2] = polar(cx, cy, radius, to);
  return `M${x1} ${y1} A${radius} ${radius} 0 0 1 ${x2} ${y2}`;
}

function filmStrip(length, highlights = {}) {
  const parts = [`<rect x="-34" y="0" width="68" height="${length}" fill="${color.alt}"/>`];
  for (let y = 6; y < length - 6; y += 16) {
    parts.push(`<rect x="-30" y="${y}" width="7" height="9" fill="${color.ink}"/>`, `<rect x="23" y="${y}" width="7" height="9" fill="${color.ink}"/>`);
  }
  for (let index = 0, y = 8; y + 50 < length; index += 1, y += 64) {
    parts.push(`<rect x="-19" y="${y}" width="38" height="50" fill="${highlights[index] || color.muted}"/>`);
  }
  return parts.join('');
}

// Episode 01 — Customer Evolution: an audience silhouetted against the screen, one viewer on a phone.
function customer() {
  const people = [];
  const person = (x, y, head) =>
    `<circle cx="${x}" cy="${y}" r="${head}" fill="${color.ink}"/><path d="M${x - head * 2.1} ${y + head * 3} Q${x - head * 1.9} ${y + head * 0.9} ${x} ${y + head * 0.9} Q${x + head * 1.9} ${y + head * 0.9} ${x + head * 2.1} ${y + head * 3} Z" fill="${color.ink}"/>`;
  for (const x of [18, 62, 106, 150, 194, 238, 282]) people.push(person(x, 236, 15));
  for (const x of [40, 110, 180, 250]) people.push(person(x, 290, 25));
  return poster(color.ink, [
    `<polygon points="120,0 180,0 278,34 22,34" fill="${color.white}" opacity=".08"/>`,
    `<rect x="22" y="34" width="256" height="262" fill="${color.red}"/>`,
    ...people,
    `<g transform="translate(212 334) rotate(-12)"><rect x="-10" y="-17" width="20" height="34" rx="3" fill="${color.white}"/></g>`,
  ].join('\n'));
}

// Episode 02 — Media Supply Chain Evolution: one reel feeding a fragmented set of pipelines.
function supplyChain() {
  const holes = Array.from({ length: 5 }, (_, index) => {
    const [x, y] = polar(110, 128, 44, -90 + index * 72);
    return `<circle cx="${x}" cy="${y}" r="17" fill="${color.alt}"/>`;
  });
  const sprockets = [];
  for (let y = 134; y < 232; y += 14) sprockets.push(`<rect x="181" y="${y}" width="5" height="7" fill="${color.alt}"/><rect x="194" y="${y}" width="5" height="7" fill="${color.alt}"/>`);
  const line = (d, stroke) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="square"/>`;
  return poster(color.alt, [
    `<circle cx="110" cy="128" r="80" fill="${color.ink}"/>`,
    ...holes,
    `<circle cx="110" cy="128" r="9" fill="${color.alt}"/><circle cx="110" cy="128" r="3.5" fill="${color.ink}"/>`,
    `<rect x="178" y="128" width="24" height="108" fill="${color.ink}"/>`,
    ...sprockets,
    line('M190 236 V258 H44 V350', color.red),
    line('M190 236 V276 H118 V350', color.muted),
    line('M190 236 V270 H262 V350', color.ink),
    line('M190 236 V346', color.blue),
    `<rect x="18" y="352" width="52" height="24" fill="${color.red}"/>`,
    `<rect x="96" y="350" width="44" height="30" fill="${color.muted}"/>`,
    `<rect x="181" y="348" width="18" height="32" fill="${color.blue}"/>`,
    `<rect x="238" y="354" width="48" height="22" rx="11" fill="${color.ink}"/>`,
  ].join('\n'));
}

// Episode 03 — Creator Evolution: the spotlit star and its synthetic double.
function creator() {
  const points = starPoints(142, 246, 92, 37);
  return poster(color.red, [
    `<polygon points="136,0 164,0 268,342 16,342" fill="${color.white}" opacity=".14"/>`,
    `<ellipse cx="142" cy="342" rx="126" ry="24" fill="${color.white}" opacity=".18"/>`,
    `<polygon points="${points}" fill="${color.white}"/>`,
    `<polygon points="${points}" transform="translate(30 -34)" fill="none" stroke="${color.ink}" stroke-width="3" stroke-dasharray="8 6"/>`,
  ].join('\n'));
}

// Episode 04 — Content Evolution: a finished reel that forks into branching story paths.
function content() {
  return poster(color.ink, [
    `<g transform="translate(150 196) rotate(32)">${filmStrip(290, { 1: color.red })}</g>`,
    `<g transform="translate(150 196) rotate(-32)">${filmStrip(290, { 2: color.white })}</g>`,
    `<g transform="translate(150 -24)">${filmStrip(232)}</g>`,
  ].join('\n'));
}

// Episode 05 — Commercial Evolution: the broadcast set, with the sale inside the story.
function commercial() {
  return poster(color.alt, [
    `<path d="M150 112 L108 44 M150 112 L198 36" stroke="${color.ink}" stroke-width="4"/>`,
    `<circle cx="108" cy="44" r="5" fill="${color.ink}"/><circle cx="198" cy="36" r="5" fill="${color.ink}"/>`,
    `<ellipse cx="150" cy="114" rx="24" ry="13" fill="${color.ink}"/>`,
    `<polygon points="72,286 86,286 66,340 54,340" fill="${color.ink}"/><polygon points="214,286 228,286 246,340 234,340" fill="${color.ink}"/>`,
    `<rect x="40" y="112" width="220" height="178" rx="16" fill="${color.ink}"/>`,
    `<rect x="58" y="130" width="150" height="122" rx="22" fill="${color.paper}"/>`,
    `<circle cx="234" cy="160" r="11" fill="${color.alt}"/><path d="M234 160 L240 152" stroke="${color.ink}" stroke-width="3"/>`,
    `<circle cx="234" cy="198" r="11" fill="${color.alt}"/><path d="M234 198 L226 192" stroke="${color.ink}" stroke-width="3"/>`,
    ...[228, 237, 246].map((y) => `<rect x="222" y="${y}" width="24" height="3" fill="${color.muted}"/>`),
    `<g transform="translate(128 196) rotate(-14)"><path d="M24 0 C42 -30 12 -50 -12 -44" fill="none" stroke="${color.ink}" stroke-width="2"/><path d="M-46 -22 H22 L44 0 L22 22 H-46 Z" fill="${color.red}"/><circle cx="24" cy="0" r="5" fill="${color.paper}"/></g>`,
  ].join('\n'));
}

// Episode 06 — Audio Evolution: the studio ribbon microphone, sound spreading into space.
function audio() {
  const arcs = [[74, color.white], [102, color.ink], [130, color.white]].map(([radius, stroke]) =>
    `<path d="${arc(150, 168, radius, -38, 38)}" fill="none" stroke="${stroke}" stroke-width="5"/><path d="${arc(150, 168, radius, 142, 218)}" fill="none" stroke="${stroke}" stroke-width="5"/>`);
  const grille = [];
  for (let y = 112; y <= 228; y += 10) grille.push(`<rect x="106" y="${y}" width="88" height="3" fill="${color.muted}"/>`);
  return poster(color.red, [
    ...arcs,
    `<path d="M102 168 V230 Q102 248 120 248 H180 Q198 248 198 230 V168" fill="none" stroke="${color.ink}" stroke-width="7"/>`,
    `<clipPath id="capsule"><ellipse cx="150" cy="168" rx="40" ry="66"/></clipPath>`,
    `<ellipse cx="150" cy="168" rx="40" ry="66" fill="${color.ink}"/>`,
    `<g clip-path="url(#capsule)">${grille.join('')}</g>`,
    `<circle cx="102" cy="168" r="8" fill="${color.ink}"/><circle cx="198" cy="168" r="8" fill="${color.ink}"/>`,
    `<rect x="146" y="248" width="8" height="110" fill="${color.ink}"/>`,
    `<ellipse cx="150" cy="360" rx="56" ry="11" fill="${color.ink}"/>`,
  ].join('\n'));
}

// Episode 07 — VFX Evolution: Méliès's painted moon, half rendered as wireframe over a stage grid.
function vfx() {
  const floor = [];
  for (let x = -300; x <= 600; x += 50) {
    const top = round(x + (150 - x) * 0.54);
    floor.push(`<path d="M${x} 400 L${top} 292" stroke="${color.alt}" stroke-width="1.5" opacity=".35"/>`);
  }
  for (const y of [292, 297, 304, 314, 328, 348, 374]) floor.push(`<path d="M0 ${y} H300" stroke="${color.alt}" stroke-width="1.5" opacity=".35"/>`);
  const wire = [`<circle cx="160" cy="160" r="96" fill="none" stroke="${color.alt}" stroke-width="1.5"/>`];
  for (const angle of [0, 30, 60]) wire.push(`<ellipse cx="160" cy="160" rx="${round(96 * Math.cos((angle * Math.PI) / 180))}" ry="96" fill="none" stroke="${color.alt}" stroke-width="1.5"/>`);
  for (const offset of [-64, -32, 0, 32, 64]) {
    const half = round(Math.sqrt(96 ** 2 - offset ** 2));
    wire.push(`<path d="M${160 - half} ${160 + offset} H${160 + half}" stroke="${color.alt}" stroke-width="1.5"/>`);
  }
  const stars = [[28, 40, 1.6], [62, 88, 1.2], [270, 36, 2], [282, 120, 1.3], [40, 210, 1.4], [276, 238, 1.6], [110, 24, 1.1]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color.white}"/>`);
  return poster(color.ink, [
    ...floor,
    ...stars,
    `<clipPath id="solid"><rect x="160" y="0" width="140" height="400"/></clipPath>`,
    `<clipPath id="wire"><rect x="0" y="0" width="160" height="400"/></clipPath>`,
    `<circle cx="160" cy="160" r="96" fill="${color.red}" clip-path="url(#solid)"/>`,
    `<g clip-path="url(#wire)">${wire.join('')}</g>`,
    `<circle cx="214" cy="196" r="9" fill="${color.ink}" opacity=".22"/><circle cx="190" cy="228" r="6" fill="${color.ink}" opacity=".22"/>`,
    `<g transform="translate(236 98) rotate(145)"><path d="M0 -10 H26 Q42 0 26 10 H0 Z" fill="${color.alt}"/><rect x="6" y="-10" width="4" height="20" fill="${color.ink}"/></g>`,
  ].join('\n'));
}

// Episode 08 — Animation Evolution: the onion-skinned bouncing ball on a pegged sheet.
function animation() {
  // Centres sit on the guide parabolas: fall from (40, 80) to contact, rebound to a lower apex at (250, 170).
  const fall = [40, 62, 84, 106, 128].map((x) => [x, round(80 + 238 * ((x - 40) / 110) ** 2)]);
  const rise = [180, 202, 226, 250].map((x) => [x, round(170 + 148 * ((x - 250) / 100) ** 2)]);
  const all = [...fall, [141, 281, 13, 19], [150, 319, 21, 11], [160, 290, 13, 18], ...rise];
  const balls = all.map(([x, y, rx = 16, ry = 16], index) => {
    const last = index === all.length - 1;
    const opacity = last ? 1 : round(0.16 + (index / all.length) * 0.7);
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${last ? color.red : color.ink}" opacity="${opacity}"/>`;
  });
  return poster(color.alt, [
    `<circle cx="104" cy="32" r="7" fill="${color.ink}"/><rect x="134" y="25" width="32" height="14" rx="7" fill="${color.ink}"/><circle cx="196" cy="32" r="7" fill="${color.ink}"/>`,
    `<path d="M40 80 Q95 80 150 318 Q200 170 250 170" fill="none" stroke="${color.muted}" stroke-width="1.5" stroke-dasharray="4 5"/>`,
    `<rect x="20" y="330" width="260" height="4" fill="${color.ink}"/>`,
    ...balls,
  ].join('\n'));
}

// Hero — one projector beam, and the screen it lands on keeps changing shape.
// Drawn on a 760×600 canvas; the social card reuses the same body.
function heroBody() {
  const reel = (cx, cy, radius) => {
    const holes = Array.from({ length: 5 }, (_, index) => {
      const [x, y] = polar(cx, cy, radius * 0.55, -90 + index * 72);
      return `<circle cx="${x}" cy="${y}" r="${round(radius * 0.2)}" fill="${color.ink}"/>`;
    });
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color.muted}"/>${holes.join('')}<circle cx="${cx}" cy="${cy}" r="6" fill="${color.ink}"/>`;
  };
  const motes = [[340, 286, 1.6], [372, 262, 1.1], [410, 318, 2], [446, 240, 1.3], [468, 350, 1.5], [396, 300, 1], [520, 196, 1.8], [540, 404, 1.2], [590, 150, 1.4], [612, 452, 1.7], [660, 214, 1.1], [690, 390, 1.5], [482, 286, 1]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color.white}" opacity=".45"/>`);
  return [
    `<polygon points="292,278 292,302 760,560 760,40" fill="${color.white}" opacity=".07"/>`,
    `<polygon points="292,284 292,296 760,430 760,170" fill="${color.white}" opacity=".08"/>`,
    ...motes,
    `<path d="M96 150 L126 250 M204 116 L176 250" stroke="${color.muted}" stroke-width="7"/>`,
    reel(96, 150, 64),
    reel(204, 116, 52),
    `<rect x="66" y="246" width="176" height="94" fill="${color.muted}"/>`,
    `<rect x="84" y="264" width="44" height="8" fill="${color.ink}"/><rect x="84" y="280" width="44" height="8" fill="${color.ink}"/>`,
    `<circle cx="206" cy="304" r="12" fill="${color.ink}"/>`,
    `<rect x="242" y="272" width="42" height="36" fill="${color.muted}"/><rect x="284" y="264" width="10" height="52" fill="${color.alt}"/>`,
    `<rect x="54" y="340" width="200" height="10" fill="${color.muted}"/>`,
    `<rect x="455" y="238" width="290" height="122" fill="none" stroke="${color.red}" stroke-width="3"/>`,
    `<rect x="472" y="227" width="256" height="144" fill="none" stroke="${color.blue}" stroke-width="2"/>`,
    `<rect x="510" y="234" width="180" height="131" fill="none" stroke="${color.alt}" stroke-width="2"/>`,
    `<rect x="562" y="228" width="80" height="142" fill="${color.red}"/>`,
    `<rect x="570" y="236" width="64" height="126" fill="none" stroke="${color.white}" stroke-width="1.5" opacity=".6"/>`,
  ].join('\n');
}

function hero() {
  return svg(760, 600, heroBody());
}

// Social card — the thesis beside the projector, with the canonical inverse wordmark embedded unchanged.
// Text uses the brand faces; scripts/build-social-card.mjs rasterizes it with those fonts loaded.
function socialCard() {
  const wordmark = readFileSync(new URL('../public/brand/wordmark-inverse.svg', import.meta.url), 'utf8')
    .trim()
    .replace(/<title[^>]*>.*?<\/title>/, '')
    .replace(/^<svg\b[^>]*>/, '<svg x="72" y="60" width="348" height="64" viewBox="0 0 348 64">');
  const serif = `font-family="Newsreader, Georgia, serif" font-size="66" letter-spacing="-2.2"`;
  const mono = `font-family="'DM Mono', 'Courier New', monospace" font-weight="500" font-size="19" letter-spacing="2.2"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc"><title id="title">Hollywood Evolves</title><desc id="desc">Hollywood keeps reinventing itself. What happens next? An executive podcast series.</desc>
<rect width="1200" height="630" fill="${color.ink}"/>
<g transform="translate(636 84) scale(.76)">${heroBody()}</g>
${wordmark}
<text x="72" y="272" ${serif} fill="${color.white}">Hollywood keeps</text>
<text x="72" y="342" ${serif} fill="${color.white}">reinventing itself.</text>
<text x="72" y="412" ${serif} fill="#EF8178">What happens next?</text>
<rect x="72" y="484" width="56" height="4" fill="${color.red}"/>
<text x="72" y="552" ${mono} fill="#CBC6BD">AN EXECUTIVE PODCAST SERIES · SEASON ONE</text>
</svg>
`;
}

// Format — three director's chairs: host, historical guest, operating guest.
function chairs() {
  const chair = (cx, canvas) => [
    `<ellipse cx="${cx}" cy="254" rx="86" ry="5" fill="${color.ink}" opacity=".12"/>`,
    `<rect x="${cx - 70}" y="8" width="10" height="144" rx="3" fill="${color.ink}"/><rect x="${cx + 60}" y="8" width="10" height="144" rx="3" fill="${color.ink}"/>`,
    `<rect x="${cx - 62}" y="20" width="124" height="56" fill="${canvas}"/>`,
    `<path d="M${cx - 62} 25 H${cx + 62} M${cx - 62} 71 H${cx + 62}" stroke="${color.ink}" stroke-width="1.5" stroke-dasharray="4 3" opacity=".22"/>`,
    `<rect x="${cx - 86}" y="102" width="172" height="10" rx="5" fill="${color.ink}"/>`,
    `<path d="M${cx - 66} 134 H${cx + 66} V152 Q${cx} 159 ${cx - 66} 152 Z" fill="${canvas}"/>`,
    `<path d="M${cx - 58} 152 L${cx + 58} 244 M${cx + 58} 152 L${cx - 58} 244" stroke="${color.ink}" stroke-width="9"/>`,
    `<circle cx="${cx}" cy="198" r="3.5" fill="${color.paper}"/>`,
    `<rect x="${cx - 74}" y="242" width="148" height="8" rx="2" fill="${color.ink}"/>`,
  ].join('');
  return svg(900, 260, [chair(150, color.red), chair(450, color.muted), chair(750, color.blue)].join('\n'));
}

const outputs = {
  'hero.svg': hero(),
  'chairs.svg': chairs(),
  'episode-01.svg': customer(),
  'episode-02.svg': supplyChain(),
  'episode-03.svg': creator(),
  'episode-04.svg': content(),
  'episode-05.svg': commercial(),
  'episode-06.svg': audio(),
  'episode-07.svg': vfx(),
  'episode-08.svg': animation(),
};

const directory = new URL('../public/art/', import.meta.url);
mkdirSync(directory, { recursive: true });
for (const [name, markup] of Object.entries(outputs)) writeFileSync(new URL(name, directory), markup);
writeFileSync(new URL('../public/brand/social-card.svg', import.meta.url), socialCard());
console.log(`Wrote ${Object.keys(outputs).length} illustrations to public/art/ and the social card source to public/brand/.`);
