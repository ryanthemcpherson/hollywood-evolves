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
| Forecast instrument felt confusing | The code-built instrument now presents Evidence → Three views → Outcome at once. Its tabs repeat those plain-language stages, name Guest, Community, and Research System, and state that Episode 01 is not open, unresolved, and has no published probability. The layered lens and signal character remains without unexplained gate or pseudo-terminal labels. |
| “Operating System” wrapped | The phrase has an explicit no-wrap element and responsive headline sizing. Browser checks require one client rect inside the viewport at 320, 390, 768, 1366, and 1440 pixels. |
| Future platform cards requested | A compact strip directly after the hero contains exactly three semantic placeholders: Spotify, Apple Podcasts, and YouTube. Each has a pending data slot, no link or URL, and shares one truthful January 2027 publication explanation. |
| Forecasts need moving questions | Eight unique linked question cards move through a controlled CSS 3D field, pause on hover/focus, become static under reduced motion, and offer truthful browser-local `YES / NO` calls. Native contracts remain below. |

## Visual and content audit

The lead visual is semantic HTML, CSS, and two small inline SVG drawings: a lens/aperture and a signal ribbon. Viewfinder marks and the Evidence → Three views → Outcome path are DOM/CSS. Its three-step tab interface keeps all core copy in HTML, highlights the relevant visual, supports arrow-key navigation, and adds fine-pointer perspective that resets on exit and is disabled for reduced motion. The complete explanation remains visible without JavaScript. It contains no probabilities, metrics, fake UI values, or generated imagery. The only content image is the supplied Ian portrait; the distribution placeholders use small controlled inline geometry.

The palette changes between ivory, warm paper, oxide red, cinema black, and restrained technical blue. No gradients, glass, rounded SaaS cards, vertical writing, filmstrip language, decorative rail, or detached footer are used.

Season One keeps all eight approved draft questions as an early question pool. Its discovery field has eight accessible source cards and no clones; each links to a stable matching row and offers a browser-local YES/NO call. The pool no longer implies one question per episode: the system brief specifies a structural, operating, and fast-resolving forecast for each episode, with one headline forecast. Status language remains draft/review/not-open, and no unpublished community percentages are shown.

## Truth, trust, and accessibility

- Forecast views remain empty and truthfully labeled.
- The Yes/No preview remains browser-local, unsubmitted, unpublished, uncounted, and not a calibrated probability.
- Episode 01 retains November 2026 recording and January 2027 publishing timing.
- DEG and TMT attribution remains qualified. Written contributors are described as LinkedIn-authenticated; verified-industry status remains a separate editorial decision, with moderation, rate-limit, identity, and anti-abuse language retained.
- The method keeps non-winner framing and append-only update intent.
- Focus, 44px targets, keyboard navigation, reduced motion, forced colors, no-JavaScript navigation, and overflow checks remain in the gate.

## Remaining manual review

Automated testing cannot certify aesthetic quality or WCAG conformance. Manual review should still cover real-font loading, 200% zoom, native disclosure behavior, screen-reader order, and optical balance on physical 1366×768 and 1440×900 displays.
# 2026-09-01 episode-cut recomposition

The supply-chain thumbnail, competing forecast columns, identical season rows, split Past/Present essays, and administrative method list were removed. The current composition uses a semantic three-act instrument, one decision ledger, a hierarchical question atlas, one portrait scene, and a four-stage protocol rail. See `docs/LIVE_ROAST_REBUILD.md` for test evidence and geometry.
