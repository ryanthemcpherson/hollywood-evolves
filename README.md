# Hollywood Evolves

A website and evidence-backed forecasting system for Ian McPherson's executive podcast about how technology repeatedly reshapes Hollywood.

## Product direction

**Past → present → probability → accountability.**

The historical product brief proposes that each episode explain a prior industry transition, examine current operating signals, and eventually carry resolvable forecasts with visible evidence and outcomes. That direction is not a statement of current public availability; `docs/PLAN.md` is the operating source of truth.

## Current scope

1. A responsive editorial website covering the program premise, Episode 01 question, eight editorial themes, host, and method.
2. Browser-local `YES / NO` calls for the Episode 01 premise and theme questions; these choices are not submitted, published, or counted.
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

This repository serves the standalone editorial site at `hollywoodevolves.mcpherson.app`. It contains no real submitted audience data or forecast values presented as real; illustrative values can appear only in explicitly labeled, fail-closed demo mode. Search indexing remains disabled until Episode 01's evidence-source contract, sitemap, and discovery behavior are approved together.

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

The homepage is a subject-first, segmented editorial scroll. Its opening keeps “operating system” together and pairs it with a code-built cinematic forecast instrument: a layered camera lens, viewfinder, signal ribbon, and an Evidence → Reader call → Outcome path. The three steps rotate every five seconds without moving focus or announcing automatic changes; hover, keyboard focus, the visible Pause control, a hidden tab, and reduced-motion preferences stop the rotation. It uses no fabricated values or unavailable platform destinations. `PAST 01` and `PRESENT 02` are independent anchored halves of one combined split chapter on desktop and stack on mobile; an explicit keyboard-reachable jump leads to `FORECAST 03`. One 12-column container aligns the masthead and every chapter.

Ian McPherson's supplied portrait appears once, only in the host/credibility chapter. The dark forecast chapter presents the Episode 01 premise, a browser-local `YES / NO` call, and its resolution frame without implying published guest, community, or model forecasts. The season introduces eight editorial questions in a controlled CSS 3D discovery field on desktop and a single-card, Previous/Next-controlled view with a live position readout on enhanced mobile layouts. The mobile field has no horizontal scrolling; without JavaScript, all eight cards stack vertically. Expanded question context grows to fit without a nested scrollbar and keeps a prominent close control at the card's upper-right. Browser-local calls are never submitted, published, or counted. The entire question field pauses together during hover or keyboard focus and becomes static when reduced motion is requested.

The interface progressively enhances its mobile menu, local-only calls, sharing tools, question rail, and three-step hero instrument. Opening a question writes its stable fragment to the URL; browser Back and Forward restore the matching context, while Escape or the close control returns to the unfragmented location and restores trigger focus. Sharing is derived from canonical metadata and includes the active question fragment when present. The instrument tabs update a plain-language process readout and visual focus, while the automatic sequence remains user-pausable. Fine pointers add a restrained, resettable perspective response. With JavaScript disabled, primary navigation, explanatory instrument content, and all eight question contracts remain available; seven use native disclosures and Episode 01 has its own section. Reduced-motion preferences disable the instrument response, automatic instrument rotation, and all automated question-field motion.

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
