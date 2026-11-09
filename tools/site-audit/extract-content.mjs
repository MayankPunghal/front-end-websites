// Dumps text, headings, images, videos and (for products) Shopify product JSON for every sitemap route.
// Usage: node tools/site-audit/extract-content.mjs [--only=substr] [--conc=2]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const ORIGIN = 'https://sunrooof.com';
const OUT = path.resolve('artifacts/content');
const ONLY = arg('only', '');
const CONC = +arg('conc', 1);
const slug = u => (new URL(u).pathname.replace(/^\/|\/$/g, '') || 'home').replace(/[^a-z0-9]+/gi, '_').slice(0, 90);

const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] }); // local DNS is wrong for this domain
const boot = await (await browser.newContext()).newPage();
await boot.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
const urls = new Set([ORIGIN]);
const walk = async sm => {
  const xml = await boot.evaluate(x => fetch(x).then(r => r.text()), sm);
  for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const l = loc.replace(/&amp;/g, '&');
    if (!l.startsWith(ORIGIN) || l.includes('/he/')) continue;
    /sitemap.*\.xml/.test(l) ? await walk(l) : urls.add(l.replace(/\/$/, ''));
  }
};
await walk(`${ORIGIN}/sitemap.xml`);
for (const p of ['/collections', '/collections/all', '/policies/privacy-policy', '/policies/refund-policy', '/policies/shipping-policy', '/policies/terms-of-service']) urls.add(ORIGIN + p);
await fs.mkdir(OUT, { recursive: true });

const queue = [...urls].filter(u => u.includes(ONLY));
console.log(queue.length, 'urls');
const worker = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/*', r => { const h = new URL(r.request().url()).hostname; return /(^|.)(sunrooof.com|shopify.com|googleapis.com|gstatic.com|unpkg.com|jsdelivr.net)$/.test(h) ? r.continue() : r.abort(); }); // skip analytics/pixels: they stall loads and aren't layout
  const page = await ctx.newPage();
  while (queue.length) {
    const url = queue.shift();
    if (await fs.stat(path.join(OUT, slug(url) + '.json')).then(() => true, () => false)) continue;
    try {
      for (let t = 0; ; t++) { try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); break; } catch (e) { if (t >= 3) throw e; await page.waitForTimeout(4000 * (t + 1)); } }
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } });
      const data = await page.evaluate(() => {
        const abs = u => { try { return new URL(u, location.href).href; } catch { return null; } };
        const main = document.querySelector('main') || document.body;
        return {
          url: location.href,
          title: document.title,
          description: document.querySelector('meta[name=description]')?.content || '',
          ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
          outline: [...main.querySelectorAll('h1,h2,h3,h4')].map(h => `${h.tagName} ${h.innerText.trim().replace(/\s+/g, ' ')}`).filter(s => s.length > 3),
          text: main.innerText.replace(/\n{3,}/g, '\n\n').trim(),
          images: [...new Set([...main.querySelectorAll('img')].map(i => abs(i.currentSrc || i.dataset.src || i.src)).filter(Boolean))].map(s => s.split('?')[0]),
          imageAlts: [...main.querySelectorAll('img')].map(i => i.alt).filter(Boolean),
          videos: [...main.querySelectorAll('video,source,iframe')].map(v => abs(v.src || v.currentSrc)).filter(Boolean),
          links: [...new Set([...main.querySelectorAll('a[href]')].map(a => `${a.innerText.trim().replace(/\s+/g, ' ').slice(0, 50)} => ${a.href}`))].slice(0, 80),
        };
      });
      if (/\/products\/[^/]+$/.test(url)) data.shopify = await page.evaluate(u => fetch(u + '.js').then(r => r.json()).catch(() => null), new URL(url).pathname);
      await fs.writeFile(path.join(OUT, slug(url) + '.json'), JSON.stringify(data, null, 1));
      console.log('✓', url.replace(ORIGIN, '') || '/');
    } catch (e) { console.log('✗', url, e.message.split('\n')[0]); }
  }
  await ctx.close();
};
await Promise.all(Array.from({ length: CONC }, worker));
await browser.close();
