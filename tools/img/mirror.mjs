// Mirror every remote image the site uses into public/img (WebP at several widths) + a tiny blurred placeholder,
// and write src/data/img-manifest.json. Re-run any time: already-mirrored images are skipped.
// Sources: static scan of src/, live-images.json, and artifacts/_tmp/missing-img.json (written by the build when a URL is unmapped).
import fs from 'node:fs'; import path from 'node:path'; import { execFile } from 'node:child_process'; import { promisify } from 'node:util'; import sharp from 'sharp';
import { key, id } from '../../src/lib/imgkey.mjs';
const run = promisify(execFile);
const BUCKETS = [360, 720, 1100, 1600, 2200];
const BAD = '"\'\\s)<>\\\\';
const re = new RegExp(`https?://[^${BAD}]+?\\.(?:png|jpe?g|webp|gif|avif)(?=[?${BAD}]|$)`, 'gi');
const urls = new Set();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(astro|ts|json|css|mjs)$/.test(e.name) && !p.endsWith('img-manifest.json')) for (const m of fs.readFileSync(p, 'utf8').matchAll(re)) urls.add(key(m[0])); });
walk('src');
const extra = 'artifacts/_tmp/missing-img.json'; if (fs.existsSync(extra)) JSON.parse(fs.readFileSync(extra, 'utf8')).forEach(u => urls.add(key(u)));

const mf = 'src/data/img-manifest.json';
const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {};
fs.mkdirSync('public/img', { recursive: true });
const list = [...urls].filter(u => !manifest[u] && !manifest['!' + u]);
console.log('to mirror', list.length, 'already', Object.keys(manifest).length);

const fetchBuf = async u => {
  const host = new URL(u).host;
  const args = ['-sL', '--fail', '--max-time', '60', '--retry', '2', ...(host === 'sunrooof.com' ? ['--resolve', 'sunrooof.com:443:23.227.38.32'] : []), host.includes('shopify') || host === 'sunrooof.com' ? u + '?width=2200' : u];
  const { stdout } = await run('curl', args, { encoding: 'buffer', maxBuffer: 80 << 20 });
  return stdout;
};
let n = 0, fail = [];
const one = async u => {
  try {
    const buf = await fetchBuf(u), meta = await sharp(buf).metadata();
    const w = meta.width, h = meta.height, i = id(u), bs = [];
    for (const b of BUCKETS) {
      const tw = Math.min(b, w);
      if (bs.length && tw <= bs[bs.length - 1]) break;
      await sharp(buf).resize({ width: tw, withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toFile(`public/img/${i}-${tw}.webp`);
      bs.push(tw);
    }
    const lq = await sharp(buf).resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
    manifest[u] = { i, w, h, bs, a: meta.hasAlpha ? 1 : 0, lq: 'data:image/webp;base64,' + lq.toString('base64') };
  } catch (e) { console.log('ERR', u, String(e.message).slice(0, 120)); fail.push(u); manifest['!' + u] = 1; }
  if (++n % 50 === 0) console.log(n, '/', list.length);
};
const q = [...list]; await Promise.all(Array.from({ length: 8 }, async () => { for (let u; (u = q.shift());) await one(u); }));
fs.writeFileSync(mf, JSON.stringify(manifest));
console.log('done; failed', fail.length); fail.forEach(u => console.log(' FAIL', u));
