// Shared motion layer. GSAP + ScrollTrigger load after first paint (dynamic import), never on the critical path.
import './select';
// Conventions: every animation lives inside a gsap.matchMedia() context, so reduced-motion users get none and
// resize / navigation tears everything down via mm.revert().
type GSAP = typeof import('gsap').gsap;
type ST = typeof import('gsap/ScrollTrigger').ScrollTrigger;
export interface Motion { gsap: GSAP; ScrollTrigger: ST; mm: ReturnType<GSAP['matchMedia']>; }

let ready: Promise<Motion> | null = null;
export const motion = (): Promise<Motion> =>
  (ready ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([g, s]) => {
    g.gsap.registerPlugin(s.ScrollTrigger);
    return { gsap: g.gsap, ScrollTrigger: s.ScrollTrigger, mm: g.gsap.matchMedia() };
  }));

export const EASE = 'power3.out'; // ≈ --ease-out cubic-bezier(.22,1,.36,1)

const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 200));

/** Split a text element into word spans (keeps accessible text via aria-label). */
export function splitWords(el: HTMLElement): HTMLElement[] {
  const text = el.textContent ?? '';
  el.textContent = '';
  const sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text.trim(); el.appendChild(sr); // aria-label is not allowed on <p>
  return text.trim().split(/\s+/).map(w => {
    const s = document.createElement('span');
    s.className = 'w'; s.setAttribute('aria-hidden', 'true'); s.textContent = w + ' ';
    el.appendChild(s); return s;
  });
}

async function boot() {
  const { gsap, ScrollTrigger, mm } = await motion();
  // <img data-plx> gets a clipping frame wrapped around it (and its data-reveal, so the two transforms don't fight).
  document.querySelectorAll<HTMLImageElement>('img[data-plx]').forEach(img => {
    const f = document.createElement('span'); f.className = 'plx-f'; f.setAttribute('data-plx', '');
    if (img.hasAttribute('data-reveal')) { f.setAttribute('data-reveal', ''); img.removeAttribute('data-reveal'); }
    img.removeAttribute('data-plx'); img.replaceWith(f); f.append(img);
  });
  const reveals = document.querySelectorAll<HTMLElement>('[data-reveal]');
  const words = document.querySelectorAll<HTMLElement>('[data-words]');

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // 1. Section reveals: rise 32px + fade, once, batched so a row staggers instead of N triggers.
    ScrollTrigger.batch(reveals, {
      start: 'top 90%', once: true,
      onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: EASE, stagger: 0.08, overwrite: true }),
    });

    // 2. Tagline: words go from muted to full as they cross the trigger line, one at a time.
    words.forEach(el => {
      const spans = splitWords(el);
      gsap.set(spans, { opacity: 0.62 }); // 0.62 keeps the unread words at 4.5:1 on paper
      gsap.to(spans, { opacity: 1, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.6 } });
    });

    // 3. Light parallax on large images: transform only.
    document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
      const amt = Number(el.dataset.parallax) || 8;
      gsap.fromTo(el, { yPercent: -amt }, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: el.parentElement!, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // 4–6 run in CSS (compositor-driven scroll timelines, see base.css) wherever the browser supports them; this JS is the fallback for Safari/Firefox.
    const native = CSS.supports('animation-timeline: view()');

    // 4. Framed image parallax with depth: the img is oversized inside its clipped frame, drifts ±14% and tilts through a shallow perspective as the frame crosses the viewport.
    document.querySelectorAll<HTMLElement>('[data-plx]').forEach(el => {
      const img = el.querySelector('img');
      if (!img || native) return;
      gsap.set(img, { scale: 1.45, transformPerspective: 900 });
      gsap.fromTo(img, { yPercent: -14, rotationX: 5 }, { yPercent: 14, rotationX: -5, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      // Hover zoom goes through GSAP too: it writes an inline "scale: none" that would beat any CSS scale rule.
      if (matchMedia('(hover: hover)').matches) {
        el.addEventListener('mouseenter', () => gsap.to(img, { scale: 1.58, duration: 0.9, ease: 'power3.out', overwrite: 'auto' }));
        el.addEventListener('mouseleave', () => gsap.to(img, { scale: 1.45, duration: 0.9, ease: 'power3.out', overwrite: 'auto' }));
      }
    });

    // 5. Unframed cut-outs float at their own speed (data-depth = px of travel each way), which layers them against the page.
    document.querySelectorAll<HTMLElement>('[data-depth]').forEach(el => {
      if (native) return;
      const d = Number(el.dataset.depth) || 60;
      gsap.fromTo(el, { y: d, rotationX: 6, transformPerspective: 900 }, { y: -d, rotationX: -6, ease: 'none', scrollTrigger: { trigger: el.parentElement!, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // 6. Hero: the photo lags behind the page, the headline lags more and fades, and on a mouse the layers shift against each other.
    const hero = document.querySelector<HTMLElement>('[data-hero]');
    if (hero) {
      const slides = hero.querySelectorAll('.hs'), imgs = hero.querySelectorAll('.hs__img'), copy = hero.querySelector<HTMLElement>('.hero__copy');
      if (!native) {
        gsap.set(slides, { scale: 1.34 });
        const out = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
        gsap.to(slides, { yPercent: 14, ease: 'none', scrollTrigger: out });
        if (copy) gsap.to(copy, { '--cy': 140, opacity: 0, ease: 'none', scrollTrigger: out });
      }
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
        const ix = gsap.quickTo(imgs, 'x', { duration: 1.2, ease: 'power3' }), iy = gsap.quickTo(imgs, 'y', { duration: 1.2, ease: 'power3' });
        const cx = gsap.quickTo(copy, '--cx', { duration: 1.2, ease: 'power3' });
        hero.addEventListener('pointermove', e => {
          const r = hero.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
          ix(-nx * 50); iy(-ny * 30); cx(nx * 30);
        });
      }
    }
  });

  // Reduced motion: make sure nothing is left hidden.
  mm.add('(prefers-reduced-motion: reduce)', () => { reveals.forEach(r => (r.style.opacity = '1')); });
  (window as any).__motionReady = true;
  requestAnimationFrame(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh());
}

if (document.querySelector('[data-reveal],[data-words],[data-parallax],[data-plx],[data-depth],[data-hero],[data-hero-scene],[data-pin]')) {
  idle(() => { boot().catch(() => document.documentElement.classList.remove('motion')); });
} else (window as any).__motionReady = true;
