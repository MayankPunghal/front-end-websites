// Dump collapsed/hidden text too (textContent) for chosen routes: node dump-text.mjs /pages/faqs /products/modern-white
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] });
const ctx = await b.newContext(); await ctx.route('**/*', r => /(^|\.)(sunrooof\.com|shopify\.com|googleapis\.com|gstatic\.com|unpkg\.com|jsdelivr\.net)$/.test(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
const p = await ctx.newPage();
await fs.mkdir('artifacts/content-full', { recursive: true });
for (const u of process.argv.slice(2)) {
  await p.goto('https://sunrooof.com' + u, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  const t = await p.evaluate(() => [...(document.querySelector('main') || document.body).querySelectorAll('script,style,noscript,template,svg')].forEach(e => e.remove()) || (document.querySelector('main') || document.body).textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n'));
  await fs.writeFile('artifacts/content-full/' + (u.replace(/\W+/g, '_') || 'home') + '.txt', t);
  console.log(u, t.length);
}
await b.close();
