// Visit every built route, scroll to trigger lazy loading, report <img> that failed to load (and failed requests).
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:4321';
const routes = [];
const walk = (d, p = '') => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(d + '/' + e.name, p + '/' + e.name); else if (e.name === 'index.html') routes.push(p || '/'); } };
walk('dist');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const bad = new Map();
for (const r of routes) {
  const p = await ctx.newPage(); const fails = [];
  p.on('requestfailed', q => /\.(png|jpe?g|webp|avif|gif|svg|mp4)/i.test(q.url()) && fails.push(q.url()));
  p.on('response', q => q.status() >= 400 && /\.(png|jpe?g|webp|avif|gif|svg|mp4)/i.test(q.url()) && fails.push(q.status() + ' ' + q.url()));
  await p.goto(base + r, { waitUntil: 'load' }).catch(() => {});
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 700) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(60); }
  await p.waitForTimeout(800);
  const imgs = await p.evaluate(() => [...document.images].filter(i => i.currentSrc || i.src).filter(i => i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== 'none' && !i.closest('[hidden]')).map(i => i.currentSrc || i.src));
  for (const u of [...imgs, ...fails]) { const k = u.replace(/\?.*/, ''); (bad.get(k) || bad.set(k, new Set()).get(k)).add(r); }
  await p.close();
}
for (const [u, rs] of bad) console.log(u, '<-', [...rs].slice(0, 3).join(', '), rs.size > 3 ? `(+${rs.size - 3})` : '');
console.log('routes', routes.length, 'broken', bad.size);
await b.close();
