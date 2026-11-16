// Upscales mirrored images whose originals are too small for 2x screens, with the local Real-ESRGAN (x4plus model),
// then rewrites their WebP widths (up to the target) and their manifest entry.
// usage: node tools/img/upscale.mjs list.json   (list = { "<image id>": <target width px>, ... })
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFile } from 'node:child_process'; import { promisify } from 'node:util'; import sharp from 'sharp';
const run = promisify(execFile);
const ESR = path.resolve('../esrgan/bin'), BUCKETS = [360, 720, 1100, 1600, 2200, 2880];
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mf = 'src/data/img-manifest.json', manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
const byId = Object.fromEntries(Object.entries(manifest).filter(([, e]) => e && e.i).map(([u, e]) => [e.i, u]));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-'));
for (const [id, target] of Object.entries(list)) {
  const u = byId[id], e = manifest[u]; if (!e) { console.log('skip, not in manifest', id); continue; }
  const host = new URL(u).host, src = path.join(tmp, id + '.png'), up = path.join(tmp, id + '-x4.png');
  const { stdout } = await run('curl', ['-sL', '--fail', '--max-time', '60', ...(host === 'sunrooof.com' ? ['--resolve', 'sunrooof.com:443:23.227.38.32'] : []), u + '?width=2200'], { encoding: 'buffer', maxBuffer: 80 << 20 });
  const img = sharp(stdout), meta = await img.metadata();
  await img.png().toFile(src); // Real-ESRGAN upscales an alpha channel along with the colour
  await run(path.join(ESR, 'realesrgan-ncnn-vulkan.exe'), ['-i', src, '-o', up, '-n', 'realesrgan-x4plus', '-m', path.join(ESR, 'models')], { cwd: ESR });
  const w = Math.min(target, meta.width * 4), bs = [];
  for (const b of BUCKETS) {
    const tw = Math.min(b, w); if (bs.length && tw <= bs[bs.length - 1]) break;
    await sharp(up).resize({ width: tw }).webp({ quality: 80, effort: 4 }).toFile(`public/img/${id}-${tw}.webp`); bs.push(tw);
  }
  manifest[u] = { ...e, w, h: Math.round(meta.height * w / meta.width), bs, up: 1 };
  console.log(id, meta.width, '->', w, bs.join(' '));
}
fs.writeFileSync(mf, JSON.stringify(manifest));
fs.rmSync(tmp, { recursive: true, force: true });
