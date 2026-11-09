// Quick visual QA against the local dev/preview server.
// node tools/qa/shoot.mjs [--base=http://localhost:4321] [--out=artifacts/_qa] [--vp=desktop,mobile] [--at=0,1200] /route /route2
import { chromium } from 'playwright';
import fs from 'node:fs/promises'; import path from 'node:path';
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:4321'), OUT = arg('out', 'artifacts/_qa'), VPS = arg('vp', 'desktop').split(','), AT = arg('at', '').split(',').filter(Boolean).map(Number), FULL = arg('full', '1') === '1';
const routes = process.argv.slice(2).filter(a => !a.startsWith('--'));
const V = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
await fs.mkdir(OUT, { recursive: true });
const b = await chromium.launch();
for (const vp of VPS) {
  const ctx = await b.newContext(V[vp]); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('requestfailed', r => errs.push('REQFAIL ' + r.url().slice(0, 100)));
  for (const r of routes) {
    await p.goto(BASE + r, { waitUntil: 'load' }); await p.waitForTimeout(1200);
    const name = (r.replace(/\W+/g, '_') || 'home') + '__' + vp;
    await p.screenshot({ path: path.join(OUT, name + '__top.png') });
    for (const y of AT) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(900); await p.screenshot({ path: path.join(OUT, `${name}__y${y}.png`) }); }
    if (FULL) {
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
      await p.waitForTimeout(800); await p.screenshot({ path: path.join(OUT, name + '__full.png'), fullPage: true });
    }
    const m = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > innerWidth + 1 }));
    console.log(vp, r, m, errs.splice(0).slice(0, 6));
  }
  await ctx.close();
}
await b.close();
