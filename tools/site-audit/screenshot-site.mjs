// Reusable site screenshot audit.
// Usage: node tools/site-audit/screenshot-site.mjs [--base=https://sunrooof.com] [--out=artifacts/reference-audit] [--only=substring] [--conc=4]
// Discovers routes from sitemap + homepage links, shoots desktop/mobile viewport + full-page,
// records HTTP failures / JS errors, dedupes query-string URLs, captures product option states.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'https://sunrooof.com').replace(/\/$/, '');
const OUT = path.resolve(arg('out', 'artifacts/reference-audit'));
const ONLY = arg('only', '');
const CONC = +arg('conc', 3);
const SAMPLE = +arg('sample', 12); // repeated-template article pages (delivered-sites, news): shoot only the first N
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 1000 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const origin = new URL(BASE).origin;
const slug = u => (new URL(u).pathname.replace(/^\/|\/$/g, '') || 'home').replace(/[^a-z0-9]+/gi, '_').slice(0, 90);
const category = p =>
  p === '/' ? 'home' :
  p.startsWith('/products/') ? 'product' :
  p.startsWith('/collections') ? 'collection' :
  p.startsWith('/blogs/delivered-sites/') ? 'delivered-site' :
  p.startsWith('/blogs/news/') ? 'article' :
  p.startsWith('/blogs/') ? 'blog-index' :
  p.includes('size-guide') || p.includes('size-chart') ? 'size-guide' :
  p.startsWith('/pages/') ? 'page' : 'other';
const norm = u => { const x = new URL(u, origin); x.hash = ''; x.search = ''; return x.href.replace(/\/$/, '') || origin; };

async function discover(ctx) {
  const urls = new Set([origin, ...['/collections', '/collections/all', '/pages/gallery', '/pages/about-us', '/pages/clients', '/pages/contact-us', '/pages/faqs'].map(p => origin + p)]);
  const page = await ctx.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  const get = u => page.evaluate(x => fetch(x).then(r => r.text()), u);
  const walk = async sm => {
    const xml = await get(sm).catch(() => '');
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const l = loc.replace(/&amp;/g, '&');
      if (!l.startsWith(origin) || /\/he\//.test(l)) continue;
      if (/sitemap.*\.xml/.test(l)) await walk(l); else urls.add(norm(l));
    }
  };
  await walk(`${origin}/sitemap.xml`);
  for (const h of await page.$$eval('a[href]', as => as.map(a => a.href))) {
    if (h.startsWith(origin) && !/\/(cart|account|checkout|he)(\/|$)/.test(h) && !/\.(jpg|png|pdf|webp)/i.test(h)) urls.add(norm(h));
  }
  await page.close();
  const rank = u => { const c = category(new URL(u).pathname); return ['home','page','collection','product','size-guide','blog-index','article','delivered-site','other'].indexOf(c); };
  return [...urls].filter(u => u.includes(ONLY)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // scroll through to trigger lazy loading, then return to top
  await page.evaluate(async () => {
    const h = () => document.documentElement.scrollHeight;
    for (let y = 0; y < Math.min(h(), 30000); y += innerHeight * 0.8) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    scrollTo(0, 0);
  });
  await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
  await page.waitForTimeout(400);
}

async function shoot(page, file, full) {
  await page.screenshot({ path: file, fullPage: full, animations: 'disabled', timeout: 60000 }).catch(e => console.error('shot fail', file, e.message.split('\n')[0]));
}

async function auditRoute(browser, url, rec) {
  const cat = category(new URL(url).pathname);
  const entry = { url, category: cat, title: '', status: null, screenshots: {}, httpFailures: [], jsErrors: [], interactive: {}, variants: [] };
  for (const [vp, opts] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ ...opts, locale: 'en-IN' });
    await ctx.route('**/*', r => { const h = new URL(r.request().url()).hostname; return /(^|.)(sunrooof.com|shopify.com|googleapis.com|gstatic.com|unpkg.com|jsdelivr.net)$/.test(h) ? r.continue() : r.abort(); }); // skip analytics/pixels: they stall loads and aren't layout
    const page = await ctx.newPage();
    page.on('pageerror', e => entry.jsErrors.push(`[${vp}] ${e.message.split('\n')[0]}`));
    page.on('response', r => { if (r.status() >= 400) entry.httpFailures.push(`[${vp}] ${r.status()} ${r.url().slice(0, 140)}`); });
    page.on('requestfailed', r => /sunrooof|shopify/.test(r.url()) && entry.httpFailures.push(`[${vp}] FAILED ${r.url().slice(0, 140)}`));
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }));
      entry.status = res ? res.status() : null;
      entry.finalUrl = page.url();
      await settle(page);
      entry.title = await page.title();
      const dir = path.join(OUT, vp); await fs.mkdir(dir, { recursive: true });
      const base = path.join(dir, slug(url));
      await shoot(page, `${base}__viewport.png`, false);
      await shoot(page, `${base}__full.png`, true);
      entry.screenshots[vp] = { viewport: path.relative(OUT, `${base}__viewport.png`), full: path.relative(OUT, `${base}__full.png`) };
      if (vp === 'desktop') {
        entry.interactive = await page.evaluate(() => ({
          forms: [...document.forms].filter(f => !/cart|search|localization/i.test(f.action)).map(f => ({ action: f.action, method: f.method, fields: [...f.elements].map(e => e.name && `${e.name}:${e.type}`).filter(Boolean) })),
          options: [...document.querySelectorAll('input[type=radio],select')].map(e => `${e.name}=${e.value || e.type}`).slice(0, 40),
          buttons: [...new Set([...document.querySelectorAll('button,.btn,[role=button]')].map(e => e.innerText.trim().slice(0, 40)).filter(Boolean))].slice(0, 25),
          videos: document.querySelectorAll('video').length,
          images: document.images.length,
          h1: [...document.querySelectorAll('h1')].map(e => e.innerText.trim().slice(0, 80)),
        }));
        if (cat === 'product') await productStates(page, base, entry);
      }
    } catch (e) { entry.jsErrors.push(`[${vp}] NAV ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }
  rec.push(entry);
  await fs.writeFile(path.join(OUT, 'route-manifest.json'), JSON.stringify(rec, null, 2));
  console.log(`✓ ${cat.padEnd(14)} ${entry.status} ${url.replace(origin, '')}`);
}

// Click each option label (radio) within the product form; shoot the viewport when it changes the page state.
async function productStates(page, base, entry) {
  const labels = await page.$$('label:has(input[type=radio]), .variant-picker label, fieldset label');
  const seen = new Set();
  for (const [i, l] of labels.slice(0, 12).entries()) {
    const txt = ((await l.innerText().catch(() => '')) || `opt${i}`).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (seen.has(txt) || !(await l.isVisible().catch(() => false))) continue;
    seen.add(txt);
    await l.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(600);
    const f = `${base}__opt_${txt.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}.png`;
    await shoot(page, f, false);
    entry.variants.push({ option: txt, screenshot: path.relative(OUT, f), url: page.url() });
  }
}

const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${new URL(BASE).hostname} ${arg('ip', '23.227.38.32')}`] }); // local ISP DNS returns a bogus host for sunrooof.com; pin real IP from public DNS
const bootCtx = await browser.newContext();
const routes = await discover(bootCtx);
await bootCtx.close();
console.log(`${routes.length} routes`);
await fs.mkdir(OUT, { recursive: true });
const rec = await fs.readFile(path.join(OUT, 'route-manifest.json'), 'utf8').then(JSON.parse, () => []).then(r => r.filter(e => e.screenshots.desktop && e.screenshots.mobile)); // resume: keep routes with both viewports
const done = new Set(rec.map(e => e.url));
const seenCat = {};
const queue = routes.filter(u => !done.has(u)).filter(u => { const c = category(new URL(u).pathname); if (c !== 'delivered-site' && c !== 'article') return true; seenCat[c] = (seenCat[c] || 0) + 1; return seenCat[c] <= SAMPLE; });
await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) await auditRoute(browser, queue.shift(), rec); }));
await browser.close();
rec.sort((a, b) => a.url.localeCompare(b.url));
await fs.writeFile(path.join(OUT, 'route-manifest.json'), JSON.stringify(rec, null, 2));
const bad = rec.filter(r => r.status >= 400 || r.jsErrors.length);
await fs.writeFile(path.join(OUT, 'audit-report.md'), [
  `# Crawl report — ${BASE}`, `Routes: ${rec.length}`,
  ...Object.entries(rec.reduce((a, r) => (a[r.category] = (a[r.category] || 0) + 1, a), {})).map(([k, v]) => `- ${k}: ${v}`),
  `\n## Routes with errors (${bad.length})`, ...bad.map(r => `- ${r.url} → ${r.status} ${r.jsErrors.slice(0, 2).join(' | ')}`),
  `\n## HTTP failures (unique hosts)`, ...[...new Set(rec.flatMap(r => r.httpFailures.map(f => f.replace(/^\[\w+\] /, '').split('/')[2])))].map(h => `- ${h}`),
].join('\n'));
console.log('done →', OUT);
