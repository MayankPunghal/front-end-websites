// Viewport shot per home section (scrolled gradually so lazy images and pins settle), montaged 2-up.
import { chromium } from 'playwright';
import sharp from 'sharp';
const [base, out, w = 1440, h = 900, sels] = [process.argv[2] || 'http://localhost:4321/', process.argv[3] || 'artifacts/_tmp/home.jpg', +(process.argv[4] || 1440), +(process.argv[5] || 900), process.argv[6]];
const S = (sels || '.sun,.vs,.app,.eng,.man,.sky,.ds,.rsp,.tp,.mq,.nod,.rv,.vt,.ct,.wo,.vn,.bl,.git,.fq').split(',');
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
await p.goto(base, { waitUntil: 'load' }); await p.waitForTimeout(1500);
const total = await p.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += 500) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(90); }
const bufs = [];
for (const s of S) {
  const y = await p.evaluate(s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : -1; }, s);
  if (y < 0) { console.log('missing', s); continue; }
  await p.evaluate(y => scrollTo(0, y - 72 + 1), y); await p.waitForTimeout(1600);
  bufs.push(await sharp(await p.screenshot()).resize(720).jpeg({ quality: 70 }).toBuffer());
}
const ph = Math.round(720 * h / w), cols = 2, rows = Math.ceil(bufs.length / cols);
await sharp({ create: { width: 720 * cols, height: ph * rows, channels: 3, background: '#888' } }).composite(bufs.map((b, i) => ({ input: b, left: (i % cols) * 720, top: Math.floor(i / cols) * ph }))).jpeg({ quality: 72 }).toFile(out);
console.log('ok', bufs.length, ph);
await b.close();
