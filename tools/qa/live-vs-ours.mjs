// Full-page screenshots of the live site and ours for the same paths, saved side by side for review.
// usage: node tools/qa/live-vs-ours.mjs /pages/contact-us /pages/gallery ...
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
const paths = process.argv.slice(2);
fs.mkdirSync('artifacts/compare', { recursive: true });
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await ctx.addCookies([{ name: 'cookie_consent', value: '1', domain: 'sunrooof.com', path: '/' }]);
const shot = async (url, file) => {
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(3500);
  await p.addStyleTag({ content: '#shopify-pc__banner,.shopify-pc__banner{display:none!important}' });
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(150); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800);
  const buf = await p.screenshot({ fullPage: true });
  await sharp(buf).resize(720).jpeg({ quality: 72 }).toFile(file);
  await p.close();
};
for (const path of paths) {
  const name = path.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home';
  await shot('https://sunrooof.com' + path, `artifacts/compare/${name}-live.jpg`);
  await shot('http://localhost:4321' + path, `artifacts/compare/${name}-ours.jpg`);
  console.log('ok', name);
}
await b.close();
