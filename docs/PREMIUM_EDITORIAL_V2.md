# Premium Editorial V2 — Operating Roadmap

## Baseline

Tick 1 began from `origin/main` at `181a3c19`. The inherited homepage measured 6,596px at 1366×768 and 7,058px at 390×844. It carried 937 desktop main words, 615 visible mobile words, duplicate season narratives, a sample-data layer, an unavailable listening-destination dock, moving question cards, and 46KB of accumulated CSS.

## Source evidence

- The supplied executive brief defines the subject as repeated technology change across Hollywood’s tools, talent, and business models.
- Approved season territory: Customer, Media Supply Chain, Creator, Content, Commercial, Audio, VFX, and Animation Evolution.
- The decision log approves DEG naming, places Episode 01 recording in November 2026 and publication in January 2027, and requires private YES/NO calls to remain browser-local.
- Ian’s supported positioning: Head of Business Development at TMT Insights; more than 25 years in media technology; 11 years at AWS; MA in Communications from USC.
- The source docs do not provide episode audio, episode URLs, published forecasts, audience totals, guests, testimonials, or platform accounts. The public page presents none.

## Visual inventory

Retained: canonical wordmarks, portrait, local fonts, warm-paper / ink / oxide / signal palette, one 12-column grid, thin rules, and tabular mono labels.

Rebuilt: subject-first cinematic type, a code-built physical-to-cloud supply-chain plate, historical route, connected signal waveform, dark measurable-question chapter, one editorial question pool, one host portrait, and compact method.

Removed: sample-data banner and loader, percentage rows, listening-destination labels, rotating method controls, moving/duplicated question cards, perspective effects, decorative motion, and override-stacked legacy CSS.

## Product-loop state

Episode 01 has a public editorial question, threshold, deadline, and evidence class. Its private reader YES/NO call is the only local browser call, is not a submitted forecast, and is not a probability ledger. The additional questions form an unassigned, inspectable native-disclosure pool with no voting controls. Sharing derives from canonical metadata and prefers the current valid question fragment, then the latest open pool disclosure; malformed and unknown fragments are ignored. No public audience aggregate, playback, commentary, or forecast ledger is claimed.

## Public invariants

- Subject and stakes precede method.
- Ian’s portrait appears exactly once, in `#host`.
- Each of eight editorial questions appears once.
- No sample states, fabricated values, unavailable controls, platform promises, or hidden roadmap claims.
- Native details preserve a linear no-JS reading order; enhanced mobile reveals one contract on demand.
- All authored controls meet a 44px minimum target.
- Canonical sharing, the Episode 01 local choice, keyboard escape behavior, reduced motion, forced colors, legal links, and noindex metadata remain.

## Acceptance gates

1. Focused editorial contract tests record RED against the inherited page, then GREEN against the rebuild.
2. `npm run check` passes content, asset, metadata, privacy, and legal assertions.
3. `npm run build` succeeds before browser execution.
4. `npm test` passes the full unit, server, security, legal, and browser suite.
5. Local geometry records desktop and mobile page height, section heights, visible-word budget, overflow, portrait count, and target sizes. The six-viewport release matrix records 461 visible main words throughout; at 390×844 it measures 5,567px / 6.60 viewports, with zero horizontal overflow and no visible authored target below 44px.
6. Browser gates cover all six exact homepage viewports, axe at each viewport, no-JS at 320/390, reduced motion, forced colors, all seven pool disclosures by keyboard and pointer, Episode 01 local persistence, malformed/unknown fragments, three real-click canonical share paths, hit testing, console/page/CSP errors, local fonts, portable browser discovery, and an explicit randomized-port launch gate.
7. No push, merge, deployment, or external publication in Tick 1.

## Tick status

- **Tick 1 — implementation and automated gates:** complete at implementation SHA `bc60ecc`. Automated gates passed 86/86. Independent code/security and editorial-design re-reviews both returned PASS for that exact SHA, with no blockers.
- **Tick 2 — built-site browser dogfood:** complete at fix SHA `5a97b3d`. Forty-eight captures cover every major chapter start across the six release viewports. Dogfood reproduced one medium navigation defect: the `#season` overview incorrectly opened Q2 and rewrote the fragment to `#question-02`, including after reload. A RED browser regression test captured both paths; the fragment matcher now opens only direct question-list items. The focused test and full 87/87 suite passed, `npm audit` reported zero vulnerabilities, an independent code/security reviewer returned PASS, and the final six-viewport interaction/geometry probe reported zero errors. No merge or deployment occurred in this tick.
- **Tick 3 — exact-head review and release decision:** complete. Fresh review initially BLOCKED release because Q2–Q8 still had dormant LinkedIn voting campaigns, the footer stated an unconfirmed production partnership, the season heading split inside a word at 768px, and pool disclosures lacked a visible state cue. Each blocker was fixed in a bounded test-first tranche. Only Episode 01 retains a campaign; the partnership claim is gone; six-viewport browser tests reject split heading words; and rendered `+`/`−` disclosure cues are asserted from computed styles. The full local gate passed, fresh code/security and editorial/design re-reviews returned PASS at `fad78fd`, PR #4 merged as `0322f445`, and the GitHub release workflow completed successfully. Railway's generated domain and the custom domain both served byte-identical built assets from the reviewed release.
- **Tick 4 — production readback and bounded correction:** in progress. Runtime dogfood found a truthfulness regression outside the rebuilt homepage: stale Railway variables still activated `/api/demo-state`, exposing the retired illustrative percentages, and `/readyz` reported `demoMode: true`. A RED server test reproduced the leak with `DEMO_MODE=true`; the bounded fix removes the public demo route, database initialization, readiness coupling, and unused PostgreSQL runtime dependency. PR CI then reproduced an existing rapid-disclosure race in which a late `toggle` event could replace the most recently selected share fragment; fragment ownership now follows the user's summary click, and the three share paths passed 12 repeated focused runs. The focused tests are GREEN and the full gate passes 86/86 with zero audit findings. Deployment verification remains before this tick can close.
