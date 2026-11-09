# Design directions (Phase 3)

Brief: premium architectural lighting product. Real assets: strong install photography (137 projects), isometric room renders, an exploded-layers render, warm timber/white palettes. Site today has two unrelated themes (cream→amber home, black product pages) and a decorative serif that hurts legibility.

## A. Daylight Atlas (chosen)
Warm paper canvas, ink type, one brass accent. Editorial grid, huge calm serif headlines, photography as full-bleed set pieces. A single **night/day device**: some chapters flip to a near-black "night room" and the light literally comes on as you scroll (the product is a sky you can dial). Technical storytelling through hairline isometric line drawings (conceptual, labelled).
- Pros: matches luxury interiors + architecture; photography reads best on paper-white; one system for home + product + forms; cheap to render (CSS/SVG), fast on mobile; dark chapters give drama without making the whole site heavy-dark.
- Cons: needs discipline so it doesn't become "just a beige template". Mitigated by scale contrast, asymmetric grids and the night/day device.

## B. Night Observatory
All-dark, light-cone/WebGL hero, glowing UI.
- Pros: dramatic; the product *is* light.
- Cons: the photography (bright white skylights on white ceilings) loses punch on black; heavy GPU/mobile cost; reads like the generic "dark SaaS hero"; accessibility (low contrast small text); matches neither interiors nor trust.

## Decision
A. B's strength survives as the night chapters inside A.

| Criterion | A | B |
|---|---|---|
| Product positioning (architectural, trust) | ● | ◐ |
| Brand fit (SUNROOOF's existing warm/timber identity) | ● | ◐ |
| Photography | ● | ○ |
| Usability / forms / specs | ● | ◐ |
| Performance / mobile | ● | ○ |

## Signature moves
1. **Sky on a dial** – hero scrubs 06:00 → 12:00 → 18:00: ceiling colour temperature + brightness animate (CSS variables driven by GSAP ScrollTrigger). Facts: site says colour/brightness change like the sky.
2. **Night room → lit room** – before/after as a wipe (clip-path) bound to scroll, then to a drag handle.
3. **Exploded layers** – hand-drawn isometric SVG of the layered console (conceptual; labelled), parts separate on scroll.
4. **Product configurator** – grid-size chips redraw an isometric plan (cols × rows of consoles) and update price / frame dimensions from real variant data.
5. **Word-by-word tagline reveal** (kept from the original site).
