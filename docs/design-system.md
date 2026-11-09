# Design system: Daylight Atlas

Source of truth: `src/styles/tokens.css` (tokens) and `src/styles/base.css` (reset, buttons, forms, utilities). Direction rationale: `design-directions.md`.

## Idea
Warm paper, ink type, one brass accent. Chapters flip to a near-black **night** theme (`.night`) so the product, which is light, shows against dark. Photography and the product renders do the decorating; type is large and calm.

## Colour
| Token | Value | Use |
|---|---|---|
| `--paper` / `-2` / `-3` | #f3eee4 / #e9e2d3 / #ddd4c1 | page, panels, image placeholders |
| `--ink` / `-2` / `-3` | #15120e / #3a342b / #6b6355 | headings, body (10.9:1), captions (4.9:1) |
| `--night` / `-2` / `-3` | #0e0d0b / #1a1814 / #2a2620 | dark chapters |
| `--on-night` / `-2` | #f3eee4 / #bcb4a4 | text on night (8.9:1) |
| `--brass` | #d9902b | accent on night (7.2:1) |
| `--brass-ink` | #8a5a12 | accent text on paper (5.4:1) |
| `--sun` | #ffc857 | light-source highlight, focus fill |
| `--danger` | #a7321a | form errors |

Rule: brass text on paper must be `--brass-ink`; `--brass`/`--sun` only on night or as fills.

## Type
- Display: Instrument Serif (self-hosted, `@fontsource`). Body: Manrope Variable (self-hosted). Latin subsets only load via `unicode-range`.
- Fluid scale: `--t-micro` 12px → `--t-h1` up to 152px (`clamp`). Body 16px/1.6. Headings `line-height ≈ 0.95–1.15`.
- Numerals in prices and specs use `.num` (tabular).

## Space, layout, shape
- 4px-based scale `--s-1…--s-11`; section rhythm `--section` (80–176px fluid).
- `.wrap`: max 1440px, fluid gutter `clamp(1rem, 0.5rem + 2.4vw, 2.5rem)`.
- Radii: 2px (images), 6px, pill (buttons, chips). No cards-in-cards; hairlines (`--line`) separate content.

## Motion
- Easing `--ease-out: cubic-bezier(.22,1,.36,1)`; durations 160 / 320 / 640 / 1100 ms.
- GSAP + ScrollTrigger only, loaded by dynamic import after idle (`src/scripts/motion.ts`), never on pages without `[data-reveal|data-words|data-parallax|data-hero-scene|data-pin]`.
- Everything is inside `gsap.matchMedia()`: `(prefers-reduced-motion: no-preference)` gets the choreography, otherwise content is final-state and static. Reveal initial state exists only under `html.motion`, which is removed after 4 s if JS fails.
- Animated properties: `transform`, `opacity`, CSS variables (colour temperature/brightness). No layout properties. Native scroll (no Lenis, no scroll hijack).

## Components
`Header` (sticky, hide-on-scroll, night variant, full-panel mobile menu) · `Footer` · `PageHead` · `Pic` (CDN `srcset`, explicit w/h) · `CollectionView` (filter tabs, hover image swap, comparison table) · `Exploded` (generated SVG, conceptual) · `LeadForm` (chip radios, native POST) · product configurator (`products/[handle].astro`) · gallery lightbox (native `<dialog>`) · FAQ accordion (`<details>`).

## Accessibility (WCAG 2.2 AA targets)
Skip link; landmarks; visible focus (brass-ink outline); 44px minimum targets (`min-height: 2.75rem`); `aria-live` on price/count readouts; `<details>`/`<dialog>` for native keyboard behaviour; every form field labelled with inline errors (`role=alert`); reduced-motion honoured; tables are scrollable regions with `tabindex=0`.
