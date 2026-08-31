# Hollywood Evolves Preview Hardening Design

**Status:** Approved in conversation on 2026-08-31

## Summary

This change hardens the current Hollywood Evolves preview without turning it into a public launch. It preserves the existing single-page editorial experience, Postgres-backed demo mode, fail-closed participation rules, and `noindex` posture while fixing verified mobile, accessibility, navigation, content, privacy, and security issues.

The implementation stays within the current architecture: static HTML and CSS built by Vite, progressively enhanced browser JavaScript, and the existing Node server. It adds no framework and no runtime dependency.

## Goals

- Eliminate horizontal page overflow from 280 CSS pixels upward.
- Keep the visual identity intact while making meaningful interface text readable.
- Make skip navigation move both the viewport and keyboard focus.
- Give question-card context a stable, shareable URL and predictable browser-history behavior.
- Make the mobile question rail understandable and operable without requiring an undisclosed swipe gesture.
- Correct current platform names and derive share URLs from the document canonical URL.
- Serve the existing typefaces locally and make the privacy statement match the actual network behavior.
- Tighten the content security policy, remove the remaining inline page style, and add HSTS.
- Expand automated coverage across narrow mobile, standard mobile, tablet, and desktop sizes.
- Reconcile project documentation with the resulting preview behavior.

## Non-goals

- Publishing the site for search indexing or removing `noindex`/`nofollow`.
- Adding a sitemap, analytics, RSS, episode pages, a custom domain, or public voting.
- Enabling public commentary, authentication, or any network submission that is currently unavailable.
- Defining the deferred formal evidence-source contract for forecast questions.
- Replacing the present design system, converting the application to a framework, or adding new runtime dependencies.
- Changing the approved demo-data and participation fail-closed guarantees.

## Invariants

- The homepage remains the authoritative preview surface.
- Demo values are shown only when demo mode is explicitly enabled and the backing data source is available.
- Audience forecasts and commentary remain unavailable unless their existing server-side activation requirements are satisfied.
- All eight editorial questions remain present and reachable.
- The site retains its established palette, wordmark treatment, editorial hierarchy, portrait, and restrained card motion.
- JavaScript enhancement must not remove essential editorial content or navigation from the server-rendered HTML.

## Architecture

### Document and content boundary

`index.html` remains the canonical document for the public preview. It owns the page structure, editorial copy, question rail controls, position announcement, canonical metadata, and no-JavaScript fallback content.

`lib/forecast-questions.mjs` remains the backend contract for the forecast questions. Platform-name corrections must be applied consistently to this module, the homepage, demo fixtures, and any tests or documentation that assert the content contract.

Legal pages remain static documents under `public/`. Their shared appearance continues to come from `public/legal.css` and `public/brand/brand.css`.

### Progressive enhancement boundary

`src/main.js` continues to enhance existing markup. It will own:

- question context expansion and collapse;
- synchronization between expanded questions and the URL hash;
- browser Back/Forward restoration;
- mobile previous/next controls and position announcements;
- canonical share payload construction; and
- explicit focus placement for skip navigation where native fragment behavior is insufficient.

The core question text and direct private forecast controls must remain available without JavaScript. Enhancement failures must leave usable links and native horizontal scrolling rather than trapping the user.

### Presentation boundary

`src/style.css` retains the current visual system and responsive structure. Changes should fix the root layout constraints rather than rely on global clipping. `public/brand/brand.css` becomes the shared source of local `@font-face` declarations so the homepage, 404 page, and legal pages use the same font assets and fallbacks.

### Server boundary

`server.mjs` continues to serve the built static application, public APIs, and security headers. This change only tightens response headers; it does not alter the availability rules for demo, forecast, LinkedIn, authentication, or commentary routes.

## Detailed behavior

### Responsive layout and typography

- The document width must never exceed the viewport at 280, 300, 312, 320, 375, 390, or 430 CSS pixels.
- The demo banner must wrap within the viewport without clipping its border, label, or message.
- The hero headline and “operating system” phrase must remain fully visible. The phrase remains unbroken at widths of 320 pixels and above; below 320 pixels it may wrap in a controlled way rather than overflow.
- Layout containment must be solved at the responsible components. Global `overflow-x: hidden` must not be the only protection against page overflow.
- Meaningful labels, controls, status text, metadata, and navigation must be at least 11 CSS pixels. Body copy and explanatory text must be at least 13 CSS pixels. Purely decorative text that is hidden from assistive technology may remain smaller when needed for the visual composition.
- Existing 44-by-44 CSS pixel minimum pointer targets and visible two-color focus treatments remain enforced.
- Motion continues to respect `prefers-reduced-motion`.

### Skip navigation

- The skip link continues to target `#main`.
- The main landmark becomes programmatically focusable without entering the normal tab order.
- Activating the skip link must scroll to the main content and set `document.activeElement` to the main landmark.
- The visible focus indication must remain clear against the main surface.

### Question context and URL history

Each question keeps its stable fragment identifier, such as `#question-01`.

Opening a question from the rail must:

1. expand that question's complete context;
2. collapse any other expanded question;
3. push its stable fragment into browser history when the same fragment is not already active; and
4. preserve the current in-page position rather than causing an unexpected jump.

Directly loading a question fragment or navigating to it with browser Back/Forward must restore the corresponding expanded state after enhancement initializes.

Closing question context must:

- use browser history when the current entry was created by opening the question on this page;
- otherwise remove or replace the question fragment without navigating away from the page;
- support the existing close button and Escape key; and
- restore focus to the opening control when the close was initiated by the user.

Unknown fragments and non-question fragments must retain normal browser behavior. The implementation must avoid recursive `hashchange` or `popstate` updates.

### Mobile question rail controls

- At mobile rail breakpoints, visible previous and next controls accompany the existing native horizontal rail.
- A text position indicator exposes `Question N of 8` and updates after button navigation, card focus, or user scrolling settles on a new card.
- Position changes are announced through a polite live region without repeatedly announcing during continuous scrolling.
- Previous is disabled on the first question and next is disabled on the last.
- Button navigation uses the existing cards and native scrolling; it does not create a second carousel state model.
- The rail remains manually scrollable by touch, trackpad, and keyboard, and remains useful if JavaScript is unavailable.
- The desktop moving-card field retains its current interaction and motion model.

### Sharing

- The document's canonical link is the single source for the base public URL.
- Native share data, clipboard fallback, and the readonly fallback field all use a URL derived from that canonical value.
- When a question is currently expanded, its stable question fragment is appended to the canonical URL so the shared link restores that context.
- If the canonical link is absent or malformed, sharing falls back explicitly to the current document URL without throwing or leaving a permanently pending status.
- Share status messages remain truthful for success, cancellation, unsupported APIs, and errors.

### Content corrections

- User-facing references to the current Warner Bros. Discovery streaming service change from “Max” to “HBO Max”.
- The podcast destination changes from “Apple Music” to “Apple Podcasts”.
- Copy changes must be applied consistently to server-rendered HTML, forecast-question contracts, demo-data platform labels, tests, and relevant documentation.
- Existing links may retain placeholder destinations during preview, but their visible and accessible labels must use the corrected names.

### Local fonts and privacy

- The currently selected display and body typefaces are stored as versioned WOFF2 assets under `public/fonts/` with the applicable license files.
- `@font-face` declarations live in `public/brand/brand.css`, use `font-display: swap`, and provide only the weights/styles the application actually uses.
- Every page removes Google Fonts stylesheet and preconnect requests.
- Font stacks keep robust system fallbacks so missing or blocked local assets do not hide content or destabilize layout.
- The privacy page no longer claims that the browser contacts Google Fonts. It states that font files are served by the same site and describes only network behavior that is actually present.
- Tests verify that shipped HTML has no Google Fonts network references.

### Security headers and 404 styling

- The inline style block in `public/404.html` moves to a static stylesheet served by the application.
- The content security policy removes `'unsafe-inline'` from `style-src` after all shipped inline styles have been eliminated.
- The policy explicitly limits fonts to the same origin and preserves the current restrictive defaults for scripts, images, connections, forms, objects, base URLs, and framing.
- HTTPS responses include `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- Existing security headers remain present on HTML, asset, API, error, and HEAD responses.
- Local development over HTTP may still emit the HSTS header because browsers ignore it on insecure transport; no environment-specific security downgrade is introduced.

## Error handling and degradation

- Question navigation must tolerate missing or malformed question elements by leaving native links functional and logging no noisy recurring errors.
- Scroll-position detection must tolerate browsers without `scrollend`, using a short debounced scroll handler.
- Clipboard and native-share failures must terminate the pending state and expose the existing manual-copy fallback.
- Canonical URL parsing must be contained at the share boundary and use the current document URL as the explicit fallback.
- Font load failure falls through to system fonts.
- Demo-state fetch and database failure behavior remains fail closed and continues to suppress sample percentages.

## Testing strategy

### Static and contract checks

- Update required-copy checks for HBO Max and Apple Podcasts.
- Assert that the canonical URL, privacy copy, legal pages, and 404 page contain no Google Fonts requests.
- Assert that shipped HTML contains no inline style blocks or style attributes that require `'unsafe-inline'`.
- Keep the existing eight-question, brand, demo, and public-surface contracts green.

### Browser behavior

- Make browser test discovery portable across supported Windows and Linux development environments, while allowing an explicit executable-path override.
- Verify skip-link activation makes `#main` the active element.
- Verify card opening, direct fragment loading, close button, Escape, Back, and Forward keep the URL, expanded state, and focus synchronized.
- Verify previous/next controls, disabled endpoints, native scrolling, and `Question N of 8` updates.
- Verify native share and all fallbacks use the canonical URL and include the active question fragment.
- Preserve existing no-JavaScript, storage-unavailable, keyboard, motion, pointer, and private-call tests.

### Reflow and accessibility matrix

Run layout containment and axe WCAG 2.2 AA checks at:

- 280x653
- 300x653
- 312x844
- 320x844
- 375x844
- 390x844
- 430x844
- 768x900
- 1366x768
- 1440x900

At each narrow viewport, verify document containment, banner containment, hero phrase visibility, question-card reachability, target sizes, and absence of horizontal page trapping. Legal pages and the 404 page receive representative mobile and desktop reflow and accessibility checks.

### Build and server verification

- Run the existing content checks, Vite production build, Node unit and integration tests, and full browser suite.
- Start the production server against the built output and verify CSP, HSTS, caching, media types, health behavior, custom 404 behavior, and HEAD parity.
- Confirm that no external font request appears in the browser network log.

## Documentation

- Update `README.md` to describe local fonts, corrected platform destinations, question deep links, and the preview verification command.
- Update `docs/PLAN.md` so completed preview-hardening work is no longer presented as future work and launch-only items remain deferred.
- Keep `DESIGN.md` aligned with the responsive typography rules without weakening the established brand contract.

## Delivery sequence

Implementation should proceed in small, test-driven commits:

1. make browser tests portable and add failing coverage for the approved behavior;
2. correct content and canonical sharing;
3. fix skip focus and question URL/history behavior;
4. add mobile rail controls and position feedback;
5. fix narrow layout and typography;
6. self-host fonts and align privacy copy;
7. tighten CSP, 404 styling, and HSTS;
8. reconcile documentation and run the complete verification matrix.

Each commit must keep the preview invariants intact and avoid enabling deferred public features.
