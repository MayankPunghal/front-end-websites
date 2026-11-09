// alt/src pairs per route: node dump-images.mjs /pages/clients ...  -> artifacts/content-full/images_<route>.json
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route('**/*', r => /(^|\.)(sunrooof\.com|shopify\.com|googleapis\.com|gstatic\.com|unpkg\.com|jsdelivr\.net)$/.test(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
const p = await ctx.newPage();
for (const u of process.argv.slice(2)) {
  await p.goto('https://sunrooof.com' + u, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } });
  await p.waitForTimeout(1500);
  const imgs = await p.evaluate(() => [...document.querySelectorAll('main img')].map(i => ({ alt: i.alt, src: (i.currentSrc || i.src).split('?')[0], w: i.naturalWidth, h: i.naturalHeight })).filter(i => i.src && !/undefined|\.svg$/.test(i.src)));
  await fs.writeFile('artifacts/content-full/images_' + (u.replace(/\W+/g, '_') || 'home') + '.json', JSON.stringify(imgs, null, 1));
  console.log(u, imgs.length);
}
await b.close();
