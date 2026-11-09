import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const reqs = [];
p.on('response', r => { const u = r.url(); if (/\.(mp4|webm|m3u8|mov)|\/videos\//i.test(u) || r.headers()['content-type']?.startsWith('video')) reqs.push({ u, ct: r.headers()['content-type'], len: r.headers()['content-length'] }); });
await p.goto('https://sunrooof.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(4000);
for (let y = 0; y < 14000; y += 500) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(250); }
const info = await p.evaluate(() => ({
  scripts: [...document.scripts].map(s => s.src || ('inline:' + s.textContent.length)),
  css: [...document.styleSheets].map(s => s.href || 'inline'),
  videos: [...document.querySelectorAll('video')].map(v => ({ src: v.currentSrc || v.src, sources: [...v.querySelectorAll('source')].map(s => s.src), poster: v.poster, w: v.videoWidth, h: v.videoHeight, d: v.duration, auto: v.autoplay, loop: v.loop, parent: v.closest('section,div[id]')?.id })),
  sections: [...document.querySelectorAll('main > *, #MainContent > *, body > section')].map(e => ({ tag: e.tagName, id: e.id, cls: e.className?.toString().slice(0, 80), h: Math.round(e.getBoundingClientRect().height), t: (e.innerText || '').slice(0, 70).replace(/\s+/g, ' ') })),
  libs: ['gsap', 'ScrollTrigger', 'Swiper', 'Lenis', 'lenis', 'THREE', 'Splide', 'Flickity', 'jQuery', 'Alpine'].filter(k => k in window)
}));
fs.writeFileSync('artifacts/live/home-info.json', JSON.stringify({ info, reqs }, null, 1));
fs.writeFileSync('artifacts/live/home.html', await p.content());
console.log(JSON.stringify({ libs: info.libs, nsec: info.sections.length, vids: info.videos, reqs }, null, 1));
await b.close();
