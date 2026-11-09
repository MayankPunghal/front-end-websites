# Studio-grade frontend: reusable notes

Discoveries from the SUNROOOF rebuild that apply to other marketing/product sites. Kept here, not in any CLAUDE.md.

## Process
1. **Audit before design.** Crawl sitemap + links, shoot desktop and mobile with Playwright, write a route manifest, extract copy/prices/specs to JSON. Design decisions and honesty checks (what is real vs. conceptual) come from this data, not memory.
2. **Ask what the site really is.** The brief said "Shopify"; the owner meant "a static brochure with lead forms". Cart/checkout/account flows would have been over-engineering. One question early saved a large wrong build.
3. **Two directions, pick one, write the tokens.** A one-page comparison (`design-directions.md`) and a tokens file made later pages consistent without rework.
4. **Data pipeline over hand-copying.** `crawl → artifacts → build-data.mjs → src/data/*.json → Astro`. Re-runnable when the source changes; product pages, tables, JSON-LD and the configurator all read the same JSON.

## Motion
- Load GSAP by dynamic import after idle; skip it on pages with no motion hooks. One `gsap.matchMedia()` carries both responsive and `prefers-reduced-motion` logic.
- Reveal start states (`opacity: 0`) must live under a `html.motion` class set by an inline script, with a timer that removes it if JS never boots. Otherwise a JS failure hides the page.
- Drive scenes with **CSS variables** (colour temperature, brightness, explode distance) and let GSAP tween the variable. One timeline, transform/opacity/variables only, no layout.
- Pinned sections: verify with scroll-position screenshots. Full-page screenshots of pinned sections are unreliable.
- Native scroll was enough. Lenis was not added because nothing needed it.
- Word-by-word scrub: do not use `aria-label` on `<p>` (axe: aria-prohibited-attr); put the full text in a visually hidden span and `aria-hidden` the words. Keep unread-word opacity ≥ ~0.62 on paper to hold 4.5:1.

## Images and performance
- Shopify CDN accepts `?width=N`; build `srcset` from it and set `width`/`height` to kill CLS. Parse intrinsic sizes once (`project-sizes.mjs`).
- Large "render" PNG-origin images served as WebP/AVIF produced a ~1.3 s lab long task on one product page; `&format=pjpg` removed it on the copy that was tested. Bisect by publishing edited copies of the built HTML into `dist/` and running Lighthouse on each (remove thumbs, remove scripts, remove sections, remove images). It found the culprit in four short runs. Clean the copies afterwards.
- Run Lighthouse against `astro build` + `astro preview`, never the dev server. Compare against a baseline taken the same way and say it is lab data.
- Gallery of 137 photos at 1.1–1.4 MB initial weight: CSS `columns` masonry + `loading=lazy` + width-matched `srcset` + only the first four images eager.

## Accessibility
- Native `<dialog>` for the lightbox (focus trap, Esc, backdrop for free), `<details>` for accordions, `role=radiogroup` + real radio inputs for chips (visually hidden, `:focus-visible` on the sibling span).
- 44 px (`2.75rem`) minimum targets on chips, buttons, thumbs, swatches.
- Contrast pairs are named in tokens (`--brass-ink` for text on paper, `--brass` only on night). Check pinned/off-screen captions manually; axe measures them against the wrong background.

## Honesty rules that paid off
- Label generated art as conceptual in the caption (`Exploded.astro`).
- Derive filters (city/space/type) from file names only when the pattern is reliable; leave the rest in "All".
- Do not invent testimonials, specs, prices, prices per split or percentages: where the source gave only the booking amount and four milestones, the page shows exactly that.
- Never test-submit a real lead form. Validate client-side behaviour with an empty submit and keep the production endpoint contract (field names, endpoint, method) byte-identical.

## Environment gotchas (Windows + Git Bash)
- Poisoned local DNS: pin the host with Chrome `--host-resolver-rules='MAP host IP'` (do not disable TLS checks).
- Git Bash rewrites arguments that start with `/`: `export MSYS_NO_PATHCONV=1` for scripts that take routes.
- Heredocs strip backslashes in regexes; write regex-heavy code with the editor tool.
- Mobile nav in crawlers: give it enough timeout and block third-party analytics; screenshot with the right option shape (`{ viewport }` for desktop, `isMobile` + `deviceScaleFactor` for mobile).
