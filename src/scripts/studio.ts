// Studio motion layer, on every page: scroll progress, a light-cursor, magnetic controls, masked headings and opening
// pictures for pages that never marked them, kinetic type bands, a pinned horizontal gallery and a light-shaft shader.
// Everything lives in a gsap.matchMedia() context, so reduced-motion visitors get the plain page.
import { motion } from './motion';

const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

async function boot() {
  const { gsap, ScrollTrigger, mm } = await motion();
  const lenis = (window as any).__lenis; if (lenis) lenis.on('scroll', ScrollTrigger.update);

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // 1. A sun-yellow hairline that fills with the page.
    const bar = document.createElement('div'); bar.className = 'progress'; bar.setAttribute('aria-hidden', 'true'); document.body.append(bar);
    gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

    // 2. Cursor: a small point of light with a soft halo that swells over anything clickable.
    if (fine) {
      const c = document.createElement('div'); c.className = 'cur'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = '<i></i><b></b>'; document.body.append(c);
      const dot = c.firstElementChild!, halo = c.lastElementChild!; document.documentElement.classList.add('has-cur');
      const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' }), dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
      const hx = gsap.quickTo(halo, 'x', { duration: 0.55, ease: 'power3' }), hy = gsap.quickTo(halo, 'y', { duration: 0.55, ease: 'power3' });
      addEventListener('pointermove', e => { dx(e.clientX); dy(e.clientY); hx(e.clientX); hy(e.clientY); c.classList.add('on'); }, { passive: true });
      document.addEventListener('pointerleave', () => c.classList.remove('on'));
      document.addEventListener('pointerover', e => { const t = (e.target as Element).closest('a, button, summary, label, input, select, textarea, [role=tab], .cmp'); c.classList.toggle('hot', !!t); c.classList.toggle('img', !t && !!(e.target as Element).closest('main img')); c.classList.toggle('off', !!(e.target as Element).closest('video, iframe')); });
    }

    // 3. Magnetic controls: buttons lean toward the pointer and spring back.
    if (fine) document.querySelectorAll<HTMLElement>('.btn, .links a, .ul, .hdr__cta, .git__b, .film__cta, .mount button, .bl__c button').forEach(el => {
      const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, .4)' }), y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, .4)' });
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); x((e.clientX - r.left - r.width / 2) * 0.3); y((e.clientY - r.top - r.height / 2) * 0.4); });
      el.addEventListener('pointerleave', () => { x(0); y(0); });
    });

    // 4. Headings the page did not mark: each word rises from its own mask. Skips the film, carousels and headings with links.
    const plain = (h: Element) => [...h.children].every(c => c.tagName === 'BR');
    document.querySelectorAll<HTMLElement>('main h1, main h2').forEach(h => {
      if (h.dataset.split || h.hasAttribute('data-reveal') || h.closest('[data-film], [hidden], .hs-row, dialog, .mq, .bl__ts') || !plain(h) || !h.textContent!.trim()) return;
      h.dataset.split = '1';
      const label = h.textContent!.replace(/\s+/g, ' ').trim(); h.querySelectorAll('br').forEach(b => b.replaceWith(' '));
      const parts = h.textContent!.trim().split(/\s+/); h.textContent = ''; h.setAttribute('aria-label', label);
      parts.forEach((w, i) => { const m = document.createElement('span'); m.className = 'wm'; m.setAttribute('aria-hidden', 'true'); const s = document.createElement('span'); s.className = 'wi'; s.textContent = w; m.append(s); h.append(m, i < parts.length - 1 ? ' ' : ''); });
      gsap.fromTo(h.querySelectorAll('.wi'), { yPercent: 115, rotate: 5 }, { yPercent: 0, rotate: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05, scrollTrigger: { trigger: h, start: 'top 90%', once: true } });
    });

    // 5. Large pictures the page did not mark open out of a smaller window and settle from a slight zoom.
    const skip = '[data-film], .mq, .tp__rib, .ig, .hs-row, .bl__r, .cmp, .vs, .hdr, .ftr, footer, dialog, [data-plx], [data-reveal], .r3c, .pd__g, .sd, [hidden]';
    document.querySelectorAll<HTMLImageElement>('main img').forEach(img => {
      if (img.closest(skip) || img.getBoundingClientRect().width < innerWidth * 0.28) return;
      gsap.fromTo(img, { clipPath: 'inset(12% 8% 12% 8% round 18px)', scale: 1.12 }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', scale: 1, duration: 1.5, ease: 'expo.out', clearProps: 'clipPath,scale', scrollTrigger: { trigger: img, start: 'top 92%', once: true } });
    });

    // 6. Kinetic type bands: giant words slide with the scroll, faster when the page moves faster, skewing into the motion.
    document.querySelectorAll<HTMLElement>('.kin').forEach((k, i) => {
      const t = k.querySelector('.kin__t')!, dir = i % 2 ? 1 : -1;
      gsap.fromTo(t, { xPercent: dir < 0 ? 0 : -25 }, { xPercent: dir < 0 ? -25 : 0, ease: 'none', scrollTrigger: { trigger: k, start: 'top bottom', end: 'bottom top', scrub: 0.5 } });
      const sk = gsap.quickTo(t, 'skewX', { duration: 0.5, ease: 'power3' });
      ScrollTrigger.create({ trigger: k, start: 'top bottom', end: 'bottom top', onUpdate: self => sk(gsap.utils.clamp(-12, 12, self.getVelocity() / -250)), onLeave: () => sk(0), onLeaveBack: () => sk(0) });
    });

    // 7. Section headings drift slower than the page, which layers them over the pictures.
    document.querySelectorAll<HTMLElement>('main section .h-l, main section .h-xl').forEach(h => {
      if (h.closest('[data-film], .vs')) return;
      gsap.fromTo(h, { y: 50 }, { y: -50, ease: 'none', scrollTrigger: { trigger: h, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  });

  // 8. Wide screens: the sky slider pins and its cards travel sideways as you scroll down.
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 62rem)', () => {
    const sky = document.querySelector<HTMLElement>('.sky'), row = sky?.querySelector<HTMLElement>('.hs-row');
    if (!sky || !row) return;
    sky.classList.add('is-pinned');
    const dist = () => Math.max(0, row.scrollWidth - innerWidth);
    gsap.to(row, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: sky, pin: true, start: 'top top+=72', end: () => '+=' + dist(), scrub: 0.6, invalidateOnRefresh: true } });
    return () => sky.classList.remove('is-pinned');
  });

  requestAnimationFrame(() => ScrollTrigger.refresh());
}

// 9. Light shafts: a small fragment shader paints slow warm beams falling through dust behind the contact section.
function shafts(host: HTMLElement) {
  const cv = document.createElement('canvas'); cv.className = 'shafts'; cv.setAttribute('aria-hidden', 'true'); host.prepend(cv);
  const gl = cv.getContext('webgl', { premultipliedAlpha: false, antialias: false }); if (!gl) return cv.remove();
  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `precision mediump float;uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){vec2 uv=gl_FragCoord.xy/r;vec2 src=vec2(.18,1.25);vec2 d=uv-src;float a=atan(d.x,-d.y);float dist=length(d*vec2(r.x/r.y,1.));
float beams=0.;for(int k=0;k<3;k++){float fk=float(k);beams+=n(vec2(a*(9.+fk*7.)+t*(.05+fk*.03),fk*3.1))*(.55-fk*.12);}
beams=pow(beams,2.2);float fall=smoothstep(1.9,.1,dist);float dust=pow(n(uv*vec2(r.x/r.y,1.)*90.+vec2(0.,t*.6)),18.)*fall*.9;
vec3 col=mix(vec3(1.,.62,.22),vec3(1.,.86,.45),beams);float v=beams*fall*.55+dust;gl_FragColor=vec4(col*v,v);}`;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram()!; gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return cv.remove();
  gl.useProgram(pr); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const ur = gl.getUniformLocation(pr, 'r'), ut = gl.getUniformLocation(pr, 't');
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const size = () => { const k = Math.min(devicePixelRatio, 1.25) * 0.6; cv.width = host.clientWidth * k | 0; cv.height = host.clientHeight * k | 0; gl.viewport(0, 0, cv.width, cv.height); };
  size(); addEventListener('resize', size);
  let on = false, id = 0; const t0 = performance.now();
  const draw = () => { gl.uniform2f(ur, cv.width, cv.height); gl.uniform1f(ut, (performance.now() - t0) / 1000); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3); if (on) id = requestAnimationFrame(draw); };
  new IntersectionObserver(([e]) => { on = e.isIntersecting; cancelAnimationFrame(id); if (on) draw(); }).observe(host);
}

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const go = () => { boot().catch(() => {}); document.querySelectorAll<HTMLElement>('[data-shafts]').forEach(shafts); };
  'requestIdleCallback' in window ? (window as any).requestIdleCallback(go, { timeout: 900 }) : setTimeout(go, 200);
}
