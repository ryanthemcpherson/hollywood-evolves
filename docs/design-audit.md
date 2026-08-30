# Design Audit — 10-Tell Anti-Slop Review

Audit date: 2026-08-30
Surface reviewed: responsive production preview, homepage, legal pages, and fallback 404

## Diagnosis and repair

| # | Canonical tell | Finding and treatment | Final |
|---|---|---|---|
| 1 | Tech gradient | None. The palette uses flat paper, ink, cinema black, and oxide red. | 0 |
| 2 | Generic tech hue | None. The accent is editorial red, not default indigo or violet. | 0 |
| 3 | Feature-tile grid | Avoided. The format and method use ruled sequences; the season uses one continuous ledger rather than equal-weight cards. | 0 |
| 4 | Accent rail | The first private-forecast treatment had a decorative red left rule. It was removed after independent review; hierarchy now comes from type, spacing, and the dark surface. | 0 |
| 5 | Unearned blur | None. There is no glass, backdrop blur, glow, or false elevation. | 0 |
| 6 | Monument stat | None. The preview shows no oversized decorative metric or fabricated percentage. | 0 |
| 7 | Icon topper | None. Method and sharing use words, rules, and native controls rather than an icon set. | 0 |
| 8 | Center stack | None. The hero, forecast, host, and method compositions remain left-set and asymmetric. | 0 |
| 9 | Default type | None. Newsreader and DM Sans were chosen for an editorial rather than startup-product voice. | 0 |
| 10 | Wrong surface | The primary surface remains Decide/Learn. The episode ledger adds secondary Inspect behavior through native disclosures without turning the homepage into a dashboard. This is the main risk to revisit if the ledger grows beyond one season. | 0 |

## Final assessment

All ten compositional tells are absent after repair: **0 / 10 present**. The distinctive language is an oversized editorial headline, hard-edged ledger, paper-to-cinema-black pacing, red editorial marks, and asymmetrical host composition. Honesty states are content, not buried disclaimers.

The extension does increase repetition: Episodes 02–08 use the same native details anatomy, and the page now carries eight numbered sections plus numbered episodes. That is a genuine tell risk. It remains controlled because there are no detached cards, icon toppers, or ornamental numbers: section numbers orient long-form reading, episode numbers identify ledger records, and disclosure repeats only where progressive access to question criteria is necessary. If more seasons are added, this single-page pattern should not simply be extended; filtering or a dedicated ledger index would be more editorially coherent.

### Additional acceptance review

- No fabricated guest, vote, comment, testimonial, trend, distribution, or forecast value appears.
- The visitor's semantic YES/NO radio choice persists only locally, can be cleared, and is explicitly not submitted, published, or counted.
- Episode 01 timing is stated only at month/year precision.
- Episodes 02–08 reproduce the approved draft questions without probabilities, guests, votes, trends, comments, evidence claims, or aired status. Each exposes only a preliminary threshold, deadline, and resolver class, with its review/not-open state visible before disclosure.
- Sharing uses the canonical URL through native sharing, clipboard fallback, or a selectable readonly field; it includes no social SDK or count.
- Interactive targets are at least 44px where applicable; focus styling, skip navigation, semantic landmarks, keyboard controls, contrast, and reduced-motion handling are present.
- Mobile layouts collapse to one column without horizontal overflow.
- DEG is named typographically; no unofficial brand asset is used.
- The homepage carries no standalone compliance section; a compact footer legal nav leads to reading-first Accessibility, Privacy, and Terms pages using the same warm-paper typography without hero or card-grid patterns.

### Quality and accessibility audit scope

The implementation aims at WCAG 2.2 Level AA; it does not claim legal certification or guaranteed ADA compliance. `npm test` validates required copy and matched social descriptions, legal-page semantics and metadata, draft-ledger semantics, favicon/manifest inventory, 180/192/512 PNG dimensions, the 1200×630 Open Graph asset, server routes and security headers, binary forecast persistence/reset, native-share and clipboard paths, and menu Escape/outside/link closing with appropriate focus placement and `aria-expanded` state. Escape and outside-pointer closure return focus to the menu button; activating a menu link moves focus to its destination section. Puppeteer Core uses the locally installed `/usr/bin/chromium`; external font requests are blocked in browser tests. Axe-core, target-size, and horizontal-overflow checks cover the homepage at 320, 390, 768, and 1440 CSS pixels and all legal pages at 390 and 1440. Temporary test servers and browser processes are torn down.

Manual review additionally covers the 375px composition, semantic landmarks and heading order, skip navigation, labels and accessible names, ID uniqueness, logical source/tab order, focus visibility, zoom/reflow, safe-area padding, reduced-motion and forced-colors modes, native details/summary behavior, image alternatives, font fallbacks, and absence of hover-only information. The legal pages use a narrow reading measure, logical headings, shared navigation, and a clear homepage return. Known preview limitation: Google-hosted fonts may be blocked or unavailable, with readable system fallbacks retained. Accessibility feedback is invited through the same channel used to access the preview; no contact address is invented.
