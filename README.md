# Hollywood Evolves

A website and evidence-backed forecasting system for Ian McPherson's executive podcast about how technology repeatedly reshapes Hollywood.

## Product direction

**Past → present → probability → accountability.**

The historical product brief proposes that each episode explain a prior industry transition, examine current operating signals, and eventually carry resolvable forecasts with visible evidence and outcomes. That direction is not a statement of current public availability; `docs/PLAN.md` is the operating source of truth.

## Current scope

1. A responsive editorial website that follows the executive brief: the series thesis, the three-act episode format, a dated timeline of the pivots each episode covers, the eight-episode Season One slate, the Episode 01 forecast, the Expert Alpha / Community Forecast / Market Update loop, and the host.
2. A browser-local 0–100 probability forecast for the Episode 01 question; it is not submitted, published, or counted.
3. A visible threshold, deadline, and evidence frame for each editorial question.
4. Static accessibility, privacy, and terms pages.
5. Fail-closed audience and commentary code whose public routes stay hidden until editorial and operational prerequisites are met.
6. Stable question deep links with Back/Forward restoration, mobile Previous/Next rail controls, and canonical sharing that follows the active question.
7. Locally served brand fonts, a strict same-origin content security policy, HSTS, and a responsive custom 404 page.

## Source material

- `source/Hollywood_Evolves_Executive_Brief.docx` — original executive brief supplied by Ryan.
- `docs/ian-positioning-research.md` — sourced public-career brief and recommended host territory.
- `docs/forecasting-system-research-reference.md` — long-form research-system design and operating reference.
- `docs/forecasting-research-sources.json` — machine-readable source list for that research reference.
- Claude artifact prototype — reference only; its sample aired states, percentages, trend readings, and comments must not be treated as real data.

## Public website

This repository serves the standalone editorial site at `hollywoodevolves.mcpherson.app`. It publishes no submitted audience data, illustrative percentages, or forecast values. Search indexing remains disabled until Episode 01's evidence-source contract, sitemap, and discovery behavior are approved together.

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

Browser tests automatically discover Chrome or Edge on Windows and Chromium or Chrome on Linux. Set `BROWSER_EXECUTABLE_PATH` to an installed Chromium-family executable when automatic discovery is not appropriate; no browser download is required.

### Homepage composition

The homepage is a segmented editorial scroll on one 12-column grid, ordered to match the executive brief:

1. **Cover** — the brief's thesis ("Hollywood keeps reinventing itself. What happens next?"), the host-plus-two-guests promise, routes to the Episode 01 forecast and Season One, and the TMT Insights × DEG production credit marking DEG's 30th anniversary.
2. **Format** — three director's chairs (host, historical guest, operating guest) above the brief's running order: Introduction (5 min), Act I — The Past, Act II — The Present, and Act III — Future Synthesis (10 min each). Bar widths stay proportional to minutes at every breakpoint.
3. **History** — "Hollywood has done this before": fourteen dated milestones, seven for Act I (the past, 1902–1953) and seven for Act II (the present, 1995–2023), side by side on wide screens. Each links to the episode it anchors, and `npm run check` rejects a milestone whose link or episode label does not resolve.
4. **Season One** — the brief's numbered slate, Episodes 01–08, each with a poster illustration, a then → now arc, the brief's synopsis, and its forecast question in a native disclosure (Episode 01 links to its chapter). On wide screens the cards share subgrid rows so titles, synopses, and question rows align.
5. **Episode 01** — "When does the ad tier become the main tier?", the measurable question with threshold, deadline, and evidence, and a private 0–100 probability control with canonical sharing.
6. **Prediction market** — Expert Alpha → Community Forecast → Market Update, framed as calibration rather than crowning winners.
7. **Host** — Ian McPherson's supplied portrait, which appears once on the page.

The illustrations in `public/art/` are original flat, cut-paper vector art in the brand palette, drawn as mid-century title-sequence and one-sheet posters so they read as editorial design rather than generated imagery. `scripts/build-art.mjs` is their source; edit it and run `npm run art`, then commit the regenerated SVGs. `npm run check` rejects art that contains scripts, styles, external references, or off-brand colors.

The hero drawing is the one exception to image-loaded art: `npm run art` also writes it inline into `index.html` (between the `hero-art` markers) so `src/style.css` can animate it. The loop is slow, pausable from the caption, and disabled for reduced-motion visitors; `npm run check` fails if the inline copy drifts from `public/art/hero.svg`.

The same script writes `public/brand/social-card.svg`: the cover thesis beside the projector art, with the canonical inverse wordmark embedded unchanged and no partnership claim. `npm run social-card` rasterizes it to the 1200×630 `social-card.png` with the local brand fonts loaded, and refuses to render if they fail to load.

The interface progressively enhances its mobile menu, Episode 01 local forecast, canonical sharing, and question fragments. With JavaScript disabled, primary navigation and all eight question contracts remain in reading order. Reduced-motion preferences retain static presentation, and forced-colors rules preserve focus and selected states.

The repository also includes an owned audience-signal intake for immutable question IDs: `/poll/<question-id>?src=<source>` and the compact `/?poll=<question-id>&src=<source>` form. Open questions use an accessible optional modal with explicit Yes/No, optional 1–99% confidence, one-response-per-browser safeguards, aggregate-only public results, source attribution, rate limits, idempotency, and an audit trail. Direct forecasts and LinkedIn reaction signals remain separate. Episode 01 is still `draft`; its poll route truthfully says it is not open and accepts no submissions. See `docs/audience-signal-intake.md` for the data model, LinkedIn permission boundary/manual CSV fallback, opening checklist, and deployment plan.

The written-commentary system uses Sign in with LinkedIn using OpenID Connect with the minimal `openid profile email` scopes. It cryptographically validates LinkedIn ID tokens, stores opaque server-side sessions, requires same-origin CSRF-protected writes and explicit attribution consent, rate-limits submissions, and places every contribution into an editorial moderation queue. LinkedIn authentication is not identity verification; verified-industry labels require a separate recorded editorial review. Members can delete their account and every submitted perspective. The feature is fail-closed unless every required environment variable is configured and `COMMENTARY_ENABLED=true`; see [`docs/commentary-operations.md`](docs/commentary-operations.md).

`npm test` is the complete quality gate. It runs content and metadata assertions, validates the icon inventory and exact PNG dimensions, builds the Vite site, starts temporary local servers, verifies traversal handling, strict CSP/HSTS headers, legal routes, the custom 404, local font MIME types, and same-origin font loading, then drives an automatically discovered Chromium-family browser through Puppeteer Core. Browser checks cover local forecasts, storage-denied fallback, menu and question-history keyboard behavior, minimum 44×44 CSS-pixel targets, meaningful 11px interface text, 13px explanatory copy, horizontal reflow, and axe-core WCAG 2.2 Level A/AA rules. The viewport matrix covers 280, 300, 312, 320, 375, 390, 430, 768, 1366, and 1440 CSS pixels. Each test-owned server and browser is closed during teardown; no browser download is used.

## Compliance pages

The homepage keeps only compact footer links to static Accessibility, Privacy, and Terms pages in `public/`. Those reading-first pages share `public/legal.css`, remain `noindex, nofollow` while site-wide indexing is disabled, and document only the current implementation. The accessibility target is WCAG 2.2 AA, not a legal certification or guarantee. Automated checks cover their semantics, metadata, reflow, targets, and axe rules at 390px and 1440px; the custom 404 is checked at 280px and 1440px. Manual review still remains necessary.

### Production / Railway

- Build: `npm run build`
- Start: `npm start`
- Health check: `/healthz`

The Node server (Node 22.12.0+) serves `dist/`, binds to `0.0.0.0` on Railway's `$PORT`, serves the homepage only at `/`, resolves configured immutable poll routes, exposes aggregate question APIs, caches fingerprinted Vite assets immutably while keeping stable asset URLs refreshable, and serves a styled `404.html` for unknown paths. Every response carries the shared security headers, including a same-origin CSP without inline-style permission and one-year HSTS with subdomains. Before any question opens, mount persistent storage at `/data`, set `AUDIENCE_DATA_PATH=/data/audience-signals.json`, and provision both secrets in `.env.example`; the file-backed implementation must run as one replica.

```bash
npm run build
PORT=4173 npm start
curl -i http://127.0.0.1:4173/healthz
```

## Asset credit

Ian McPherson's portrait is used locally from the supplied TMT Insights source URL and credited in the site footer.

The original HE monogram icon is maintained as an SVG source and exported locally as SVG, ICO, Apple touch, and ordinary 192/512 PNG assets. A separate deliberately inset 512px maskable icon keeps the monogram inside the central safe region. The Open Graph image remains 1200×630.

DM Sans, DM Mono, and Newsreader are served locally from `public/fonts/`; their matching SIL Open Font License texts are retained in `public/fonts/licenses/`. Source URLs and the acquisition date are recorded in `public/brand/brand.css`.
