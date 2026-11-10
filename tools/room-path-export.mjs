// Exports the film's camera and daylight for every 2nd frame where the room is on screen, for the Blender render.
// Needs the preview server on 4322. Usage: node tools/room-path-export.mjs  ->  artifacts/blender/path.json
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto('http://localhost:4322/front-end-websites/sunrooof/scene/');
await p.waitForFunction(() => window.frameAt && window.world, null, { timeout: 120000 });
const keys = await p.evaluate(() => {
  const out = [], { camera, room, sun } = window.world.parts;
  for (let i = 0; i < 1440; i += 2) {
    window.frameAt(i, 1440);
    if (!room.visible) continue;
    out.push({ i, p: camera.position.toArray(), q: camera.quaternion.toArray(), fov: camera.fov, sunDir: sun.position.clone().sub(sun.target.position).normalize().toArray(), sunCol: sun.color.toArray(), sunI: sun.intensity });
  }
  return out;
});
fs.mkdirSync('artifacts/blender', { recursive: true });
fs.writeFileSync('artifacts/blender/path.json', JSON.stringify(keys));
console.log(keys.length, 'room frames');
await b.close();
