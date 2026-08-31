---
version: alpha
name: Hollywood Evolves
description: Editorial foresight for the technologies changing Hollywood.
colors:
  primary: "#171715"
  secondary: "#625D55"
  tertiary: "#A8342A"
  neutral: "#F3EFE6"
  paper-alt: "#E5DED1"
  rule: "#AAA398"
  signal: "#78A9B5"
  white: "#FAF7F0"
typography:
  display:
    fontFamily: Newsreader
    fontSize: 4.875rem
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  body:
    fontFamily: DM Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: DM Mono
    fontSize: 0.625rem
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  none: 0px
spacing:
  xs: 8px
  sm: 16px
  md: 24px
  lg: 48px
  xl: 96px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: 14px
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
  editorial-card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: 24px
  editorial-card-secondary:
    backgroundColor: "{colors.paper-alt}"
    textColor: "{colors.primary}"
    rounded: "{rounded.none}"
    padding: 24px
  divider:
    backgroundColor: "{colors.rule}"
    height: 1px
  evidence-signal:
    backgroundColor: "{colors.signal}"
    height: 1px
---

## Overview

Hollywood Evolves is an editorial podcast and public forecast ledger. Its identity combines journalistic authority with the visual language of measurement instruments: restrained, evidence-led, and built to age well. The canonical implementation files live in `public/brand/`; this document explains how to use them.

The public name is always **Hollywood Evolves**. The approved descriptor is **A podcast and public forecast ledger**. Do not redraw the mark or substitute a text-only lockup when the canonical wordmark is available.

## Colors

- **Ink (#171715):** primary text, dark fields, and the monogram ground.
- **Paper (#F3EFE6):** default page and social-card background.
- **Signal red (#A8342A):** the sole high-emphasis action and editorial marker.
- **Signal blue (#78A9B5):** diagrams and evidence-flow accents, never the primary action.
- **Paper alt (#E5DED1):** secondary editorial fields.
- **Muted (#625D55) and rule (#AAA398):** supporting text and dividers.
- **White (#FAF7F0):** text on ink or signal red.

Use the CSS custom properties in `/brand/brand.css`; do not retype these values in page-level stylesheets.

## Typography

Newsreader carries editorial display copy. DM Sans carries body and interface copy. DM Mono is reserved for evidence labels, statuses, and compact metadata. System fallbacks are required so the site remains readable if hosted fonts fail.

Headlines use sentence case. Interface labels may use uppercase with restrained tracking. Avoid novelty fonts, faux typewriter styling, and all-caps body copy.

## Layout

Use a twelve-column editorial grid on wide screens and a single reading column on narrow screens. Composition is square-edged and ruled rather than card-heavy. Space should separate ideas before color or decoration does.

## Shapes

Corners remain square. Fine rules, instrument geometry, and measured offsets are preferred over soft containers or decorative gradients.

## Components

The approved wordmark is `/brand/wordmark.svg`; use it on light surfaces with the accessible name “Hollywood Evolves.” Use `/brand/wordmark-inverse.svg` on ink or signal-red surfaces so the mark retains internal contrast; never synthesize an inverse mark with a CSS filter. The approved monogram is `/brand/monogram.svg` and is the source for favicons and application icons. The approved social preview is `/brand/social-card.png` at 1200×630. The SVG source is kept beside it.

Primary actions use signal red on white. A page should normally expose one primary action at a time. Forecast and status components must distinguish known, unknown, and unresolved states with text, not color alone.

## Do's and Don'ts

- Do reference the shared brand assets and tokens directly.
- Do keep Open Graph and Twitter metadata aligned with the canonical social card.
- Do preserve generous contrast and visible focus treatment.
- Don't create page-specific logos, palettes, taglines, or social cards.
- Don't use gradients, rounded product-dashboard cards, or decorative effects that weaken the editorial system.
- Don't imply partnerships, publication status, verification, or forecast certainty through branding.
