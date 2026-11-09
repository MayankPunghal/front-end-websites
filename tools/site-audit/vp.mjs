import { chromium } from 'playwright';
import sharp from 'sharp';
const [sec, step, n, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'cookie_consent', value: '1', domain: 'sunrooof.com', path: '/' }]);
const p = await ctx.newPage();
await p.goto('https://sunrooof.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(3500);
await p.addStyleTag({ content: '#shopify-pc__banner,.shopify-pc__banner{display:none!important}' });
for (let y = 0; y < 20000; y += 700) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(120); }
const top = await p.evaluate(s => { const e = document.querySelector('[id*="' + s + '"]'); return e.getBoundingClientRect().top + scrollY; }, sec);
const bufs = [];
for (let k = 0; k < n; k++) { await p.evaluate(y => scrollTo(0, y), top + k * step); await p.waitForTimeout(1500); bufs.push(await sharp(await p.screenshot()).resize(720).jpeg({ quality: 70 }).toBuffer()); }
const cols = 2, rows = Math.ceil(n / cols);
await sharp({ create: { width: 720 * cols, height: 450 * rows, channels: 3, background: '#888' } }).composite(bufs.map((b, i) => ({ input: b, left: (i % cols) * 720, top: Math.floor(i / cols) * 450 }))).jpeg({ quality: 75 }).toFile(out);
await b.close();
