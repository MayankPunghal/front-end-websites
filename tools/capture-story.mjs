// Films the 3D scene into the homepage video. Needs the built site running on port 4323, a real GPU, and about 15 minutes.
//   node tools/capture-story.mjs landscape|portrait [wall]
// Frames go to artifacts/_tmp/frames/<name>; the timeline the page needs for its labels and clock goes to public/sunrooof/film/<name>.json.
import { chromium } from 'playwright';
import fs from 'node:fs';

const shape = process.argv[2], wall = process.argv[3] === 'wall', name = shape + (wall ? '-wall' : ''), [width, height, n] = shape === 'portrait' ? [1080, 1920, 720] : [1920, 1080, 1440];
const dir = `artifacts/_tmp/frames/${name}`; fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync('public/sunrooof/film', { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1.5 })).newPage();
page.on('pageerror', e => console.log('page error', e.message));
await page.goto('http://localhost:4322/front-end-websites/sunrooof/scene/' + (wall ? '?mount=wall' : ''));
await page.waitForFunction(() => window.frameAt, null, { timeout: 60000 });

const tod = [], labels = {}; const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const f = await page.evaluate(([i, n]) => window.frameAt(i, n), [i, n]);
  fs.writeFileSync(`${dir}/f${String(i).padStart(5, '0')}.jpg`, Buffer.from(f.url.split(',')[1], 'base64'));
  if (i % 8 === 0) tod.push(+f.tod.toFixed(3));
  if (f.labels && i % 4 === 0) labels[i] = f.labels.flat().map(v => +v.toFixed(4));
  if (i % 60 === 0) console.log(i, '/', n, Math.round((Date.now() - t0) / 1000) + 's');
}
fs.writeFileSync(`public/sunrooof/film/${name}.json`, JSON.stringify({ n, fps: 120, tod, labels }));
console.log('done', name, Math.round((Date.now() - t0) / 1000) + 's');
await browser.close();
