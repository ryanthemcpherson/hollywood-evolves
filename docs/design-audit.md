# Design Audit — Rejected Direction Rebuild

Audit date: 2026-08-30
Surface reviewed: responsive production preview homepage

## Authoritative feedback addressed

| Feedback | Implemented response |
|---|---|
| Two images of the host | The hero portrait was removed. `index.html` contains one Ian image reference, inside `#host` only. |
| Subject matter under-emphasized | The opening names Hollywood's production/distribution operating system and asks what changes next before naming the host. |
| Laptop misalignment | The vertical rail, three-column cover, and detached timing strip were removed. Header, chapters, and footer use one 12-column `.grid`. Browser checks cover 1366×768 and 1440×900. |
| Past and Present should be side by side | `#past` and `#present` are sibling articles in one combined split wrapper at desktop/laptop widths, stack on mobile, and share an unmistakable jump to Forecast 03. |
| Forecast should lead | The hero is an unresolved forecast instrument and Forecast is the central dark decision surface. |
| Hero image felt unclear | The code-built instrument now reads spatially as Capture → Forecast → Resolve through an aperture focal object, labeled evidence path, signal ribbon, public-ledger plane, and centered unresolved gate. Three accessible tabs explain what each state truthfully means and advance directly to the draft question. |
| Forecasts need moving questions | Eight unique linked question cards move through a controlled CSS 3D field, pause on hover/focus, become static under reduced motion, and show only truthful unpublished `YES — / NO —` states. Native contracts remain below. |

## Visual and content audit

The lead visual is semantic HTML, CSS, and two small inline SVG drawings: a lens/aperture and a signal ribbon. Viewfinder marks, the evidence-to-resolution path, forecast gate, and public-ledger plane are DOM/CSS. Its three-step tab interface keeps all core copy in HTML, highlights the relevant visual, supports arrow-key navigation, and adds fine-pointer perspective that resets on exit and is disabled for reduced motion. It contains no probabilities, metrics, fake UI values, or generated imagery. The only content image is the supplied Ian portrait.

The palette changes between ivory, warm paper, oxide red, cinema black, and restrained technical blue. No gradients, glass, rounded SaaS cards, vertical writing, filmstrip language, decorative rail, or detached footer are used.

Season One keeps all eight approved draft questions. Its discovery field has eight accessible source cards and no clones; each links to a stable matching row. Episode 01 points to the featured question; Episodes 02–08 use native `details` controls in a compact ruled ledger. Status language remains draft/review/not-open, with em dashes in place of unpublished community percentages.

## Truth, trust, and accessibility

- Forecast views remain empty and truthfully labeled.
- The Yes/No preview remains browser-local, unsubmitted, unpublished, uncounted, and not a calibrated probability.
- Episode 01 retains November 2026 recording and January 2027 publishing timing.
- DEG and TMT attribution remains qualified. Verified written contributors retain moderation, rate-limit, identity, and anti-abuse language.
- The method keeps non-winner framing and append-only update intent.
- Focus, 44px targets, keyboard navigation, reduced motion, forced colors, no-JavaScript navigation, and overflow checks remain in the gate.

## Remaining manual review

Automated testing cannot certify aesthetic quality or WCAG conformance. Manual review should still cover real-font loading, 200% zoom, native disclosure behavior, screen-reader order, and optical balance on physical 1366×768 and 1440×900 displays.
