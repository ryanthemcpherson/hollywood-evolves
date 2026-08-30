# Hollywood Evolves

A website and evidence-backed forecasting system for Ian McPherson's executive podcast about how technology repeatedly reshapes Hollywood.

## Product thesis

**Past → present → probability → accountability.**

Each episode explains a prior industry transition, examines today's operating signals, and closes with one resolvable forecast. Guests and the audience publish probabilities; the project preserves the evidence, assumptions, revisions, and eventual outcome.

## Current scope

1. A simple, credible public website for the podcast and its eight-episode first season.
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

### Production / Railway

- Build: `npm run build`
- Start: `npm start`
- Health check: `/healthz`

The Node server (Node 20.19+) serves `dist/`, binds to `0.0.0.0` on Railway's `$PORT`, returns the app shell for extensionless routes, caches fingerprinted Vite assets immutably while keeping stable asset URLs refreshable, and serves a real `404.html` for missing asset paths.

```bash
npm run build
PORT=4173 npm start
curl -i http://127.0.0.1:4173/healthz
```

## Asset credit

Ian McPherson's portrait is used locally from the supplied TMT Insights source URL and credited in the site footer.
