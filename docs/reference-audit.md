# SUNROOOF reference audit (live site, Nov 2026)

Source: https://sunrooof.com. Shopify theme (theme asset path `/cdn/shop/t/24/`), but used as a **content site**: no cart or catalogue purchase flow in practice. All "buy/book" and enquiry paths end in lead forms. Redesign target = static content site, no Shopify.

Evidence lives in `artifacts/`:
- `reference-audit/desktop|mobile/*` – 74 routes × viewport + full-page (1440×1000 desktop, 390×844 @2x mobile); product option states in `desktop/*__opt_*.png`
- `reference-audit/contact-sheets/` – thumbnails of every route
- `reference-audit/route-manifest.json` – url, title, status, category, screenshots, failures, forms
- `content/*.json` – text, outline, image URLs, product JSON for 209 URLs (+4 policy pages)
- `perf-baseline/*.json` – Lighthouse (home, `/products/modern-white`, mobile + desktop)

Crawl caveats (honest limits):
- Local ISP DNS returns a wrong server for sunrooof.com. Crawler pins the real IP (23.227.38.32) via `--host-resolver-rules`. No TLS checks were disabled.
- Crawler blocks third-party analytics/pixel hosts to avoid stalls. Consequently, the "JS errors / failed requests" in `route-manifest.json` partly reflect that (`WOW is not defined`, `Failed to fetch`). Use Lighthouse for real third-party cost.
- 209 routes discovered (`sitemap.xml` en only + footer/nav links). 138 `blogs/delivered-sites/*` and 15 `blogs/news/*` share one template: first 12 of each were screenshotted, all were text-extracted.
- No form was submitted, no payment started.

## 1. Route inventory

| Group | Count | Notes |
|---|---|---|
| Home | 1 | |
| Collections | 11 | skylight families (minimalist, classical, modern), windows (french, arch, louvered), accessories, + Shopify-internal (`frontpage`, `all-collection`) |
| Products | 13 | 9 skylights/windows + 4 accessories (3 remotes + ...); each has 1–15 grid-size variants |
| Pages | 12 | about-us, our-team, clients, contact-us, faqs, gallery, book-a-site-visit, booking-form, sunwindow, sunwindow-pdp, custom-all-products (hidden/internal), terms-and-conditions |
| Size guides | 6 | per family, PDF + CAD downloads |
| Delivered sites (blog) | 138 | one per project: title + photo(s) |
| News (blog) | 15 | SEO articles about daylight/lighting |
| Policies | 4 | privacy, refund, shipping, terms-of-service (`/policies/*`, only reachable from footer) |
| Machine | 1 | `/agents.md` (Shopify agentic-commerce notice) |

Hebrew locale sitemaps (`/he/`) exist; ignored (no content differences observed in nav).

## 2. Business facts to preserve (verified from site)

- Brand: SUNROOOF, "a subsidiary of the MAGPPIE Group". Claims: 600+ customers, 800+ sites (home), 1000+ sites (book-a-site-visit page), 4+ years R&D, 12 scientists, patented optics. Copy is inconsistent on site count; use as written per page, flag to client.
- Products: skylight families Minimalist (wooden, bronze, titanium grey), Classical (white, wooden), Modern (white, wooden); windows French, Arch, Louvered (white); accessories: Magnetic Keypad (white, black), Tabletop Rotary Remote (black).
- Variants: single option "Frame Grid Size (in consoles)" e.g. 4X2, 1X2, 6X3. Also a visual "Frame finish" choice that links to sibling product pages (Pearl white ↔ Teak wood).
- Pricing is per grid variant (INR). Product pages state "Book with ₹50,000", minimum billing "4 consoles in serviceable cities, 12 consoles for non-serviceable", freight/installation/taxes at checkout, Razorpay EMI and an "Easy Payments Plan" (4 splits: 1st flat ₹50,000 to book → 50% before production → 25% frame dispatch → 25% light dispatch), 3-year guarantee, technical spec, installation video, "What if it doesn't fit", live project timeline with dated stages, size chart, PDF/CAD downloads.
- Contact: tel +91 98117 73388 (IN), +971 54 201 0504 (Dubai page). Experience centres: Delhi Flagship, Delhi West, Bengaluru Flagship, Mumbai, Surat, Mohali, Hyderabad, Coimbatore, Dubai.
- Social proof: celebrity/business "Trusted by" row (photos), logo strip (Danube, Reliance, J&J, Kohler, Good Earth), Good Design + iF award badges, architect list, 15+ Google reviews (named reviewers), 138 delivered sites, press ("The Word Got Out"), Instagram.
- **Lead form** (identical on contact-us, book-a-site-visit, booking-form, about-us, gallery, product pages): `POST https://ecf.cirkleinc.com/api/form-submit`, multipart. Fields: `which_best_describes_you`, `Lead_Type`, `How_many_spaces_are_you_considering`, `Project_Stage`, `Timeline_for_Installing_SUNROOOF`, `state`, `city`, `Name`, `mobile`, `email`, `Upload_File` (PNG/JPEG/PDF ≤10 MB), `specify_the_area_in_the_layout_where_you_want_the_sunroof`. Booking-form variant adds `Upload_File_2`, uses `City` as a select. This is the sales-team integration; the redesign keeps endpoint + field names untouched.

## 3. Visual design today

What's good (retain):
- **Photography is the asset.** Large, warm, credible installs (timber pergolas, courtyards, retail, hospitals). Retain and let it carry the pages.
- Brand voice and concept: "your sky, on a slider", "we were never meant to live under false ceilings". Keep.
- Isometric room renders on the dark "Skylight / Window" selector and product pages: already an isometric language we can extend.
- Real proof (names, awards, reviews, 138 projects).
- Before/after comparison of ordinary light vs SUNROOOF; time-of-day colour shift; app + sun-dial control.

What's weak (redesign):
- **Two unrelated themes.** Home = cream→amber gradient pages with serif display (ligature "gh"/"ig" glyphs look broken at small size), product pages = near-black with yellow CTAs. Banner in saturated yellow. No consistent system.
- Serif display font with decorative ligatures at section headings is hard to read; paired with DM Sans small grey body copy (≈12px in places) with low contrast on gradients.
- Home is ~20,000 px tall on desktop and ~9 mobile screens × 4000 px; 13+ sections with equal weight. Hero carousel with unreadable overlay text (white headline on bright photo) and a cookie bar covering the Before/After controls.
- Section patterns repeat: centred heading → carousel/grid of images. Carousels (owl.carousel) everywhere hide content.
- Nav: 5 links + MENU hamburger + Book a Call: nav wraps onto two lines on the product page (1440 px).
- Product page: dense accordion stack, "Easy Payment Plan" with truncated labels ("1st Split" clipped), timeline with clipped label at left, accessibility poor (a11y 63–66).
- Gallery is a flat list of 140 project links, not a portfolio. No filtering other than ALL/COMMERCIAL/RESIDENTIAL on home.
- Policies are unreachable from nav; only footer.

Remove: duplicate hidden pages (`custom-all-products`, `sunwindow-pdp`, `collections/frontpage`, `all-collection`, `agents.md`), repeat "Blogs" heading block, banner "Exclusive launch offer for first 100 customers" (stale; keep as optional notice only if client confirms).

## 4. Performance baseline (Lighthouse 13, lab, same machine, Nov 7 2026)

| Page | Form | Perf | LCP | TBT | CLS | Speed Index | Transfer | Requests |
|---|---|---|---|---|---|---|---|---|
| Home | mobile | **32** | **31.5 s** | 1,900 ms | 0 | 21.9 s | 6.8 MB | 263 |
| Home | desktop | 80 | 1.4 s | 150 ms | 0 | 5.5 s | 7.5 MB | 268 |
| Product (modern-white) | mobile | **22** | 5.1 s | 1,300 ms | **0.37** | 12.2 s | 8.1 MB | 325 |
| Product | desktop | 51 | 2.6 s | 210 ms | **0.21** | 3.9 s | 7.7 MB | 332 |

Other categories (home / product): accessibility 66 / 63, best-practices 73 / 77, SEO 77 / 54.

Findings:
- ~260–330 requests and 7–8 MB per page. Home pulls video (HLS + 1080p MP4, ~10 clips + YouTube embed) and ~117 images.
- Stack of legacy front-end libs: Bootstrap, owl.carousel, animate.css, WOW.js, tippy.js (unpkg), glightbox + Shopify theme JS modules; render-blocking CSS (9 stylesheets preloaded).
- Mobile LCP 31 s on throttled 4G: hero media / carousel not prioritised.
- CLS 0.2–0.4 on product pages.
- A console error `Identifier 'simpleRating' has already been declared` (script included twice) on most pages.
- Third-party: Shopify trackers, shop.app, razorpay widget, YouTube, Instagram, Google reviews.

## 5. Interaction notes

- Sticky header hides; MENU opens a full panel. Keep behaviour, improve contrast and nav wrapping.
- Home: Before/After handle, hero carousel, "Three reasons" horizontal slider, app/sun-dial slider, finishes tabs (Classical/Minimalist/Greens), gallery filter, scrolling word-reveal tagline (muted → full): good ideas, keep the tagline reveal.
- Product: finish swatches, grid-size chips, thumbnails gallery, accordions, EMI badge, timeline hover.
- FAQ: tabs ALL / CONSOLE / INSTALLATION + accordions.
- Forms: radio groups + state/city + file upload; client validation only via browser.

## 6. Decision summary

| Retain | Redesign | Remove |
|---|---|---|
| Photography, copy, product facts, prices per variant, proof, form fields & endpoint, routes (`/products/*`, `/collections/*`, `/pages/*`, `/policies/*`, `/blogs/*`) | One design system; home narrative; product pages as configurators with live visual preview; gallery as filterable archive; clients/proof; FAQ accordion; mobile compositions | Carousel plugins, WOW/animate.css/Bootstrap, duplicate forms per page (single form component), stale banner, internal-only routes |

Open questions for the client (not blocking): site count (600+/800+/1000+), whether the "first 100 customers" offer is live, cookie consent requirements, whether Razorpay EMI links must stay (we link out to the live product page for booking).
