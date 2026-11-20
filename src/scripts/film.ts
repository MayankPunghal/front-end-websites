// Hero: scroll picks a frame of a pre-rendered film. Chapter copy, layer labels and the clock follow the same position.
import { paceAt } from '../lib/pace';

type Film = { v: number; n: number; fps: number; seg?: number; tod: number[]; labels: Record<string, number[]> };
// A film is cut into short pieces (seg frames each), one <video> per piece. Each piece is downloaded whole and played from memory,
// nearest the visitor first, so the opening scrubs within a second or two while the rest arrives in story order.
type Reel = { vids: HTMLVideoElement[]; film: Film; at: number; seg: number; want: number };

const story = document.querySelector<HTMLElement>('[data-film]');
if (story && !matchMedia('(prefers-reduced-motion: reduce)').matches) boot(story);

async function boot(story: HTMLElement) {
  const root = document.documentElement, fail = () => root.classList.remove('is-film');
  const pin = story.querySelector<HTMLElement>('.film__pin')!;
  let video = story.querySelector('video')!;
  root.classList.add('is-film');
  pin.addEventListener('contextmenu', e => e.preventDefault()); // no 'Save video as' on the film (a deterrent only: the file is still fetched in the open)
  const path = `${story.dataset.film}/${pin.clientHeight > pin.clientWidth ? 'portrait' : 'landscape'}`;
  let film: Film;
  const early = (window as any).__film0?.path === path ? (window as any).__film0 : null; // started by the inline script in the page head
  try { film = await (early ? early.json : fetch(`${path}.json`, { cache: 'no-cache' }).then(r => r.json())); } catch { return fail(); }
  if (!video.poster.endsWith(`${path}.jpg`)) video.poster = `${path}.jpg`;
  // Seeking a streamed file re-requests a byte range on every scroll step, so each piece is fetched whole and played from memory.
  const reelOf = (first: HTMLVideoElement, base: string, f: Film): Reel => {
    const seg = f.seg || f.n, k = Math.ceil(f.n / seg), vids = [first];
    for (let i = 1; i < k; i++) { const v = first.cloneNode() as HTMLVideoElement; v.removeAttribute('poster'); v.removeAttribute('src'); v.style.visibility = 'hidden'; vids[i - 1].after(v); vids.push(v); }
    vids.forEach(v => v.addEventListener('loadedmetadata', () => { shownZoom = ''; s = -1; shown = -1; }));
    const r: Reel = { vids, film: f, at: 0, seg, want: 0 }, url = (i: number) => f.seg ? `${base}-${i}.mp4?v=${f.v}` : `${base}.mp4?v=${f.v}`;
    const done = new Set<number>();
    const load = async () => { // two of these run side by side, each taking the unloaded piece nearest where the visitor is (or heading)
      while (done.size < k) {
        let i = -1; for (let d = 0; d < k && i < 0; d++) for (const j of [r.want + d, r.want - d]) if (j >= 0 && j < k && !done.has(j)) { i = j; break; }
        done.add(i);
        try { const b: Blob = await (i === 0 && base === path && early ? early.piece : fetch(url(i)).then(x => x.ok ? x.blob() : Promise.reject())); vids[i].src = URL.createObjectURL(b); }
        catch { vids[i].src = url(i); if (i === 0 && r === reel) fail(); } // fall back to streaming that piece
      }
    };
    load(); load();
    return r;
  };
  let reel = reelOf(video, path, film);
  const show = (r: Reel, i: number) => { r.vids[r.at].style.visibility = 'hidden'; r.vids[i].style.visibility = ''; r.at = i; if (r === reel) video = r.vids[i]; };
  const lenOf = (r: Reel, i: number) => Math.min(r.seg, r.film.n - i * r.seg);
  /** Points the reel at the current frame: seeks the piece that holds it and swaps it in once it shows that frame; parks the pieces either side on their nearest frame so crossing into them is instant. */
  const seekTo = (r: Reel) => {
    const i = Math.min(r.vids.length - 1, frame / r.seg | 0), v = r.vids[i], t = (frame - i * r.seg + .5) / r.film.fps; r.want = i;
    if (v.readyState < 1) return; // not downloaded yet: the last frame stays up
    if (v.seeking) return;
    if (Math.abs(v.currentTime - t) > 1e-3) { v.currentTime = t; return; }
    if (i !== r.at) show(r, i);
    shown = frame;
    for (const j of [i - 1, i + 1]) { const n = r.vids[j]; if (!n || n.readyState < 1 || n.seeking) continue; const pt = (j < i ? lenOf(r, j) - .5 : .5) / r.film.fps; if (Math.abs(n.currentTime - pt) > 1e-3) n.currentTime = pt; }
  };

  const clamp = (x: number) => Math.min(1, Math.max(0, x)), up = (x: number, a: number, b: number) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (6 * t - 15) + 10); };
  let shownGrade = '', shownZoom = '', zk = 1, ztx = 0;
  // narrow screens: the exploded product is wider than the screen, so the film zooms out and moves left, leaving the right side for the labels
  const PROD = path.endsWith('portrait') ? [.073, .856] : [.26, .7]; // the exploded product's left and right edges, as fractions of the film's width
  const zoom = () => {
    if (!video.videoWidth) return; // size unknown (first load, or the in-memory copy swapping in): keep the last layout instead of sizing to a 1px film
    const W = pin.clientWidth, H = pin.clientHeight, vw = video.videoWidth || 1, vh = video.videoHeight || 1, c = Math.max(W / vw, H / vh), w = vw * c, h = vh * c;
    const z = W < H || !fine ? up(s, .4, .45) * (1 - up(s, .66, .71)) : 0, kt = Math.min(1, .56 * W / ((PROD[1] - PROD[0]) * w));
    zk = 1 + (kt - 1) * z; ztx = (.62 * W - W / 2 - (PROD[1] - .5) * w * kt) * z;
    const m = (z * 18).toFixed(1), css = z < .002 ? '' : `translate3d(${ztx.toFixed(1)}px,0,0) scale(${zk.toFixed(4)})|linear-gradient(90deg,#0000,#000 ${m}%,#000 ${100 - +m}%,#0000),linear-gradient(#0000,#000 ${m}%,#000 ${100 - +m}%,#0000)`;
    // the element itself is sized to the covering box (not cropped by object-fit), so zooming out reveals the whole film
    const key = `${css}|${w.toFixed(1)}|${h.toFixed(1)}`;
    if (key !== shownZoom) { shownZoom = key; const [t = '', mk = ''] = css.split('|'); story.querySelectorAll('video').forEach(v => { Object.assign(v.style, { transform: t, maskImage: mk, maskComposite: 'intersect', maxWidth: 'none', width: `${w}px`, height: `${h}px`, left: `${(W - w) / 2}px`, top: `${(H - h) / 2}px` }); }); }
  };
  const chapters = [...story.querySelectorAll<HTMLElement>('[data-in]')].map(el => ({ el, a: +el.dataset.in!, b: +el.dataset.out!, shown: -1 }));
  const labels = [...story.querySelectorAll<HTMLElement>('[data-layer]')];
  const clockT = story.querySelector<HTMLElement>('[data-clock-t]')!, clockN = story.querySelector<HTMLElement>('[data-clock-n]')!, clock = story.querySelector<HTMLElement>('[data-clock]')!;
  const fine = matchMedia('(min-width: 48rem)').matches;
  const NAMES: [number, string][] = [[480, 'Dawn'], [680, 'Morning'], [900, 'Midday'], [1020, 'Afternoon'], [1150, 'Dusk'], [1e9, 'Night']];

  let s = -1, eased = -1, p = 0, frame = 0, shown = -1, visible = true, top = 0, span = 1;
  const resize = () => { top = story.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(pin).top); span = story.offsetHeight - pin.offsetHeight; s = -1; };
  addEventListener('resize', resize); resize();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(story);

  const todAt = (f: number) => { const x = f / 8, i = Math.min(film.tod.length - 2, x | 0); return film.tod[i] + (film.tod[i + 1] - film.tod[i]) * (x - i); };
  /** Position of a layer's label inside the hero: the film is cropped to fill it, so its coordinates are mapped through that crop. */
  const labelAt = (i: number) => {
    const k = Math.floor(frame / 4) * 4, a = film.labels[k], b = film.labels[k + 4] ?? a; if (!a) return null;
    const W = pin.clientWidth, H = pin.clientHeight, t = (frame - k) / 4, vw = video.videoWidth || 16, vh = video.videoHeight || 9, scale = Math.max(W / vw, H / vh), w = vw * scale, h = vh * scale;
    return { x: W / 2 + ztx + (a[i * 2] + (b[i * 2] - a[i * 2]) * t - .5) * w * zk, y: H / 2 + (a[i * 2 + 1] + (b[i * 2 + 1] - a[i * 2 + 1]) * t - .5) * h * zk };
  };

  const overlay = () => {
    zoom();
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
      l.style.transform = `translate3d(${(fine ? q.x : Math.min(q.x, pin.clientWidth - 128)).toFixed(1)}px,${q.y.toFixed(1)}px,0)`;
    });
    // time-of-day light, as in the 3D scene: neutral at midday, warming and dimming into dusk; it eases off as the camera pulls out to the night building
    const w = up(todAt(frame), .42, .66) * (1 - up(p, .9, .97)), grade = w < .005 ? '' : `sepia(${(.45 * w).toFixed(3)}) saturate(${(1 + .35 * w).toFixed(3)}) hue-rotate(${(-12 * w).toFixed(1)}deg) brightness(${(1 - .25 * w).toFixed(3)})`;
    if (grade !== shownGrade) { shownGrade = grade; story.querySelectorAll('video').forEach(v => { v.style.filter = grade; }); }
    const lit = p > .23 && p < .985; clock.style.opacity = lit ? '1' : '0';
    if (lit) {
      const tod = todAt(frame), mins = Math.round(370 + tod * 900), hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
      clockT.textContent = `${hh}:${mm}`; clockN.textContent = NAMES.find(n => mins < n[0])![1];
    }
  };

  const tick = () => {
    requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    // the film eases toward the scrollbar, so a wheel notch plays as a short run of frames instead of one jump
    const goal = clamp((scrollY - top) / span); eased = eased < 0 ? goal : eased + (goal - eased) * .14;
    const now = Math.abs(goal - eased) < 1e-4 ? (eased = goal) : eased;
    if (now !== s) { s = now; p = paceAt(s); frame = Math.round(s * (film.n - 1)); overlay(); }
    // a new seek only starts once the last one has finished, so the video never falls behind the scrollbar
    if (frame !== shown) seekTo(reel);
  };
  // switching mounts: the other film loads on first use and takes over at the same moment of the story
  const alt: Record<string, Reel> = { ceiling: reel }, buttons = [...story.querySelectorAll<HTMLButtonElement>('[data-mount]')];
  let want = 'ceiling';
  const choose = async (m: string) => {
    want = m; buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mount === m)));
    try {
      if (!alt[m]) {
        const data: Film = await (await fetch(`${path}-wall.json`, { cache: 'no-cache' })).json(), all = story.querySelectorAll('video');
        const v = all[0].cloneNode() as HTMLVideoElement; v.removeAttribute('poster'); v.removeAttribute('src'); v.style.visibility = ''; all[all.length - 1].after(v);
        alt[m] = reelOf(v, `${path}-wall`, data); alt[m].vids.forEach(x => { x.style.opacity = '0'; });
      }
      const next = alt[m];
      // wait for the piece holding the current frame, then show it there before crossfading
      while (want === m) { next.want = Math.min(next.vids.length - 1, frame / next.seg | 0); const v = next.vids[next.want]; if (v.readyState >= 1) break; await new Promise(ok => setTimeout(ok, 50)); }
      if (want !== m) return;
      const i = next.want, v = next.vids[i]; v.currentTime = (frame - i * next.seg + .5) / next.film.fps; await new Promise(ok => v.addEventListener('seeked', ok, { once: true }));
      if (want !== m) return;
      show(next, i); reel.vids.forEach(x => { x.style.opacity = '0'; }); next.vids.forEach(x => { x.style.opacity = '1'; });
      reel = next; video = next.vids[i]; film = next.film; shown = -1; shownZoom = ''; s = -1;
    } catch { if (want === m && m !== 'ceiling') choose('ceiling'); }
  };
  buttons.forEach(b => b.addEventListener('click', () => choose(b.dataset.mount!)));

  requestAnimationFrame(tick);
}
