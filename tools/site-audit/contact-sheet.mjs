// Builds contact sheets (grid of viewport thumbnails with labels, plus tall full-page strips).
// Usage: node tools/site-audit/contact-sheet.mjs [--dir=artifacts/reference-audit]
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve((process.argv.find(a => a.startsWith('--dir=')) || '').slice(6) || 'artifacts/reference-audit');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

for (const vp of ['desktop', 'mobile']) {
  const all = (await fs.readdir(path.join(DIR, vp))).filter(f => f.endsWith('__viewport.png')).sort();
  const W = vp === 'desktop' ? 360 : 180;
  const H = vp === 'desktop' ? 250 : 390;
  const COLS = vp === 'desktop' ? 5 : 10;
  const PER = COLS * (vp === 'desktop' ? 4 : 3); // sheet size
  for (let s = 0; s * PER < all.length; s++) {
    const files = all.slice(s * PER, (s + 1) * PER);
    const rows = Math.ceil(files.length / COLS);
    const cellH = H + 26;
    const tiles = await Promise.all(files.map(async (f, i) => {
      const img = await sharp(path.join(DIR, vp, f)).resize(W, H, { fit: 'cover', position: 'top' }).png().toBuffer();
      const label = Buffer.from(`<svg width="${W}" height="24"><text x="2" y="16" font-family="Arial" font-size="12" fill="#ddd">${esc(f.replace('__viewport.png', ''))}</text></svg>`);
      return [
        { input: img, left: (i % COLS) * (W + 8), top: Math.floor(i / COLS) * cellH },
        { input: label, left: (i % COLS) * (W + 8), top: Math.floor(i / COLS) * cellH + H + 2 },
      ];
    }));
    await fs.mkdir(path.join(DIR, 'contact-sheets'), { recursive: true });
    await sharp({ create: { width: COLS * (W + 8), height: rows * cellH, channels: 3, background: '#111' } })
      .composite(tiles.flat()).png().toFile(path.join(DIR, 'contact-sheets', `${vp}-${String(s + 1).padStart(2, '0')}.png`));
  }
}
console.log('contact sheets →', path.join(DIR, 'contact-sheets'));
