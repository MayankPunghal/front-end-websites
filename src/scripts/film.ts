// Hero: scroll picks a frame of a pre-rendered film. Chapter copy, layer labels and the clock follow the same position.
import { paceAt } from '../lib/pace';

type Film = { n: number; fps: number; tod: number[]; labels: Record<string, number[]> };

const story = document.querySelector<HTMLElement>('[data-film]');
if (story && !matchMedia('(prefers-reduced-motion: reduce)').matches) boot(story);

async function boot(story: HTMLElement) {
  const root = document.documentElement, fail = () => root.classList.remove('is-film');
  const pin = story.querySelector<HTMLElement>('.film__pin')!, video = story.querySelector('video')!;
  root.classList.add('is-film');
  const path = `${story.dataset.film}/${pin.clientHeight > pin.clientWidth ? 'portrait' : 'landscape'}`;
  let film: Film;
  try { film = await (await fetch(`${path}.json`)).json(); } catch { return fail(); }
  video.addEventListener('error', fail, { once: true });
  video.poster = `${path}.jpg`; video.src = `${path}.mp4`;

  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const chapters = [...story.querySelectorAll<HTMLElement>('[data-in]')].map(el => ({ el, a: +el.dataset.in!, b: +el.dataset.out!, shown: -1 }));
  const labels = [...story.querySelectorAll<HTMLElement>('[data-layer]')];
  const clockT = story.querySelector<HTMLElement>('[data-clock-t]')!, clockN = story.querySelector<HTMLElement>('[data-clock-n]')!, clock = story.querySelector<HTMLElement>('[data-clock]')!;
  const fine = matchMedia('(min-width: 48rem)').matches;
  const NAMES = ['Dawn', 'Morning', 'Midday', 'Golden hour', 'Dusk', 'Night'];

  let s = -1, p = 0, frame = 0, shown = -1, visible = true, top = 0, span = 1;
  const resize = () => { top = story.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(pin).top); span = story.offsetHeight - pin.offsetHeight; s = -1; };
  addEventListener('resize', resize); resize();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(story);

  const todAt = (f: number) => { const x = f / 8, i = Math.min(film.tod.length - 2, x | 0); return film.tod[i] + (film.tod[i + 1] - film.tod[i]) * (x - i); };
  /** Position of a layer's label inside the hero: the film is cropped to fill it, so its coordinates are mapped through that crop. */
  const labelAt = (i: number) => {
    const k = Math.floor(frame / 4) * 4, a = film.labels[k], b = film.labels[k + 4] ?? a; if (!a) return null;
    const W = pin.clientWidth, H = pin.clientHeight, t = (frame - k) / 4, vw = video.videoWidth || 16, vh = video.videoHeight || 9, scale = Math.max(W / vw, H / vh), w = vw * scale, h = vh * scale;
    return { x: (W - w) / 2 + (a[i * 2] + (b[i * 2] - a[i * 2]) * t) * w, y: (H - h) / 2 + (a[i * 2 + 1] + (b[i * 2 + 1] - a[i * 2 + 1]) * t) * h };
  };

  const overlay = () => {
    for (const c of chapters) {
      const o = Math.min(clamp((p - c.a) / .016), clamp((c.b - p) / .016)), v = c.a === 0 ? clamp((c.b - p) / .016) : c.b >= 1 ? clamp((p - c.a) / .016) : o;
      if (Math.abs(v - c.shown) < .004) continue;
      c.shown = v; c.el.style.opacity = String(v); c.el.style.transform = `translate3d(0,${((1 - v) * 18).toFixed(1)}px,0)`; c.el.style.visibility = v > .01 ? 'visible' : 'hidden'; c.el.toggleAttribute('data-live', v > .9);
    }
    const open = Math.min(clamp((p - .535) / .012), clamp((.6 - p) / .012));
    labels.forEach((l, i) => {
      const q = open < .01 ? null : labelAt(i);
      if (!q) { l.style.opacity = '0'; return; }
      l.style.opacity = String(open);
      l.style.transform = `translate3d(${(fine ? q.x : Math.min(q.x, pin.clientWidth - 150)).toFixed(1)}px,${q.y.toFixed(1)}px,0)`;
    });
    const lit = p > .23 && p < .985; clock.style.opacity = lit ? '1' : '0';
    if (lit) {
      const tod = todAt(frame), mins = Math.round(370 + tod * 900), hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
      clockT.textContent = `${hh}:${mm}`; clockN.textContent = NAMES[Math.round(tod * (NAMES.length - 1))];
    }
  };

  const tick = () => {
    requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    const now = clamp((scrollY - top) / span);
    if (now !== s) { s = now; p = paceAt(s); frame = Math.round(s * (film.n - 1)); overlay(); }
    // a new seek only starts once the last one has finished, so the video never falls behind the scrollbar
    if (frame !== shown && !video.seeking && video.readyState >= 1) { shown = frame; video.currentTime = (frame + .5) / film.fps; }
  };
  requestAnimationFrame(tick);
}
