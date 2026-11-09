// Live reference viewport (left) vs local (right), one row per route.
import { chromium } from 'playwright';
import sharp from 'sharp';
const routes = process.argv.slice(3);
const out = process.argv[2];
const refName = r => r.replace(/^\//, '').replace(/[\/-]/g, '_') + '__viewport.png';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const rows = [];
for (const r of routes) {
  await p.goto('http://localhost:4321' + r, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  const mine = await sharp(await p.screenshot()).resize(720).jpeg({ quality: 70 }).toBuffer();
  const ref = await sharp('artifacts/reference-audit/desktop/' + refName(r)).resize(720, 450, { fit: 'cover', position: 'top' }).jpeg({ quality: 70 }).toBuffer();
  rows.push([ref, mine]);
}
await sharp({ create: { width: 1440, height: 450 * rows.length, channels: 3, background: '#888' } }).composite(rows.flatMap(([a, c], i) => [{ input: a, left: 0, top: i * 450 }, { input: c, left: 720, top: i * 450 }])).jpeg({ quality: 72 }).toFile(out);
await b.close();
