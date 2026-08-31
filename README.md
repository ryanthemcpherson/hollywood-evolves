# Hollywood Evolves

A website and evidence-backed forecasting system for Ian McPherson's executive podcast about how technology repeatedly reshapes Hollywood.

## Product thesis

**Past → present → probability → accountability.**

Each episode explains a prior industry transition, examines today's operating signals, and closes with one resolvable forecast. Guests and the audience publish probabilities; the project preserves the evidence, assumptions, revisions, and eventual outcome.

## Current scope

1. A responsive editorial-cinema website for the podcast and its eight-question first-season slate.
2. A forecast-question studio that turns broad themes into simple, measurable questions.
3. A research pipeline that monitors industry news, company disclosures, regulation, and relevant research.
4. A multi-agent forecasting process that produces scenarios and calibrated probabilities without publishing generic AI prose.
5. A public forecast ledger comparing guest, audience, and research-system estimates over time.

## Source material

- `source/Hollywood_Evolves_Executive_Brief.docx` — original executive brief supplied by Ryan.
- `docs/ian-positioning-research.md` — sourced public-career brief and recommended host territory.
- `docs/forecasting-system-research-reference.md` — long-form research-system design and operating reference.
- `docs/forecasting-research-sources.json` — machine-readable source list for that research reference.
- Claude artifact prototype — reference only; its sample aired states, percentages, trend readings, and comments must not be treated as real data.

## Preview website

This repository contains the static Vite preview for `hollywoodevolves.mcpherson.app`. The preview is deliberately `noindex`; it contains no live episode, submitted audience data, or published forecast values. Episode 01 records in November 2026 and publishes in January 2027.

### Local development

```bash
npm ci
npm run dev
```

### Check and build

```bash
npm test
npm run check
npm run build
```

The production site is written to `dist/`.

### Homepage composition

The homepage is a subject-first, segmented editorial scroll. Its opening pairs Hollywood's next operating system with a code-built cinematic forecast instrument: a layered camera lens, viewfinder, signal ribbon, production-to-audience path, audience plane, and explicitly unresolved gate. It uses no subject image or fabricated value. `PAST 01` and `PRESENT 02` are independent anchored halves of one combined split chapter on desktop and stack on mobile; an explicit keyboard-reachable jump leads to `FORECAST 03`. One 12-column container aligns the masthead and every chapter.

Ian McPherson's supplied portrait appears once, only in the host/credibility chapter. The dark forecast chapter preserves the empty Guest, Community, and Research System states and local-only binary preview. The season introduces all eight approved questions in a CSS 3D discovery field with truthful `YES — / NO —` values, then preserves the compact ruled index and seven native disclosure contracts below. Motion pauses during hover or keyboard focus and becomes a static scrollable field when reduced motion is requested.

The interface progressively enhances its mobile menu, local-only binary call, sharing tools, and three-step hero instrument. The instrument’s Capture, Forecast, and Resolve tabs update a truthful process readout and visual focus; fine pointers add a restrained, resettable perspective response. With JavaScript disabled, primary navigation and all explanatory instrument copy remain available, and native `details` elements still expose draft resolution contracts. Reduced-motion preferences disable the instrument response and all automated question-field motion.

`npm test` is the complete quality gate. It runs content and metadata assertions, validates the icon inventory and exact PNG dimensions, builds the Vite site, starts temporary local servers, verifies traversal handling/security headers/legal routes/asset media types, and drives the system `/usr/bin/chromium` through Puppeteer Core. Browser checks cover the binary local forecast, storage-denied fallback, menu keyboard behavior and appropriate focus placement, minimum 44×44 CSS-pixel targets, horizontal reflow, and axe-core WCAG 2.2 Level A/AA rules (including contrast) at representative widths. Each test-owned server and browser is closed during teardown; no browser download is used.

## Compliance pages

The homepage keeps only compact footer links to static Accessibility, Privacy, and Terms pages in `public/`. Those reading-first pages share `public/legal.css`, remain `noindex, nofollow` during preview, and document only the current implementation. The accessibility target is WCAG 2.2 AA, not a legal certification or guarantee. Automated checks cover their semantics, metadata, reflow, targets, and axe rules at 390px and 1440px; manual review still remains necessary.

### Production / Railway

- Build: `npm run build`
- Start: `npm start`
- Health check: `/healthz`

The Node server (Node 22.12.0+) serves `dist/`, binds to `0.0.0.0` on Railway's `$PORT`, serves the homepage only at `/`, caches fingerprinted Vite assets immutably while keeping stable asset URLs refreshable, and serves a real `404.html` for unknown paths.

```bash
npm run build
PORT=4173 npm start
curl -i http://127.0.0.1:4173/healthz
```

## Asset credit

Ian McPherson's portrait is used locally from the supplied TMT Insights source URL and credited in the site footer.

The original HE monogram icon is maintained as an SVG source and exported locally as SVG, ICO, Apple touch, and ordinary 192/512 PNG assets. A separate deliberately inset 512px maskable icon keeps the monogram inside the central safe region. The Open Graph image remains 1200×630.
