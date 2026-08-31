# Hollywood Evolves Preview Hardening Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Harden the current noindex Hollywood Evolves preview across Windows/Linux test portability, content accuracy, keyboard focus, question deep links, mobile question navigation, canonical sharing, narrow-screen reflow, local fonts, privacy, and response security without enabling deferred public features.

**Architecture:** Keep the existing Vite-built static HTML/CSS, progressive browser JavaScript, and Node server. Add behavior through the existing semantic markup and `src/main.js`; keep editorial and API contracts in their existing modules; place shared local font declarations in `public/brand/brand.css`; and tighten the existing server header map. Add no framework and no runtime dependency.

**Tech stack:** Node.js 22.12+, ES modules, Vite 7, native HTML/CSS/JavaScript, `node:test`, Puppeteer Core, axe-core, and the existing Node HTTP server.

**Approved design:** `docs/superpowers/specs/2026-08-31-preview-hardening-design.md`

## Baseline and guardrails

- Branch: `feature/preview-hardening`
- Baseline commit: `1d7d97b`
- Design commit: `6c5cd2f`
- `npm run check` passes.
- `npm run build` passes.
- All 60 non-browser tests pass.
- The 41 browser cases initially fail during suite setup because `tests/browser.test.mjs` hardcodes `/usr/bin/chromium` on Windows. After Task 1 makes the browser launch portable, 36 pass and five expose the already-approved responsive defects: document overflow at 320/375/390px, overflow after mobile card expansion, and the 320px reading-budget overrun. Tasks 5 and 7 turn those known failures green.
- Preserve `noindex, nofollow`, demo labeling, fail-closed participation, all eight questions, browser-local calls, and no-JavaScript editorial access throughout.
- Use `apply_patch` for text edits. Binary font downloads are the only planned exception.
- Before every commit, run `git status --short --branch`, `git diff --check`, and inspect the staged diff.

## Task 1: Make the browser quality gate portable

**Files:**

- Modify: `tests/browser.test.mjs:1-45`

### Step 1: Reproduce the existing red baseline

Run:

```powershell
node --test tests/browser.test.mjs
```

Expected: suite setup fails with `Browser was not found at the configured executablePath (/usr/bin/chromium)`.

### Step 2: Add explicit browser executable discovery

Import `existsSync` from `node:fs` and `join` from `node:path`. Add a focused resolver above the suite hook:

```js
function browserExecutablePath() {
  const configured = process.env.BROWSER_EXECUTABLE_PATH;
  if (configured) {
    if (!existsSync(configured)) throw new Error(`BROWSER_EXECUTABLE_PATH does not exist: ${configured}`);
    return configured;
  }

  const candidates = process.platform === 'win32'
    ? [
      process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  const detected = candidates.filter(Boolean).find(existsSync);
  if (!detected) throw new Error('No supported Chromium browser found. Set BROWSER_EXECUTABLE_PATH.');
  return detected;
}
```

Pass `browserExecutablePath()` to `puppeteer.launch`. Keep the existing headless and sandbox arguments.

### Step 3: Verify browser launch and the unaffected baseline

Run:

```powershell
npm run check
npm run build
$nonBrowserTests = Get-ChildItem tests -Filter '*.test.mjs' | Where-Object Name -ne 'browser.test.mjs' | ForEach-Object FullName
node --test $nonBrowserTests
node --test --test-name-pattern="binary private call" tests/browser.test.mjs
```

Expected: content checks, build, all non-browser tests, and the focused real-browser case pass on Windows. A full browser run has 36 passes and the five known responsive failures recorded in the baseline guardrails. Any additional browser failure requires `superpowers:systematic-debugging` before continuing.

### Step 4: Commit the harness fix

```powershell
git add tests/browser.test.mjs
git commit -m "test: make browser discovery portable"
```

## Task 2: Correct platform names across public and contract surfaces

**Files:**

- Modify: `index.html:8,10,24-25`
- Modify: `lib/forecast-questions.mjs:1-16`
- Modify: `lib/demo-data-repository.mjs:111`
- Modify: `scripts/check.mjs:12-115`
- Modify: `tests/audience.test.mjs:1-30`
- Modify: `tests/browser.test.mjs:280-300`
- Modify: `tests/public-contract.test.mjs:20-45`
- Modify: `docs/design-audit.md`
- Modify: `docs/prediction-system.md:50-65`

### Step 1: Change assertions first

- Expect `Spotify`, `Apple Podcasts`, and `YouTube` in the hero dock and demo payload.
- Expect `HBO Max` in the Episode 01, Commercial Evolution, and Audio Evolution question prompts.
- Add a public-contract assertion that the obsolete visible names do not remain in the homepage or question contract. Match `Max` carefully so `Max-Age` is not treated as content.

Run:

```powershell
node scripts/check.mjs
node --test tests/audience.test.mjs tests/public-contract.test.mjs
```

Expected: failures identify the old content in the implementation.

### Step 2: Apply the content correction consistently

- Replace the three service-list references with `HBO Max` in `index.html` and `lib/forecast-questions.mjs`.
- Replace `Apple Music` with `Apple Podcasts` in homepage and demo platform labels while retaining the existing pending, non-linked preview state.
- Reconcile the two documentation references so historical design notes do not prescribe obsolete names.
- Do not alter question IDs, deadlines, thresholds, states, or route availability.

### Step 3: Verify content and browser rendering

Run:

```powershell
npm run check
node --test tests/audience.test.mjs tests/public-contract.test.mjs tests/browser.test.mjs
```

Expected: corrected copy passes and the full browser file stays green.

### Step 4: Commit

```powershell
git add index.html lib/forecast-questions.mjs lib/demo-data-repository.mjs scripts/check.mjs tests/audience.test.mjs tests/browser.test.mjs tests/public-contract.test.mjs docs/design-audit.md docs/prediction-system.md
git commit -m "fix: correct current platform names"
```

## Task 3: Make skip links transfer keyboard focus

**Files:**

- Modify: `index.html:5-7`
- Modify: `public/accessibility.html:2-3`
- Modify: `public/privacy.html:2-3`
- Modify: `public/terms.html:2-3`
- Modify: `src/style.css:1-3`
- Modify: `public/legal.css:1-8`
- Modify: `tests/browser.test.mjs:120-185,914-936`
- Modify: `scripts/check.mjs:80-95`

### Step 1: Add failing focus tests

For the homepage and every legal page, activate `.skip` by keyboard and assert:

```js
assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
assert.equal(await page.evaluate(() => location.hash), '#main');
```

Extend static checks to require `<main ... id="main" tabindex="-1">`.

Run:

```powershell
npm run check
node --test --test-name-pattern="skip|legal pages" tests/browser.test.mjs
```

Expected: active element remains the body and the new static assertion fails.

### Step 2: Make each main landmark a focus target

- Add `tabindex="-1"` to the homepage and legal-page main landmarks.
- Add a clear `#main:focus-visible` treatment using existing brand colors without putting the landmark into the normal tab order.
- Rely on native fragment focus behavior; add JavaScript only if the browser test proves a supported browser does not focus a `tabindex="-1"` fragment target.

### Step 3: Verify keyboard focus and accessibility

Run:

```powershell
npm run check
node --test --test-name-pattern="skip|legal pages" tests/browser.test.mjs
```

Expected: the target landmark is active on every page, reflow and axe remain green.

### Step 4: Commit

```powershell
git add index.html public/accessibility.html public/privacy.html public/terms.html src/style.css public/legal.css tests/browser.test.mjs scripts/check.mjs
git commit -m "fix: transfer skip-link focus to main content"
```

## Task 4: Synchronize question context with URL history

**Files:**

- Modify: `src/main.js:129-235`
- Modify: `tests/browser.test.mjs:680-760`

### Step 1: Add failing history tests

Cover these independent cases:

1. Clicking Question 03 expands it and changes the URL to `#question-03` without a page jump.
2. Loading `/#question-03` expands Question 03.
3. Opening Question 03 and then Question 04 creates two history entries; Back restores Question 03 and Forward restores Question 04.
4. Escape and the close button close context, return focus to the trigger, and remove the fragment.
5. Closing a directly loaded fragment uses `replaceState` behavior and does not navigate away.
6. Unknown fragments retain normal fragment behavior and do not expand a card.

Run:

```powershell
node --test --test-name-pattern="question-card|question URL|history|direct fragment" tests/browser.test.mjs
```

Expected: the new URL and restoration assertions fail.

### Step 2: Separate visual expansion from navigation intent

- Keep `expandCard` and `collapseCard` responsible for DOM state.
- Map each `.motion-card` to the existing `.motion-card-link` fragment.
- Add `syncQuestionContextFromLocation()` for initial load, `popstate`, and `hashchange`.
- On a user open, call `history.pushState` with a small namespaced marker such as `{ ...history.state, heQuestionContext: '#question-03' }`.
- On a user close, call `history.back()` only when the current entry carries that marker. Otherwise use `history.replaceState` to remove the question fragment while retaining path and query.
- Track whether focus should return after a history-driven close so Back/Forward navigation does not steal focus unexpectedly.
- Preserve native behavior for fragments that do not map to a question card.
- Keep the existing season `<details>` disclosure synchronized when a question opens.

### Step 3: Verify behavior and regressions

Run:

```powershell
node --test --test-name-pattern="question-card|question URL|history|mobile theme cards" tests/browser.test.mjs
```

Expected: direct links, click, close, Back, Forward, Escape, focus restoration, motion resumption, and no-JavaScript access pass.

### Step 4: Commit

```powershell
git add src/main.js tests/browser.test.mjs
git commit -m "feat: add question context deep links"
```

## Task 5: Add explicit mobile question rail navigation

**Files:**

- Modify: `index.html:11-20`
- Modify: `src/main.js:129-300`
- Modify: `src/style.css:33-43`
- Modify: `tests/browser.test.mjs:430-540,820-885`
- Modify: `scripts/check.mjs:40-65`

### Step 1: Add failing semantic and interaction tests

Require a mobile-only control group containing:

- a Previous button;
- a polite, atomic `Question 1 of 8` status;
- a Next button.

At 390px, assert the first/last disabled states, button navigation to all eight cards, status changes, focus-driven updates, and updates after manual rail scrolling settles. At 1366px, assert the control group is hidden. With JavaScript disabled, assert controls remain hidden and the native rail/disclosures remain usable.

Run:

```powershell
npm run check
node --test --test-name-pattern="mobile question|question rail|mobile theme cards" tests/browser.test.mjs
```

Expected: controls are absent.

### Step 2: Add server-rendered controls as progressive enhancement hooks

Add the controls immediately after `.question-rail`, initially hidden:

```html
<div class="question-rail-controls" data-question-rail-controls hidden>
  <button type="button" data-question-previous>Previous</button>
  <p id="question-position" aria-live="polite" aria-atomic="true">Question 1 of 8</p>
  <button type="button" data-question-next>Next</button>
</div>
```

Associate the rail with the status using an appropriate accessible description without turning the cards into an ARIA carousel.

### Step 3: Enhance the existing native rail

- Use the existing `motionCards` array as the sole item model.
- Show controls only when `(max-width: 700px)` matches.
- Determine the current card by the nearest card start/center in the rail; do not maintain a separate carousel list.
- Scroll with `scrollIntoView({ inline: 'start', block: 'nearest' })`, using instant behavior under reduced motion.
- Update buttons and status after button activation, card focus, and a short debounced scroll handler.
- Remove pending timers during breakpoint changes and keep controls hidden on desktop.

### Step 4: Style controls and mobile expansion

- Keep each control at least 44x44 pixels and use the existing square, ruled visual language.
- Ensure the status is at least 11px.
- Make an expanded mobile card remain in normal rail flow, use one column, and contain its context without applying desktop `left: 50%` or neighbor-shift geometry.
- Preserve manual horizontal scrolling, scroll snapping, and reduced-motion behavior.

### Step 5: Verify and commit

Run:

```powershell
npm run check
node --test --test-name-pattern="mobile question|question rail|mobile theme cards|question-card" tests/browser.test.mjs
```

Then commit:

```powershell
git add index.html src/main.js src/style.css tests/browser.test.mjs scripts/check.mjs
git commit -m "feat: add mobile question rail controls"
```

## Task 6: Derive all share destinations from canonical metadata

**Files:**

- Modify: `index.html:4,10`
- Modify: `src/main.js:333-375`
- Modify: `public/privacy.html:5-7`
- Modify: `scripts/check.mjs:50-70`
- Modify: `tests/browser.test.mjs:340-430`
- Modify: `tests/public-contract.test.mjs:20-45`

### Step 1: Add failing canonical-source tests

- Assert `src/main.js` and the fallback input do not contain the production hostname.
- Assert native share, clipboard fallback, and manual fallback use `new URL(document.querySelector('link[rel="canonical"]').href)` with `#forecast` when no card is open.
- Open Question 03 and assert every share path uses `#question-03`.
- Remove or corrupt the canonical link in a browser test and assert sharing falls back to `window.location.href` without leaving a pending state.

Run:

```powershell
npm run check
node --test --test-name-pattern="share" tests/browser.test.mjs
```

Expected: hardcoded URL and active-question cases fail.

### Step 2: Build share data at activation time

Replace the static object with focused functions:

```js
function canonicalShareUrl() {
  try {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const url = new URL(canonical || window.location.href, window.location.href);
    url.hash = expandedCard?.querySelector('.motion-card-link')?.hash || '#forecast';
    return url.href;
  } catch {
    return window.location.href;
  }
}

function shareData() {
  return { title: '...', text: '...', url: canonicalShareUrl() };
}
```

- Compute data inside the click handler.
- Pass the computed URL through native share, clipboard, and `revealShareUrl`.
- Remove the hardcoded `value` from `#share-url`.
- Keep explicit success, cancellation, clipboard failure, and manual-copy messages.
- Update privacy copy to describe canonical Episode 01/question links accurately.

### Step 3: Verify and commit

Run:

```powershell
npm run check
node --test --test-name-pattern="share" tests/browser.test.mjs
node --test tests/public-contract.test.mjs
```

Then commit:

```powershell
git add index.html src/main.js public/privacy.html scripts/check.mjs tests/browser.test.mjs tests/public-contract.test.mjs
git commit -m "fix: derive share links from canonical metadata"
```

## Task 7: Fix narrow reflow and meaningful interface text sizes

**Files:**

- Modify: `src/style.css:1-15,28-48`
- Modify: `tests/browser.test.mjs:810-940`

### Step 1: Expand the failing viewport matrix

Add 280x653, 300x653, and 312x844 to the existing layout/axe loop. At narrow widths assert:

- document overflow is no more than one pixel;
- `.demo-banner`, `.hero-copy`, `.operating-system`, `.question-field`, and rail controls remain within the viewport;
- the operating-system phrase has one client rect at 320px and above, while widths below 320 may wrap but must remain contained;
- curated meaningful interface selectors compute to at least 11px;
- body/explanatory selectors compute to at least 13px;
- all interactive targets remain at least 44x44 pixels.

Include the new widths in mobile editorial budgets, adjusting only for measured text reflow while retaining the existing preservation floors.

Run:

```powershell
node --test --test-name-pattern="layout and axe|mobile editions" tests/browser.test.mjs
```

Expected: the 280/300/312 cases expose headline/banner containment and text-size failures.

### Step 2: Fix responsible component constraints

- Remove `html { overflow-x: hidden }` once component containment tests pass; do not replace root-cause fixes with global clipping.
- Use a continuous narrow headline scale around `clamp(36px, 11vw, 58px)` and allow `.operating-system` to wrap only below 320px.
- Make the demo banner a wrapping layout with breakable detail text, bounded padding, and no fixed minimum content width.
- Ensure grid, instrument, question field, expanded mobile cards, and rail controls use `min-width: 0` where grid/flex intrinsic sizing can escape.
- Raise meaningful 8–10px interface and metadata text to 11px, including navigation, calls to action, forecast labels, ledger headings, editorial states, question-card labels/cues, close controls, and instrument controls/readouts.
- Raise explanatory 11–12px copy to at least 13px where it is not decorative.
- Leave small instrument-diagram labels below 11px only when they are `aria-hidden` and visually decorative.

### Step 3: Run focused and full visual automation

Run:

```powershell
node --test --test-name-pattern="layout and axe|mobile editions|mobile theme cards|legal pages" tests/browser.test.mjs
```

Expected: all ten viewports, target checks, content budgets, and axe checks pass.

### Step 4: Commit

```powershell
git add src/style.css tests/browser.test.mjs
git commit -m "fix: harden narrow-screen reflow and typography"
```

## Task 8: Self-host the current fonts and align privacy disclosures

**Files:**

- Create: `public/fonts/dm-sans-latin-variable.woff2`
- Create: `public/fonts/dm-mono-latin-variable.woff2`
- Create: `public/fonts/newsreader-latin-variable.woff2`
- Create: `public/fonts/licenses/dm-sans-OFL.txt`
- Create: `public/fonts/licenses/dm-mono-OFL.txt`
- Create: `public/fonts/licenses/newsreader-OFL.txt`
- Modify: `public/brand/brand.css:1-20`
- Modify: `index.html:4`
- Modify: `poll.html:1-5`
- Modify: `public/accessibility.html:2`
- Modify: `public/privacy.html:2,7`
- Modify: `public/terms.html:2`
- Modify: `server.mjs:54`
- Modify: `scripts/check.mjs:1-115`
- Modify: `tests/brand.test.mjs:1-75`
- Modify: `tests/browser.test.mjs:1-120,914-970`
- Modify: `tests/server.test.mjs:150-185`

### Step 1: Add failing asset and network-contract tests

- Require the three WOFF2 assets and three license files.
- Assert no shipped HTML contains `fonts.googleapis.com`, `fonts.gstatic.com`, Google font preconnects, or external font stylesheets.
- Assert `brand.css` declares the three families with `font-display: swap` and correct weight ranges.
- Assert the server returns `font/woff2` for a local font.
- Record browser requests during a homepage/legal-page load and assert no font request leaves the local origin.
- Replace test request interception that only existed to abort Google Fonts.

Run:

```powershell
npm run check
node --test --test-name-pattern="font|legal pages" tests/brand.test.mjs tests/server.test.mjs tests/browser.test.mjs
```

Expected: assets/declarations are missing and Google references remain.

### Step 2: Acquire the exact approved font assets and licenses

- Request variable-font CSS from the Google Fonts CSS API with a WOFF2-capable browser user agent for DM Sans 400–600, DM Mono 400–500, and Newsreader optical size 6–72 / weight 400–600.
- Download only each Latin WOFF2 resource to the stable filenames above.
- Download each matching OFL license from the official `google/fonts` repository.
- Record the source URLs and acquisition date in a comment in `brand.css` or the README asset section.
- Do not add an npm dependency or runtime request.

### Step 3: Declare and serve local fonts

Add shared declarations before `:root`:

```css
@font-face {
  font-family: "DM Sans";
  src: url("/fonts/dm-sans-latin-variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 400 600;
  font-display: swap;
}
```

Add equivalent DM Mono and Newsreader declarations, including Newsreader's optical sizing behavior where supported. Preserve system fallbacks in the brand tokens.

- Remove Google font links/preconnects from every shipped HTML page.
- Add `.woff2: font/woff2` to the server media map.
- Update Privacy to state that typefaces are served by Hollywood Evolves and do not create a font request to Google.

### Step 4: Verify font loading, layout, and privacy

Run:

```powershell
npm run check
npm run build
node --test tests/brand.test.mjs tests/server.test.mjs
node --test --test-name-pattern="font|layout and axe|legal pages" tests/browser.test.mjs
```

Expected: local fonts load, no external font requests occur, privacy is accurate, and reflow metrics remain green.

### Step 5: Commit

```powershell
git add public/fonts public/brand/brand.css index.html poll.html public/accessibility.html public/privacy.html public/terms.html server.mjs scripts/check.mjs tests/brand.test.mjs tests/browser.test.mjs tests/server.test.mjs
git commit -m "feat: self-host brand fonts"
```

## Task 9: Tighten CSP, externalize 404 styling, and add HSTS

**Files:**

- Create: `public/404.css`
- Modify: `public/404.html:1`
- Modify: `server.mjs:55-62`
- Modify: `scripts/check.mjs:25-115`
- Modify: `tests/server.test.mjs:135-205`
- Modify: `tests/browser.test.mjs:60-75,885-970`

### Step 1: Add failing security and 404 tests

- Assert CSP contains `style-src 'self'` and `font-src 'self'` and does not contain `'unsafe-inline'`.
- Assert HSTS equals `max-age=31536000; includeSubDomains` on HTML, assets, API/health, 404, and HEAD responses.
- Assert shipped HTML contains no `<style>` blocks or `style=` attributes.
- Assert `/404.css` is served as CSS and the custom 404 reflows and passes axe at 280px and 1440px.
- Add one non-CSP-bypassed browser load to verify local styles render under the production header and no `securitypolicyviolation` is recorded during initial enhancement.

Run:

```powershell
npm run check
node --test --test-name-pattern="security headers|404|content security" tests/server.test.mjs tests/browser.test.mjs
```

Expected: inline 404 style, permissive CSP, and missing HSTS fail.

### Step 2: Externalize the 404 page style

- Move the existing rules unchanged into `public/404.css`, then add only the narrow reflow/focus adjustments required by the new tests.
- Replace the inline block with `<link rel="stylesheet" href="/404.css">` while keeping the shared brand stylesheet first.
- Do not alter the established 404 message or wordmark.

### Step 3: Tighten headers

Set:

```js
'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
```

Keep all existing header and caching behavior otherwise unchanged.

### Step 4: Verify and commit

Run:

```powershell
npm run check
npm run build
node --test tests/server.test.mjs
node --test --test-name-pattern="security headers|404|content security|layout and axe" tests/browser.test.mjs
```

Then commit:

```powershell
git add public/404.css public/404.html server.mjs scripts/check.mjs tests/server.test.mjs tests/browser.test.mjs
git commit -m "fix: tighten static response security"
```

## Task 10: Reconcile documentation and run the release-quality gate

**Files:**

- Modify: `README.md:1-140`
- Modify: `docs/PLAN.md:1-25`
- Modify: `DESIGN.md:85-100`

### Step 1: Update current-state documentation

- Document portable `BROWSER_EXECUTABLE_PATH` override and automatic Windows/Linux discovery.
- Describe question deep links, browser-history behavior, mobile Previous/Next controls, and canonical sharing.
- State that fonts are served locally and list the font/license asset location.
- Extend the documented viewport matrix to 280, 300, 312, 320, 375, 390, 430, tablet, and desktop.
- Record CSP/HSTS and custom 404 coverage.
- Update `docs/PLAN.md` so these hardening items are live, while evidence-contract, participation, sitemap, indexing, analytics, RSS, episode pages, and custom-domain work remain deferred.
- Clarify in `DESIGN.md` that meaningful interface text is at least 11px, explanatory copy is at least 13px, and decorative instrument labels are the only smaller exception.

### Step 2: Run the complete verification matrix

Use `superpowers:verification-before-completion`, then run:

```powershell
npm test
git diff --check
git status --short --branch
```

Start the production server against the fresh build:

```powershell
$env:PORT = '4173'
$serverProcess = Start-Process -FilePath node -ArgumentList 'server.mjs' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try {
  Invoke-WebRequest -Uri 'http://127.0.0.1:4173/healthz' -UseBasicParsing | Select-Object StatusCode, Headers
  Invoke-WebRequest -Uri 'http://127.0.0.1:4173/fonts/dm-sans-latin-variable.woff2' -UseBasicParsing | Select-Object StatusCode, Headers
  try { Invoke-WebRequest -Uri 'http://127.0.0.1:4173/not-a-page' -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
} finally {
  Stop-Process -Id $serverProcess.Id
  Remove-Item Env:PORT
}
```

Expected:

- every content, build, unit, integration, browser, reflow, and axe test passes;
- health is 200;
- font response is 200 with `font/woff2`;
- unknown page is the branded 404;
- CSP has no `'unsafe-inline'`;
- HSTS is present;
- the worktree contains only the planned documentation changes before the final docs commit.

### Step 3: Commit documentation

```powershell
git add README.md docs/PLAN.md DESIGN.md
git commit -m "docs: document preview hardening"
```

### Step 4: Final review

- Inspect `git log --oneline --decorate -12` for the planned atomic sequence.
- Inspect `git diff main...HEAD --stat` and `git diff main...HEAD --check`.
- Search for obsolete or prohibited state:

```powershell
rg -n "fonts\.googleapis|fonts\.gstatic|Apple Music|Netflix, Disney\+, Max|unsafe-inline|style=" . --glob '!node_modules/**' --glob '!dist/**' --glob '!.git/**'
```

- Confirm any remaining `Max-Age` header tokens and approved design-document historical wording are not obsolete service-name copy.
- Perform a focused self-review of URL history, focus restoration, mobile rail boundaries, and fail-closed server routes.
- Use `superpowers:finishing-a-development-branch` only after all evidence is green and present the branch integration options without merging or deploying automatically.
