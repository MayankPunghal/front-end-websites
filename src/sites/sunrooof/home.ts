// Scroll drives one value (0 to 1). The 3D world, chapter copy, layer labels and clock all read from it.
import { paceAt } from './pace';

const story = document.querySelector<HTMLElement>('[data-story]');
const on3d = document.documentElement.classList.contains('is-3d');

if (story && on3d) boot(story);
else dispatchEvent(new Event('scene-ready'));

async function boot(story: HTMLElement) {
  const { createWorld } = await import('./three/world');
  const canvas = story.querySelector<HTMLCanvasElement>('canvas')!;
  let world: Awaited<ReturnType<typeof createWorld>>;
  try { world = await createWorld(canvas); }
  catch (err) { console.error(err); document.documentElement.classList.remove('is-3d'); dispatchEvent(new Event('scene-ready')); return; }

  const clamp = (x: number) => Math.min(1, Math.max(0, x)), clamp2 = (x: number, m: number) => Math.min(m, Math.max(-m, x));
  const chapters = [...story.querySelectorAll<HTMLElement>('[data-in]')].map(el => ({ el, a: +el.dataset.in!, b: +el.dataset.out!, shown: -1 }));
  const labels = [...story.querySelectorAll<HTMLElement>('[data-layer]')];
  const clockT = story.querySelector<HTMLElement>('[data-clock-t]')!, clockN = story.querySelector<HTMLElement>('[data-clock-n]')!, clock = story.querySelector<HTMLElement>('[data-clock]')!;
  const fine = matchMedia('(min-width: 48rem)').matches;
  const NAMES = ['Dawn', 'Morning', 'Midday', 'Golden hour', 'Dusk', 'Night'];

  let target = 0, s = 0, p = 0, last = performance.now(), since = last, drops = 0, low = 0, idle = 0, frames = 0, visible = true, lastW = -1;
  // reads cached geometry: measuring the page on every scroll event forces a layout
  let top = 0, span = 1;
  const read = () => { target = clamp((scrollY - top) / span); };
  addEventListener('scroll', read, { passive: true });
  const resize = () => { world.resize(); top = story.getBoundingClientRect().top + scrollY; span = story.offsetHeight - innerHeight; read(); };
  addEventListener('resize', resize); resize();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(story);

  const overlay = () => {
    for (const c of chapters) {
      const o = Math.min(clamp((p - c.a) / .016), clamp((c.b - p) / .016)), v = c.a === 0 ? clamp((c.b - p) / .016) : c.b >= 1 ? clamp((p - c.a) / .016) : o;
      if (Math.abs(v - c.shown) < .004) continue;
      c.shown = v; c.el.style.opacity = String(v); c.el.style.transform = `translate3d(0,${((1 - v) * 18).toFixed(1)}px,0)`; c.el.style.visibility = v > .01 ? 'visible' : 'hidden'; c.el.toggleAttribute('data-live', v > .9);
    }
    const open = Math.min(clamp((p - .535) / .012), clamp((.6 - p) / .012));
    labels.forEach((l, i) => {
      if (open < .01) { l.style.opacity = '0'; return; }
      const q = world.labelAt(i); l.style.opacity = String(open);
      l.style.transform = `translate3d(${(fine ? q.x : Math.min(q.x, innerWidth - 150)).toFixed(1)}px,${q.y.toFixed(1)}px,0)`;
    });
    const lit = p > .23 && p < .985; clock.style.opacity = lit ? '1' : '0';
    if (lit) {
      const mins = Math.round(370 + world.tod * 900), hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
      clockT.textContent = `${hh}:${mm}`; clockN.textContent = NAMES[Math.round(world.tod * (NAMES.length - 1))];
      // headline weight follows the height of the sun: thin at dawn, heavy at noon. Changing it re-renders text, so it only changes between headlines
      const wt = Math.round(250 + 350 * Math.sin(Math.PI * Math.min(1, world.tod / .8)));
      if (Math.abs(wt - lastW) > 20 && chapters.every(c => c.shown <= .01)) { lastW = wt; story.style.setProperty('--sun-w', String(wt)); }
    }
  };

  world.update(0, 0); world.render(); dispatchEvent(new Event('scene-ready'));

  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    // follows the scrollbar closely, and the speed limit stops a late frame from turning into a lurch
    s += clamp2((target - s) * (1 - Math.exp(-dt * 12)), .4 * dt); if (Math.abs(target - s) < .00002) s = target;
    p = paceAt(s);
    const moving = Math.abs(target - s) > .00005; idle = moving ? 0 : idle + 1;
    // once the scroll settles, only the clouds and dust are moving: a third of the frames is plenty
    if (moving || idle % 3 === 0) { world.update(p, dt); world.render(); overlay(); }
    if (!moving) { frames = 0; since = now; return; }
    // drop quality if the machine cannot hold about 35 fps
    frames++; if (now - since > 1200) { low = frames / (now - since) * 1000 < 34 ? low + 1 : 0; if (low > 1) { drops += +world.degrade(); low = 0; } document.documentElement.dataset.q = String(drops); frames = 0; since = now; }
  };
  requestAnimationFrame(tick);
}

// before / after slider
document.querySelectorAll<HTMLElement>('[data-compare]').forEach(c => {
  const r = c.querySelector<HTMLInputElement>('input')!;
  r.addEventListener('input', () => c.style.setProperty('--pos', r.value + '%'));
});
