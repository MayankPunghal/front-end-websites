import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('https://sunrooof.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(3000);
for (let y = 0; y < 16000; y += 600) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(150); }
const out = await p.evaluate(() => {
  const abs = u => u && new URL(u, location.href).href.replace(/\?.*$/, '');
  return [...new Map([...document.querySelectorAll('[id^="shopify-section-template--30044460908704__"]')].map(e => [e.id, e])).values()].map(s => {
    const seen = new Set();
    const imgs = [...s.querySelectorAll('img')].map(i => ({ src: abs(i.currentSrc || i.src), alt: i.alt, w: i.naturalWidth, h: i.naturalHeight, vis: i.offsetParent !== null })).filter(i => i.src && !seen.has(i.src) && seen.add(i.src));
    const text = [...s.querySelectorAll('h1,h2,h3,h4,h5,p,a,button,summary,figcaption,span.tab,li')].map(e => ({ t: e.tagName, x: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 220), href: e.getAttribute('href') })).filter(e => e.x && e.x.length > 1);
    const dedup = []; const ts = new Set(); for (const e of text) { if (!ts.has(e.x)) { ts.add(e.x); dedup.push(e); } }
    return { id: s.id.split('__')[1], h: Math.round(s.getBoundingClientRect().height), bg: getComputedStyle(s.firstElementChild || s).backgroundColor, imgs, text: dedup };
  });
});
fs.writeFileSync('artifacts/live/struct.json', JSON.stringify(out, null, 1));
console.log(out.length);
await b.close();
