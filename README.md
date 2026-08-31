# Hollywood Evolves

A website and evidence-backed forecasting system for Ian McPherson's executive podcast about how technology repeatedly reshapes Hollywood.

## Product thesis

**Past → present → probability → accountability.**

Each episode explains a prior industry transition, examines today's operating signals, and carries three resolvable forecasts: one structural, one operating, and one fast-resolving. One remains the headline forecast. Guests and the audience publish probabilities; the project preserves the evidence, assumptions, revisions, and eventual outcome.

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

This repository contains the Vite/Node preview for `hollywoodevolves.mcpherson.app`. The preview is deliberately `noindex`; it contains no live episode or published forecast values. Its optional PostgreSQL-backed demo mode is unmistakably labeled and keeps deterministic display-only samples isolated from audience and commentary data. Episode 01 records in November 2026 and publishes in January 2027.

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

The homepage is a subject-first, segmented editorial scroll. Its opening keeps “operating system” together and pairs it with a code-built cinematic forecast instrument: a layered camera lens, viewfinder, signal ribbon, and an immediately visible Evidence → Three views → Outcome path. It uses no subject image or fabricated value. A compact early distribution strip holds truthful, non-link placeholders for Spotify, Apple Music, and YouTube; Episode 01 links remain pending until the January 2027 publication. `PAST 01` and `PRESENT 02` are independent anchored halves of one combined split chapter on desktop and stack on mobile; an explicit keyboard-reachable jump leads to `FORECAST 03`. One 12-column container aligns the masthead and every chapter.

Ian McPherson's supplied portrait appears once, only in the host/credibility chapter. The dark forecast chapter preserves the empty Guest, Community, and Research System states and local-only binary preview. The season introduces an early pool of eight approved questions in a CSS 3D discovery field with clickable, browser-local `YES / NO` calls, then preserves the compact ruled index and seven native disclosure contracts below. The pool does not imply one question per episode; the operating brief calls for three. Motion pauses during hover or keyboard focus and becomes a static scrollable field when reduced motion is requested.

The interface progressively enhances its mobile menu, local-only binary call, sharing tools, and three-step hero instrument. In demo mode, one read-only payload hydrates its illustrative evidence, separately labeled sample views, unresolved outcome, headline ledger, and all eight moving cards. Sample percentages are never written to browser storage or counted as direct responses. A persistent disclosure exists before JavaScript; database failure becomes `DEMO DATA UNAVAILABLE`, never silent zeros. Fine pointers add a restrained, resettable perspective response. With JavaScript disabled, the disclosure, primary navigation, and all three explanatory instrument stages remain available. Reduced-motion preferences disable the instrument response and all automated question-field motion.

The repository also includes an owned audience-signal intake for immutable question IDs: `/poll/<question-id>?src=<source>` and the compact `/?poll=<question-id>&src=<source>` form. Open questions use an accessible optional modal with explicit Yes/No, optional 1–99% confidence, one-response-per-browser safeguards, aggregate-only public results, source attribution, rate limits, idempotency, and an audit trail. Direct forecasts and LinkedIn reaction signals remain separate. Episode 01 is still `draft`; its poll route truthfully says it is not open and accepts no submissions. See `docs/audience-signal-intake.md` for the data model, LinkedIn permission boundary/manual CSV fallback, opening checklist, and deployment plan.

The written-commentary system uses Sign in with LinkedIn using OpenID Connect with the minimal `openid profile email` scopes. It cryptographically validates LinkedIn ID tokens, stores opaque server-side sessions, requires same-origin CSRF-protected writes and explicit attribution consent, rate-limits submissions, and places every contribution into an editorial moderation queue. LinkedIn authentication is not identity verification; verified-industry labels require a separate recorded editorial review. Members can delete their account and every submitted perspective. The feature is fail-closed unless every required environment variable is configured and `COMMENTARY_ENABLED=true`; see [`docs/commentary-operations.md`](docs/commentary-operations.md).

`npm test` is the complete quality gate. It runs content and metadata assertions, validates the icon inventory and exact PNG dimensions, builds the Vite site, starts temporary local servers, verifies traversal handling/security headers/legal routes/asset media types, and drives the system `/usr/bin/chromium` through Puppeteer Core. Browser checks cover the binary local forecast, storage-denied fallback, menu keyboard behavior and appropriate focus placement, minimum 44×44 CSS-pixel targets, horizontal reflow, and axe-core WCAG 2.2 Level A/AA rules (including contrast) at representative widths. Each test-owned server and browser is closed during teardown; no browser download is used.

## Compliance pages

The homepage keeps only compact footer links to static Accessibility, Privacy, and Terms pages in `public/`. Those reading-first pages share `public/legal.css`, remain `noindex, nofollow` during preview, and document only the current implementation. The accessibility target is WCAG 2.2 AA, not a legal certification or guarantee. Automated checks cover their semantics, metadata, reflow, targets, and axe rules at 390px and 1440px; manual review still remains necessary.

### Production / Railway

- Build: `npm run build`
- Start: `npm start`
- Readiness check: `/readyz` (`/healthz` remains coarse)

The Node server (Node 22.12.0+) serves `dist/`, binds to `0.0.0.0` on Railway's `$PORT`, and exposes coarse health plus database-aware readiness. Add a Railway PostgreSQL service, reference its `DATABASE_URL` from the app, and set `DEMO_MODE=true`; see [`docs/demo-data-operations.md`](docs/demo-data-operations.md) for schema/seed safety, cutover, and rollback. Commentary remains off unless its complete, separate fail-closed configuration is explicitly supplied. Before any real audience question opens, mount persistent storage at `/data`, set `AUDIENCE_DATA_PATH=/data/audience-signals.json`, and provision its secrets.

```bash
npm run build
PORT=4173 npm start
curl -i http://127.0.0.1:4173/healthz
```

## Asset credit

Ian McPherson's portrait is used locally from the supplied TMT Insights source URL and credited in the site footer.

The original HE monogram icon is maintained as an SVG source and exported locally as SVG, ICO, Apple touch, and ordinary 192/512 PNG assets. A separate deliberately inset 512px maskable icon keeps the monogram inside the central safe region. The Open Graph image remains 1200×630.
