// Scroll picks a frame of the film (filmed from the 3D scene by tools/capture-story.mjs). Chapter copy, layer labels and the clock follow the same position.
import { paceAt } from './pace';

type Film = { v: number; n: number; fps: number; tod: number[]; labels: Record<string, number[]> };

const story = document.querySelector<HTMLElement>('[data-story]');
const on3d = document.documentElement.classList.contains('is-3d');

if (story && on3d) boot(story);
else dispatchEvent(new Event('scene-ready'));

async function boot(story: HTMLElement) {
  const fail = () => { document.documentElement.classList.remove('is-3d'); dispatchEvent(new Event('scene-ready')); };
  let video = story.querySelector('video')!;
  const name = innerHeight > innerWidth ? 'portrait' : 'landscape', path = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/sunrooof/film/${name}`;
  let film: Film;
  try { film = await (await fetch(`${path}.json`, { cache: 'no-cache' })).json(); } catch { return fail(); }
  video.addEventListener('error', fail, { once: true });
  video.addEventListener('loadeddata', () => dispatchEvent(new Event('scene-ready')), { once: true });
  video.poster = `${path}.jpg?v=${film.v}`; video.src = `${path}.mp4?v=${film.v}`;

  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const chapters = [...story.querySelectorAll<HTMLElement>('[data-in]')].map(el => ({ el, a: +el.dataset.in!, b: +el.dataset.out!, shown: -1 }));
  const labels = [...story.querySelectorAll<HTMLElement>('[data-layer]')];
  const clockT = story.querySelector<HTMLElement>('[data-clock-t]')!, clockN = story.querySelector<HTMLElement>('[data-clock-n]')!, clock = story.querySelector<HTMLElement>('[data-clock]')!;
  const fine = matchMedia('(min-width: 48rem)').matches;
  const NAMES: [number, string][] = [[480, 'Dawn'], [680, 'Morning'], [900, 'Midday'], [1020, 'Afternoon'], [1150, 'Dusk'], [1e9, 'Night']];

  let s = -1, p = 0, frame = 0, shown = -1, visible = true, lastW = -1, top = 0, span = 1;
  const resize = () => { top = story.getBoundingClientRect().top + scrollY; span = story.offsetHeight - innerHeight; s = -1; };
  addEventListener('resize', resize); resize();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(story);

  const todAt = (f: number) => { const x = f / 8, i = Math.min(film.tod.length - 2, x | 0); return film.tod[i] + (film.tod[i + 1] - film.tod[i]) * (x - i); };
  /** Screen position of a layer's label: the film is cropped to fill the window, so its coordinates are mapped through that crop. */
  const labelAt = (i: number) => {
    const k = Math.floor(frame / 4) * 4, a = film.labels[k], b = film.labels[k + 4] ?? a; if (!a) return null;
    const t = (frame - k) / 4, vw = video.videoWidth || 16, vh = video.videoHeight || 9, scale = Math.max(innerWidth / vw, innerHeight / vh), w = vw * scale, h = vh * scale;
    return { x: (innerWidth - w) / 2 + (a[i * 2] + (b[i * 2] - a[i * 2]) * t) * w, y: (innerHeight - h) / 2 + (a[i * 2 + 1] + (b[i * 2 + 1] - a[i * 2 + 1]) * t) * h };
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
      l.style.transform = `translate3d(${(fine ? q.x : Math.min(q.x, innerWidth - 150)).toFixed(1)}px,${q.y.toFixed(1)}px,0)`;
    });
    const lit = p > .23 && p < .985; clock.style.opacity = lit ? '1' : '0';
    if (lit) {
      const tod = todAt(frame), mins = Math.round(370 + tod * 900), hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
      clockT.textContent = `${hh}:${mm}`; clockN.textContent = NAMES.find(n => mins < n[0])![1];
      // headline weight follows the height of the sun: thin at dawn, heavy at noon. Changing it re-renders text, so it only changes between headlines
      const wt = Math.round(250 + 350 * Math.sin(Math.PI * Math.min(1, tod / .8)));
      if (Math.abs(wt - lastW) > 20 && chapters.every(c => c.shown <= .01)) { lastW = wt; story.style.setProperty('--sun-w', String(wt)); }
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
  // switching mounts: the other film loads on first use and takes over at the same moment of the story
  const first = video, alt: Record<string, { v: HTMLVideoElement; film: Film }> = { ceiling: { v: video, film } }, buttons = [...story.querySelectorAll<HTMLButtonElement>('[data-mount]')];
  let want = 'ceiling';
  const choose = async (m: string) => {
    want = m; buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mount === m)));
    try {
      if (!alt[m]) {
        const v = first.cloneNode() as HTMLVideoElement, data: Film = await (await fetch(`${path}-wall.json`, { cache: 'no-cache' })).json();
        v.style.opacity = '0'; v.removeAttribute('poster'); v.src = `${path}-wall.mp4?v=${data.v}`; first.after(v);
        await new Promise((ok, no) => { v.addEventListener('loadeddata', ok, { once: true }); v.addEventListener('error', no, { once: true }); });
        alt[m] = { v, film: data };
      }
      const next = alt[m]; if (want !== m) return;
      next.v.currentTime = (frame + .5) / next.film.fps; await new Promise(ok => next.v.addEventListener('seeked', ok, { once: true }));
      if (want !== m) return;
      video.style.opacity = '0'; next.v.style.opacity = '1'; video = next.v; film = next.film; shown = -1;
    } catch { if (want === m && m !== 'ceiling') choose('ceiling'); }
  };
  buttons.forEach(b => b.addEventListener('click', () => choose(b.dataset.mount!)));

  requestAnimationFrame(tick);
}

// before / after slider
document.querySelectorAll<HTMLElement>('[data-compare]').forEach(c => {
  const r = c.querySelector<HTMLInputElement>('input')!;
  r.addEventListener('input', () => c.style.setProperty('--pos', r.value + '%'));
});
