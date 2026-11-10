// Exports the three.js room at one film frame to artifacts/blender/room.glb plus camera and sun (room.json).
// Needs the preview server on 4322. Usage: node tools/room-to-blender.mjs [frame] [wall]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [frame = '250', mount = 'ceiling'] = process.argv.slice(2);
const b = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on('pageerror', e => console.log('page error', e.message));
await p.goto('http://localhost:4322/front-end-websites/sunrooof/scene/' + (mount === 'wall' ? '?mount=wall' : ''));
await p.waitForFunction(() => window.exportRoom, null, { timeout: 120000 });
const r = await p.evaluate(i => window.exportRoom(i, 1440), +frame);
fs.mkdirSync('artifacts/blender', { recursive: true });
fs.writeFileSync('artifacts/blender/room.glb', Buffer.from(r.glb, 'base64'));
delete r.glb; fs.writeFileSync('artifacts/blender/room.json', JSON.stringify(r, null, 1));
console.log(JSON.stringify(r));
await b.close();
