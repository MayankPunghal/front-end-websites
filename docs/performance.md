# Performance: before and after

Lighthouse 13.6.0, lab, simulated throttling, headless Chrome, performance + accessibility + best-practices + SEO. These are lab numbers, not field data.

- **Before:** the live site (`sunrooof.com`), 2026-11-07, `artifacts/perf-baseline/*.json`.
- **After:** `astro build` served by `astro preview` on localhost, `artifacts/perf-after/*.json`. Images still come from the same Shopify CDN as before; local serving removes the real origin's latency, so absolute LCP will be somewhat higher on a real host. The weight, request-count and TBT/CLS differences are structural and do not depend on this.

| Page | Device | Perf | A11y | BP | SEO | LCP | TBT | CLS | Weight | Requests |
|---|---|---|---|---|---|---|---|---|---|---|
| Home | mobile | 32 → **94** | 66 → 100 | 69 → 100 | 77 → 100 | 31.5 s → 2.9 s | 1905 → 0 ms | 0 → 0.003 | 7.2 → 0.5 MB | 263 → 17 |
| Home | desktop | 80 → **99** | 66 → 97 | 73 → 100 | 77 → 100 | 1.4 s → 1.0 s | 146 → 0 ms | 0 → 0.030 | 7.9 → 0.4 MB | 268 → 18 |
| Product (Modern White) | mobile | 22 → 70¹ | 63 → 100 | 73 → 100 | 54 → 100 | 5.1 s → 2.9 s | 1304 → 1348 ms¹ | 0.369 → 0 | 8.5 → 0.3 MB | 325 → 20 |
| Product (Modern White) | desktop | 51 → 72¹ | 63 → 100 | 77 → 100 | 54 → 100 | 2.6 s → 0.9 s | 211 → 821 ms¹ | 0.213 → 0.004 | 8.1 → 0.3 MB | 332 → 20 |
| Gallery | mobile | 31 → **91** | 78 → 100 | 73 → 100 | 85 → 100 | 8.9 s → 3.5 s | 2934 → 0 ms | 0.001 → 0 | 35.6 → 1.4 MB | 392 → 39 |
| Gallery | desktop | 54 → **99** | 78 → 100 | 69 → 100 | 85 → 100 | 14.9 s → 1.0 s | 193 → 0 ms | 0 → 0.001 | 35.6 → 1.1 MB | 388 → 47 |
| Collection (all) | mobile / desktop | n/a (no baseline) | 100 | 100 | 100 | 2.5 s / 0.9 s | 19 / 0 ms | 0.017 / 0 | 0.6 / 1.4 MB | – |

¹ **Open issue.** `/products/modern-white` alone reproduces a ~1.2–1.4 s "unattributable" main-thread task in the lab (3 of 3 runs). Other product pages measured TBT 0 / perf 92–94 (`modern-wooden`, `classical-white`, `arch-window-white`). Bisecting showed the task disappears when the room-render images are removed, and a byte-identical copy of the same HTML at a different path also measured 0, so it looks image-decode or lab-specific rather than script cost. Room renders are requested as progressive JPEG (`format=pjpg`) instead of WebP/AVIF because that removed the long task on the copy. Cause not found; treat that one number as unexplained.

## What changed, structurally
- Static HTML; no theme/app/analytics JS. Home ships GSAP + ScrollTrigger (≈ 45 KB gzip) loaded after idle; non-motion pages ship ≈ 1–2 KB of page script.
- Total CSS ≈ 11 KB gzip across the site; fonts self-hosted, Latin subsets only.
- Images: explicit `width`/`height`, CDN `width=` srcset (CDN serves WebP/AVIF by `Accept`), lazy-loaded below the fold, the LCP image eager with `fetchpriority=high`. This removes the old site's layout shift on product pages (CLS 0.37 → 0).
- Hero and exploded view are CSS/SVG driven; no video autoplay, no sliders loading every slide up front.
- No cookie banner or tracking scripts, because none are shipped.

## Remaining accessibility finding
Home desktop shows 97. The scroll-scrubbed tagline was fixed (unread words start at 0.62 opacity, ≈ 4.7:1 on paper; the invalid `aria-label` on `<p>` was replaced with a visually-hidden text span), which took mobile to 100. The remaining desktop item is axe measuring the captions of the horizontally pinned photo strip (`#bcb4a4`) against the page's paper colour because they sit off-screen at audit time; their real background is the night section, where the pair is 8.9:1. Treated as a lab false positive, not verified by an on-screen contrast check of every caption.
