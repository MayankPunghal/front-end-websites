// Exports the night building from the three.js film to artifacts/blender/city.glb, plus the scroll position of every
// second frame (city.json), for the end of the Blender film. Needs the dev server on 4321.
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on('pageerror', e => console.log('page error', e.message));
await p.goto('http://localhost:4321/front-end-websites/sunrooof/scene/');
await p.waitForFunction(() => window.exportCity, null, { timeout: 180000 });
const r = await p.evaluate(() => window.exportCity(1440));
fs.writeFileSync('artifacts/blender/city.glb', Buffer.from(r.glb, 'base64'));
delete r.glb; fs.writeFileSync('artifacts/blender/city.json', JSON.stringify(r));
console.log(JSON.stringify(r.parts), r.ps.length);
await b.close();
