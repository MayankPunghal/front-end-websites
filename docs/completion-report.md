# Completion report: SUNROOOF rebuild

Nothing was deployed. No form was submitted, no payment or order initiated, no Shopify data touched. The only network traffic to `sunrooof.com` was read-only crawling for the audit and Lighthouse baseline.

## What was built
Static Astro 7 site in `sunroof/` (`npm run dev | build | preview`), 64 pages from `astro build`:

| Area | Routes |
|---|---|
| Home | `/` (pinned 06:00→18:00 day-curve hero, statement, compare slider, exploded device view, collections index, pinned project strip, app/control, trust, experience centres, lead form) |
| Catalogue | `/collections/all` + 7 collections; `/products/*` ×13 with configurator |
| Product configurator | grid-size chips → live price, frame width/length/depth, console count, redrawn plan SVG, size-matched room photo; finish swatches link sibling products; room-size → console-count calculator (60–70 % coverage, 0.48 m² per console); spec accordions; 6-step booking→handover process; JSON-LD |
| Content | `/pages/gallery` (137 photos, type/space/city filters, keyboard lightbox), `/pages/about-us`, `/pages/clients`, `/pages/faqs` (29 Q&A, filter, FAQPage JSON-LD), `/blogs/news` + 22 articles |
| Lead capture | `/pages/contact-us`, `/pages/book-a-site-visit` (pre-fills "Interested in: product, size" from the product page), lead form on home/about/clients/articles |
| Size guides | 6 pages with frame-dimension tables and the original PDF/CAD downloads |
| Legal | `/pages/terms-and-conditions`, `/policies/*` ×4, `404` |
| Redirects | `our-team`, `booking-form`, `sunwindow*`, `custom-all-products`, `frontpage`, `all-collection`, `/blogs/delivered-sites` and its 137 detail URLs → nearest page |

The lead form posts natively to the same endpoint with the same field names and option values as the live site (`https://ecf.cirkleinc.com/api/form-submit`), so the sales team's integration is unchanged. Client-side validation was exercised with an empty submit only.

## Decisions
- **Not a Shopify rebuild.** Owner confirmed the site is static content plus contact forms. No cart, checkout or accounts. Product pages end in "Book a site visit", plus a link to order on `sunrooof.com`.
- **Direction A "Daylight Atlas"** (warm paper, ink, brass; dark chapters for light) over B "Night Observatory"; reasons in `design-directions.md`; tokens in `design-system.md`.
- **Astro, no framework, vanilla TS.** The site has almost no client state.
- **Motion:** GSAP + ScrollTrigger only, dynamic import after idle, `matchMedia` for responsive + reduced motion. No Lenis (native scroll was enough), no Three.js/WebGL (the isometric exploded view is generated SVG, cheaper and sharper), no Remotion (no video deliverable).
- **Images stay on the Shopify CDN** via `?width=` srcsets; nothing was copied into the repo or sent to an external service.

## Tools
| Tool | Status |
|---|---|
| Playwright (crawl, QA, screenshots) | Installed, used |
| Lighthouse 13.6 (via `npx`) | Used, before and after |
| ai-design-skills `landing-page-design`, `anatomy`, `better-icons` skills | Installed in `sunroof/.claude/skills` (see `skills-lock.json`); consulted, not a source of shipped code |
| Anthropic `frontend-design` plugin | Present in the plugin cache; the Impeccable design hook was the check that actually ran on every written page |
| Better Icons MCP | Configured in `sunroof/.mcp.json` (written by hand because `npx better-icons setup` needs a TTY). **Not verified as connected**: not shown working in this session; icons on the site are inline SVG |
| Hairline | Evaluated, **not used**; dependency removed |
| OpenDesign (+ `od mcp install claude`) | **Not installed.** I did not get a working install on this Windows machine, so the design exploration was done in `design-directions.md` instead. Not claimed as connected |

## Measured performance (Lighthouse lab; details in `performance.md`)
Home mobile 32 → 94, desktop 80 → 99. LCP on home mobile 31.5 s → 2.9 s; page weight 7.2 MB → 0.5 MB; requests 263 → 17; TBT 1.9 s → 0. Product mobile CLS 0.37 → 0. Gallery mobile 31 → 91, desktop 54 → 99. Accessibility 63–78 → 97–100, best-practices 69–77 → 100, SEO 54–85 → 100.

**Not met / unexplained:** `/products/modern-white` still measures TBT ~1.2 s (perf 70 mobile, 72 desktop); three sibling product pages measure TBT 0 and 92–94. Cause not found. Local `astro preview` is faster than a real origin, so absolute LCP will be higher in production.

## Functional testing (`tools/qa/func.mjs`, all passing)
Configurator price/dimension/book-link updates; calculator output; book-page prefill; empty form submit blocked with inline errors; gallery filter (Commercial → 20); lightbox open, arrow keys, Esc; FAQ filter (29 → 6); reduced-motion home renders. No console page errors. Final screenshots for 18 routes × desktop and mobile, contact sheets and before/after comparisons are in `artifacts/final-audit/`; no route has horizontal overflow at 1440 or 390 px.

## Content integrity
Prices, variants, dimensions, specs, guarantee text, payment milestones, FAQs, reviews, team names and client names are from sunrooof.com. Only the booking amount (₹50,000) and the four milestones are shown for payment; split percentages were not published, so none are shown. Typos in source copy ("celling", "blonding") were corrected. The exploded view is labelled conceptual. "4+ years of R&D / 12 scientists" are SUNROOOF's own published claims and are marked as such on the About page. No testimonials or customers were invented.

## Known limitations and inconsistencies in the source
- Product-page claims were not independently verified (e.g. "50 W peak", "3-year guarantee, India & UAE").
- The room calculator can suggest more consoles than the largest listed grid (24) for big rooms; a site visit decides the final layout.
- Project city/space/type come from photo file names; 22 photos have no city and 75 no space, so they appear only under "All".
- Delivered-sites detail pages had no text beyond a title, photo and sometimes a video, so they redirect to the gallery; per-site videos were not embedded.
- No analytics or cookie banner is shipped. If the business wants analytics, a consent banner must be added with it.
- Colour of the finish swatches is approximate (no swatch assets existed).
- The remaining desktop contrast flag on home is judged a lab false positive but was not checked caption by caption.
- Pinned scroll scenes are verified by scroll-position screenshots, not by manual device testing.

## Where things are
`docs/` (this report, `performance.md`, `design-system.md`, `design-directions.md`, `reference-audit.md`, `studio-grade-frontend-skill-notes.md`) · `artifacts/reference-audit` (before), `artifacts/final-audit` (after), `artifacts/perf-baseline` and `perf-after` · `tools/` (crawl, data build, QA) · `src/data/*.json` (extracted content).

## Round 2: home page rebuilt to match the live site's look and motion
Owner feedback: the first design was not close enough to sunrooof.com. The home page and shared chrome were rebuilt in the live site's visual language (white/beige/black, Original + DM Sans from sunrooof.com, header with centred nav, black "Book a call", Menu), section order as on the live home.

- **Kept from live, rebuilt without Shopify theme JS/Swiper/jQuery/WOW:** before/after hero slideshow, About, "Three reasons" video carousel, health/wellness sun-gradient section with cursor-follower dot, 3×3 mosaic that scales ×3 into the before/after (same technique as live), tabs (applications, designs, real spaces), manifesto word scrub, sky slider, trusted people, marquee, reviews, video testimonials (link out to YouTube), experience centres, reels, founder's note, blogs, contact, FAQ.
- **Three videos:** the three "Three reasons" clips were saved from sunrooof.com, re-encoded (frame-interpolated to 60 fps with ffmpeg `minterpolate`, short GOP) and scrub with scroll via a damped `currentTime` (`src/scripts/home.ts`). Files: `public/video/reason{1,2,3}.mp4` (≈10 MB total, loaded only when the section is near). Interpolated frames are synthesised; fast motion may show artefacts.
- **Exploded device:** the manual-slider SVG was removed. `src/scripts/device.ts` is a three.js scene (loaded only near the viewport): camera starts below looking up at a lit sky panel, orbits up, and the five layers (frame, diffuser, lenses, LED board, housing) separate on scroll. Labelled conceptual. Falls back to a still image without WebGL or with reduced motion.
- **Lead form:** "Book a call" opens a one-question-at-a-time dialog (`LeadModal.astro`), same endpoint/field names as the live form, posted to a hidden iframe so the page never reloads. Not test-submitted. The full-page forms on contact/book pages are unchanged.
- **Lighthouse (lab, local preview) new home:** mobile perf 87 / desktop 97, best-practices and SEO 100, TBT 10 ms / 0 ms, CLS ≈ 0; desktop a11y 100; mobile a11y 95 before a fix to the unnamed menu button (fixed afterwards, not re-measured). Desktop transfers ≈ 9.7 MB because the three videos preload near the section.
- **threeui (MengTo):** reviewed; it is a React component catalogue and this site has no React, so nothing was imported. **Hairline:** evaluated earlier, not used, removed. **anatomy skill:** informed the earlier isometric SVG, which is now replaced by the WebGL scene.
- **Not yet restyled to match live:** inner pages (products, gallery, FAQs, etc.) inherit the new colours and fonts but keep the earlier layouts; the footer is the earlier design. Not verified on a real phone or with `prefers-reduced-motion` in a browser.

### Round 2 follow-ups
- **3D scene reworked:** `device.ts` now starts under a ceiling of six lit panels; the camera moves to one, the other five slide out of frame, and that panel separates into six layers (housing, heat-sink fins, back plate, LED strip board, lens plate, diffuser) in the order shown in SUNROOOF's own exploded-view video. Concept model, labelled as such; part shapes are approximations, not CAD.
- **Three-reasons videos:** cards are now a full 16:9 frame (no cropping); the third clip, which is 4:3, is letterboxed.
- **Loader:** the logo wipes in left to right on the first page load of a session and clears when the page has loaded (minimum 1.5 s, maximum 4 s).
- **Inner pages:** products, collections, gallery, FAQs, contact and book-a-visit use a dark theme like the live site (`.tone-night` tokens in `base.css`); the header stays white. Clients, about, journal and legal pages stay light. Page headings are smaller and left-aligned like live.
- **Not verified:** layouts of the product, gallery and FAQ pages are restyled by colour and type only, not rebuilt (e.g. live's image carousel with arrows on product pages, FAQ tabs); mobile views of the inner pages were not re-checked.

### Round 2 follow-ups (images, dropdowns, filters)
- **Missing images fixed at the root.** Every remote image (≈620 from sunrooof.com / cdn.shopify.com) is mirrored to `public/img/` as WebP at up to five widths by `npm run images` (`tools/img/mirror.mjs`; manifest in `src/data/img-manifest.json`). `Base.astro` rewrites image URLs in rendered HTML to the local files (`src/lib/img.ts`), so pages no longer depend on the CDN. Only `og:image` meta tags still point at the live CDN. Crawl of 208 routes: 0 broken images. `public/img` is ≈150 MB.
- **Lazy loading with placeholder.** Images below the fold are `loading="lazy"`; each carries a 20 px blurred copy as its background and sharpens in when the full file arrives. Transparent logos skip the placeholder.
- **Themed dropdowns.** `src/scripts/select.ts` replaces the native popup (state selects, gallery filters) with a keyboard-accessible listbox; the real `<select>` stays for form posting and validation.
- **Animated filters.** `src/scripts/filter.ts`: current items fade out, new set staggers in (gallery filters, home spaces/application/design tabs); instant under reduced motion.
- New images added later: run `npm run images`, then rebuild.
- **Dropdown** is now a searchable combobox (type to filter, arrows/Enter to pick); in the lead popup the list opens inside the dialog so it never overflows.
- **Header/menu:** header turns dark with white text on dark pages and whenever the menu is open (button reads "Close"); the menu is a two-column overlay sized to the viewport (links left, contact right), no scrolling on desktop or phone.
- Note: in the user's Chrome, https://sunrooof.com showed ERR_CERT_DATE_INVALID. Cause not verified (could be the live site's certificate, this PC's clock, or the local DNS interception seen on this machine); this build self-hosts all images and fonts, so it does not depend on that host.

### Round 3: parity with the live site (before any improvements)
- **Shared pieces now match sunrooof.com:** sunset-gradient footer (links, legal name, address, GST, big logo, back to top); "Get in Touch with Us" inline form (selects as underlined themed dropdowns, posted in the background to the same endpoint); "Crystal Clear. But I have a question." FAQ block.
- **Pages rebuilt to match:** Contact (heading, intro, form, globe + offices), About (hero, stats with count-up, scroll-scrubbed zooming video, team scroller, workspace), Clients (banner, people grid, brands grid, architects scroller, reviews, form, FAQ), Products (alphabetical 3-column grid with "From ₹ x to ₹ y" and Book now), FAQs (tabs + accordion), Gallery heading. The separate Book-a-site-visit page is gone (redirects to Contact); every "Book a call" opens the popup.
- **About video** is a 30 s silent loop (live is a 104 s, 10 MB clip with sound) to keep the page light.
- **Still different from live:** product detail pages (live has a long story: launch-offer bar, light comparison, project timeline, trusted-by, reviews, three reasons, app control, patent, related); gallery tabs (Gallery / Delivered sites / Testimonials) and masonry; blog and policy pages not yet compared; header is white on every page except while the menu is open (same as live).

## Parity pass: collections, PDP trust, reviews, reasons
- Family collections (minimalist, classical, modern, french-window, arch-window, louvered-window) now use `CollectionLanding.astro` (banner, details, before/after slider, trusted people/brands/awards, reviews carousel, personalise video, wellness, similar products, FAQ), data in `src/data/collection-pages.json`. `/collections/all` and `/collections/accessories` keep the product grid.
- Not copied: the Commercial/Residential sub-tabs on the before/after slider (only one image pair per family was published; no invented content) and the pinned scroll on the video.
- Shared `TrustBlock.astro` (PDP + collections), `ReviewsCarousel.astro`, `ReasonsCarousel.astro`, `hscroll.ts` (clients architects row scrubs sideways).

## Finish pass (before the improvement round)
- Product page: reasons carousel, hero arrows, pricing/catalogue pills, EMI text chips, size-chart dialog, icon bullets, 6-stage payment plan. Razorpay logos not copied; the pricing pill opens the payment plan (live plays a video).
- Reviews carousel: quote mark is per slide and moves with its card.
- About: sticky heading is bounded to the intro rows, so the zooming video never overlaps it (checked at 1440×812, scroll 600–2300).
- Menu: circular reveal from the burger, staggered links, bars morph to an X, label slides Menu/Close, reverse on close; no default underline on the current page; hover underline spans the whole word and also covers phone, email, Instagram, YouTube. Reduced motion = no animation.
- Touch targets: burger, review arrows, FAQ links, catalogue link, carousel dots now ≥ 44px on coarse pointers.
- Checks: no horizontal overflow at 390 / 1440 on 14 routes; `tools/qa/broken-images.mjs`: 208 routes, 0 broken; lead popup opens focused, fits at 390 and 1440, closes on Esc.
- Hook ignore: `layout-transition` on ReasonsCarousel (8px dot width).

## Improvement round (after parity)
- **Header:** nav links are truly centred (grid 1fr auto 1fr, actions grouped right). On product pages the header scrolls away like the live site (`staticHeader` on `Base`).
- **Products page:** `/collections` is now the "SUNROOOF Atelier" page as on the live site: category filter (All / Ceiling / Window / Accessories) with hairline isometric icons that draw in and glow when active, square image tiles, no prices. Nav "Products" points here. `/collections/all` (the live price grid) is kept.
- **Prices:** all figures come from the live site's own product data (live `/collections/all` tiles and product pages show "From ₹ x to ₹ y", "Book with ₹50,000"). The live Atelier and family collection pages show no prices, so ours no longer do either.
- **Product page:** rebuilt to match the live layout (square gallery with arrows and 118px thumbnails, 14px type, yellow kicker, pills, price line, EMI boxes, white chips, Size Chart pill, yellow bullets, 6-stage plan with split cards, accordions, yellow/white CTAs). Slide 1 of the reasons carousel uses the family's own video as live does; related shows three tiles without prices; the trusted-people block is a two-row slider with arrows starting at Mukesh Ambani. Our earlier product page is kept unchanged at `/alt/products/<handle>` (noindex).
- **Hairline isometric console:** new `HairlineConsole.astro` on skylight/window product pages: strokes draw in, then the five layers lift apart on scroll (static and fully drawn with reduced motion). Replaces the unused `Exploded.astro`.
- **Known gaps:** Razorpay logo not copied (text label); live "Installation (Video)" accordion and the pricing video are not copied; See-the-Difference has no Residential/Commercial toggle (one image pair); live product and collection pages show a three-slide Neha Kapoor review loop, ours uses the 15 real reviews; accessories in our data are 3 products (live lists 6 incl. Gold/Chrome variants).

## Home page round (after improvement round)
- Parallax: framed images use a 1.45× oversize, ±14% drift and ±5° tilt; hero lags on scroll and shifts with the pointer; isometric rooms float at opposite depths. Not applied to video thumbnails/reels (it cropped them), nor to portraits (cropped foreheads).
- "Trusted by Those Who Inspire" is an endless right-to-left ribbon (paused on hover); client logos are in colour.
- Reels: play button bottom-left. Vision & Stories now has the live site's Founder's Note / Instagram tabs. The Instagram strip drifts on its own and reels autoplay muted while on screen. Its 10 posts (7 images, 3 reels) were saved once from the client's own live feed into `public/ig/` + `src/data/instagram.json` — a static snapshot, not a live feed; refresh by re-running `artifacts/_tmp/ig2.mjs` + `ig3.mjs`. Posts link to the Instagram profile (permalinks were not exposed).
- Blogs: split slider as on the live site (text slides in from the right, photo wipe, pointer shift, 7 s autoplay, arrows). Author line omitted (not in our data).

## Scroll smoothness
- Parallax (framed images, hero, floating cut-outs) now runs as CSS scroll-driven animations (`animation-timeline: view()` / a named hero timeline) in `src/styles/base.css`: compositor-driven, no JS per frame, so it cannot lag native scrolling. GSAP stays as the fallback only where the browser lacks support (Safari/Firefox); `motion.ts` skips those blocks when `CSS.supports('animation-timeline: view()')`.
- `animation-timeline` is written as `var(--tl, view())` on purpose: the CSS minifier otherwise folds it into the `animation` shorthand, which Chrome rejected, silently killing parallax in the production build.
- Frames use `overflow: clip` (not `hidden`) so the page stays the timeline scroller.
- Not measured on real hardware: headless Chrome here showed no dropped frames before or after (p99 16.8 ms), so the improvement on a real GPU/display is untested.

## Gallery wall + premium scroll
- Gallery photo tab is a fixed-height window (≥ 40rem, motion allowed): columns 1 and 3 stream up, column 2 streams down, 55 px/s, each in one direction forever (photos rendered twice per column for a seamless loop; copies are aria-hidden and skipped by the lightbox). Page scroll or hovering the wall eases it to a stop. Mobile and reduced-motion keep the static masonry. Trade-off: the photos are no longer browsed by page scroll on desktop; "Delivered Sites" keeps the full grid.
- Lenis (`lenis` 1.3.27, `src/scripts/smooth.ts`, loaded from Base) gives inertial wheel scrolling (lerp 0.075). Mouse/trackpad only; touch and reduced-motion stay native; dialogs, the menu overlay, selects and textareas are excluded. Measured in headless Chrome: a 600 px wheel tick eases to its target over ~1 s with a decelerating curve.
- ElevenLabs: it is an audio/voice service with no video upscaler, and none is connected here. The three product-reason videos (`public/video/reason1-3.mp4`, 1152 px wide, 1.3–2.5 Mbps) are the likely "three videos"; true 2K needs the client's higher-resolution masters. Not changed.
- Gallery revision: the photo tab is the full-length masonry again (the page scrolls through every photo like a normal page); each column is an endless ribbon (3 copies, wrapped by one copy's height) that streams up/down/up while idle and freezes on page scroll or hover. This replaces the fixed-height window described above, which ended with an empty gap.
- Delivered Sites: each site now shows its name and outlined area / city / design chips under the photo (design without the colour suffix), photos on a uniform 400:440 frame, as on the live site.
- Smoother: Lenis lerp 0.06 / wheel x0.85; gallery ribbons are now Web Animations (compositor-driven), with the playback rate eased to 0 on scroll/hover instead of per-frame style writes.

## Reason videos upscaled (2x)
- `public/video/reason1-3.mp4` replaced with 2x Real-ESRGAN (Video2X 6.4.0, `realesr-animevideov3`) upscales: 2304×1296 (1 and 2), 2304×1780 (3). Already 60 fps, so no interpolation. Re-encoded x264 crf 26, faststart, no audio.
- Size: 3.3 / 6.2 / 13.5 MB (was 1.9 / 3.2 / 4.9 MB). Slides use `preload="none"`, so they only load when played.
- Originals kept in `artifacts/upscaled/originals/`. The upscale is AI-sharpened, not true new detail.
- The hairline vector-scene replacement for videos 2 and 3 was tried and dropped at the client's request.

## Loader matches the original
- The first-visit loader is now the original site's own Lottie (`public/brand/loader.json`, played with `lottie-web` light build, `src/scripts/loader.ts`) on #121212: the amber wordmark sweeps in and brightens toward white. It replaces the black-on-white logo wipe.
- Only fetched when the loader shows (first visit per session). Held ~3.8 s so the word completes; reduced-motion shows the final frame.
- Reason-video slides are capped at 66rem wide so the 2x video is downscaled more (sharper).

## Experimental home #1: `/immersive`
- New page `src/pages/immersive.astro`: scroll from a bottom-up view of a timber SUNROOOF ceiling, push in, cross to a close-up, rush into a white window, bloom, land in the room. The room then shows a draggable before/after slider (a real range input, keyboard-accessible) with Courtyard / Saree store / Café tabs. Replaces the Before/After buttons on this page.
- Driven by one scroll value (`src/scripts/immersive.ts`, sticky pin + eased rAF, no GSAP). Reduced motion: no dive, room + slider shown directly.
- Same content as the main home: sections were moved into `src/components/HomeBody.astro`, data into `src/lib/homeData.ts`, section CSS into `src/styles/home.css`; `/` and `/immersive` share them. `/immersive` adds `src/styles/immersive.css` (chapter numbers, rounded windows that open as they scroll in, bigger display type, scroll progress bar).
- `/` has a "Try the immersive home" pill in the hero; `/immersive` has a link back at the bottom.
- Future variants: add another page that imports `HomeBody` and its own hero/skin.
