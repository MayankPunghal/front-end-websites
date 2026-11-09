// Home-page interactions. Plain DOM for tabs, hero and compare; GSAP (shared loader) only for scroll-driven scenes.
import { motion } from './motion';
import { swap } from './filter';

/** CSS-style cubic-bezier(x1,y1,x2,y2) easing, solved with Newton + bisection. */
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t, Y = (t: number) => ((ay * t + by) * t + cy) * t, dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-5) return Y(t); const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    while (hi - lo > 1e-5) { const e = X(t); if (e < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
};
const $ = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

/* hero: before/after toggle + slides */
(() => {
  const hero = $('[data-hero]'); if (!hero) return;
  const slides = $$('[data-slide]', hero); let i = 0;
  hero.dataset.state = 'after';
  const go = (n: number) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => { if (k === i) { s.setAttribute('data-on', ''); s.removeAttribute('aria-hidden'); } else { s.removeAttribute('data-on'); s.setAttribute('aria-hidden', 'true'); } });
  };
  $('[data-prev]', hero)!.addEventListener('click', () => go(i - 1));
  $('[data-next]', hero)!.addEventListener('click', () => go(i + 1));
  $$('[data-state]', hero).filter(b => b.tagName === 'BUTTON').forEach(b => b.addEventListener('click', () => {
    hero.dataset.state = b.dataset.state!;
    $$('[data-state]', hero).filter(x => x.tagName === 'BUTTON').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
})();

/* tabs: spaces filter, applications, designs */
const tabs = (root: string, attr: string, apply: (v: string) => void) => {
  const el = $(root); if (!el) return;
  const btns = $$(`[${attr}]`, el).filter(b => b.tagName === 'BUTTON');
  btns.forEach(b => b.addEventListener('click', () => { btns.forEach(x => x.setAttribute('aria-selected', String(x === b))); apply(b.getAttribute(attr)!); }));
};
tabs('[data-tabs]', 'data-tab', v => swap($$('[data-tabs] li'), li => li.dataset.for === v));
tabs('[data-designs]', 'data-d', v => swap($$('[data-designs] [data-for]'), r => r.dataset.for === v));
tabs('[data-spaces]', 'data-f', v => swap($$('[data-spaces] img'), im => im.dataset.t === v));

/* before/after compare (also keyboard-accessible: it is a real range input) */
$$('[data-cmp]').forEach(c => {
  const r = $<HTMLInputElement>('.cmp__r', c)!;
  const set = () => c.style.setProperty('--pos', `${r.value}%`);
  r.addEventListener('input', set); set();
});

/* reels play in place on click */
$$('[data-reel]').forEach(b => b.addEventListener('click', () => {
  const v = document.createElement('video');
  v.src = b.dataset.reel!; v.controls = true; v.autoplay = true; v.loop = true; v.playsInline = true; v.setAttribute('aria-label', 'SUNROOOF reel');
  b.replaceChildren(v);
}, { once: true }));

/* scroll scenes */
const section = (s: string) => $(s);
const mosaic = section('[data-mosaic]');
const sun = section('[data-sun]');

motion().then(({ gsap, ScrollTrigger, mm }) => {
  const HH = 72; // sticky header height in px

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    /* hero: image eases in slowly as the page scrolls away */
    const hero = $('[data-hero]');
    if (hero) gsap.to($$('.hs__img', hero), { scale: 1.08, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top+=72', end: 'bottom top', scrub: true } });
  });

  /* MOSAIC: the 3×3 grid zooms into the before/after (same technique as the live site: scale ×3 about the centre) */
  mm.add('(min-width: 62rem) and (prefers-reduced-motion: no-preference)', () => {
    if (!mosaic) return;
    const grid = $('[data-vs-grid]')!;
    mosaic.style.height = `calc(100svh - ${HH}px)`; $('.vs__pin', mosaic)!.style.height = `calc(100svh - ${HH}px)`;
    const tl = gsap.timeline({ scrollTrigger: { trigger: mosaic, start: `top top+=${HH}`, end: '+=160%', pin: true, scrub: 0.6, anticipatePin: 1 } });
    tl.fromTo(grid, { scale: 1 }, { scale: 3, ease: 'power2.inOut', duration: 1 }).to({}, { duration: 0.4 });
    return () => { mosaic.style.height = ''; $('.vs__pin', mosaic)!.style.height = ''; };
  });

  /* SUN section: custom cursor-follower (fine pointers only) */
  mm.add('(pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
    if (!sun) return;
    const dot = $('[data-sun-dot]')!;
    const x = gsap.quickTo(dot, 'x', { duration: 0.45, ease: 'power3' }), y = gsap.quickTo(dot, 'y', { duration: 0.45, ease: 'power3' });
    const move = (e: PointerEvent) => { x(e.clientX - 26); y(e.clientY - 26); dot.classList.toggle('big', !!(e.target as HTMLElement).closest('img, a, button')); };
    const enter = () => dot.classList.add('on'), leave = () => dot.classList.remove('on', 'big');
    sun.addEventListener('pointermove', move); sun.addEventListener('pointerenter', enter); sun.addEventListener('pointerleave', leave);
    return () => { sun.removeEventListener('pointermove', move); sun.removeEventListener('pointerenter', enter); sun.removeEventListener('pointerleave', leave); leave(); };
  });
});

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Vision & Stories: Founder's Note / Instagram tabs */
$$('[data-vn]').forEach(root => {
  const tabs = $$('[data-vn-tab]', root), panes = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')!)!);
  const pick = (i: number, focus = false) => {
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; panes[k].hidden = k !== i; });
    if (focus) tabs[i].focus();
    dispatchEvent(new Event('resize')); // lets the observers below and ScrollTrigger re-measure
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(i));
    t.addEventListener('keydown', e => { if (e.key === 'ArrowRight') pick((i + 1) % tabs.length, true); if (e.key === 'ArrowLeft') pick((i + tabs.length - 1) % tabs.length, true); });
  });
});

/* Instagram strip: drifts left on its own (the list is rendered twice so it wraps seamlessly), pauses on hover/touch/arrows, and reels play muted while on screen */
$$('[data-ig]').forEach(box => {
  const track = $<HTMLElement>('[data-ig-track]', box)!, vids = $$<HTMLVideoElement>('video', box);
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target as HTMLVideoElement;
    if (e.isIntersecting && !calm) { if (!v.src) v.src = v.dataset.src!; v.play().then(() => v.classList.add('is-live')).catch(() => {}); } else v.pause();
  }), { root: null, threshold: 0.5 });
  vids.forEach(v => io.observe(v));
  if (calm) return;
  let hold = 0, last = performance.now(), x = 0, raf = 0;
  const pause = (ms = 2500) => { hold = performance.now() + ms; };
  const half = () => track.scrollWidth / 2;
  const tick = (now: number) => {
    const dt = Math.min(now - last, 50); last = now;
    if (now > hold && box.offsetParent) { x += dt * 0.03; if (x >= half()) x -= half(); track.scrollLeft = x; } else x = track.scrollLeft;
    raf = requestAnimationFrame(tick);
  };
  const run = new IntersectionObserver(([e]) => { cancelAnimationFrame(raf); if (e.isIntersecting) { last = performance.now(); raf = requestAnimationFrame(tick); } });
  run.observe(box);
  box.addEventListener('pointerenter', () => pause(1e9)); box.addEventListener('pointerleave', () => pause(400));
  box.addEventListener('touchstart', () => pause(4000), { passive: true });
  $$('[data-ig-dir]', box).forEach(b => b.addEventListener('click', () => { pause(3500); track.scrollBy({ left: Number(b.dataset.igDir) * track.clientWidth * 0.8, behavior: 'smooth' }); }));
  track.addEventListener('scroll', () => { if (track.scrollLeft >= half()) track.scrollLeft -= half(); else if (track.scrollLeft <= 0 && hold > performance.now()) track.scrollLeft += half(); }, { passive: true });
});

/* Blogs: text slides in from the right, the photo is revealed by a wipe, and the photo shifts a little with the pointer */
$$('[data-bl]').forEach(sec => {
  const ts = $$('.bl__t', sec), im = $$('.bl__i', sec), img = $<HTMLElement>('[data-bl-img]', sec)!;
  let i = 0, timer = 0;
  const go = (n: number, dir = 1) => {
    n = (n + ts.length) % ts.length; if (n === i) return;
    sec.style.setProperty('--d', String(dir));
    const o = i; i = n;
    [ts, im].forEach(l => { l[o].classList.remove('is-on'); l[o].classList.add('is-prev'); l[n].classList.remove('is-prev'); l[n].classList.add('is-on'); setTimeout(() => l[o].classList.remove('is-prev'), 1000); });
    ts.forEach((t, k) => { t.ariaHidden = String(k !== i); $<HTMLElement>('a', t)!.tabIndex = k === i ? 0 : -1; });
  };
  $$('[data-bl-dir]', sec).forEach(b => b.addEventListener('click', () => { const d = Number(b.dataset.blDir); go(i + d, d); restart(); }));
  const restart = () => { clearInterval(timer); if (!calm) timer = window.setInterval(() => { if (!sec.matches(':hover, :focus-within')) go(i + 1); }, 7000); };
  restart();
  img.addEventListener('pointermove', e => { const r = img.getBoundingClientRect(); img.style.setProperty('--mx', String((e.clientX - r.left) / r.width - 0.5)); img.style.setProperty('--my', String((e.clientY - r.top) / r.height - 0.5)); });
  img.addEventListener('pointerleave', () => { img.style.setProperty('--mx', '0'); img.style.setProperty('--my', '0'); });
});
