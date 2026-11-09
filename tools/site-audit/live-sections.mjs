import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--host-resolver-rules=MAP sunrooof.com 23.227.38.32'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('https://sunrooof.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(3000);
const ids = await p.$$eval('[id^="shopify-section-template--30044460908704__"]', e => e.map(x => x.id));
let n = 0;
for (const id of [...new Set(ids)]) {
  const el = await p.$('#' + id);
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(1800);
  await el.screenshot({ path: `artifacts/live/sec/${String(++n).padStart(2, '0')}-${id.split('__')[1]}.png`, timeout: 30000 }).catch(e => console.log('fail', id));
}
console.log(n);
await b.close();
