// Adds intrinsic width/height to src/data/projects.json (needed for CLS-free galleries). Fetches a 64px-wide rendition: aspect only.
import fs from 'node:fs'; import sharp from 'sharp';
const f = 'src/data/projects.json'; const p = JSON.parse(fs.readFileSync(f, 'utf8'));
const meta = async url => { const full = await fetch(url + '?width=2000').then(r => r.arrayBuffer()).then(b => sharp(Buffer.from(b)).metadata()); return full; };
await Promise.all(p.map(async x => { try { const m = await meta(x.image); x.w = m.width; x.h = m.height; } catch { x.w = 1200; x.h = 900; } }));
fs.writeFileSync(f, JSON.stringify(p, null, 1)); console.log('sized', p.length);
