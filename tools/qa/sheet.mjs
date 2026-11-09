// Contact sheet of final-audit "__top" shots, and an old-vs-new comparison sheet against artifacts/reference-audit.
import sharp from 'sharp'; import fs from 'node:fs/promises';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (t, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26"><rect width="100%" height="100%" fill="#15120e"/><text x="8" y="18" font-family="sans-serif" font-size="13" fill="#f3eee4">${esc(t)}</text></svg>`);
async function grid(items, W, cols, out) {
  const tiles = await Promise.all(items.map(async ([f, t]) => { const im = await sharp(f).resize({ width: W }).png().toBuffer(); const m = await sharp(im).metadata(); const h = Math.min(m.height, Math.round(W * 1.3)); return { im: await sharp(im).extract({ left: 0, top: 0, width: W, height: h }).toBuffer(), h, t }; }));
  const rows = []; for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));
  const rh = rows.map(r => Math.max(...r.map(x => x.h)) + 26 + 8); const H = rh.reduce((a, b) => a + b, 0);
  const comps = []; let y = 0;
  rows.forEach((r, ri) => { r.forEach((x, ci) => { const left = ci * (W + 8); comps.push({ input: label(x.t, W), left, top: y }, { input: x.im, left, top: y + 26 }); }); y += rh[ri]; });
  await sharp({ create: { width: cols * (W + 8), height: H, channels: 3, background: '#e9e2d3' } }).composite(comps).png().toFile(out);
}
for (const vp of ['desktop', 'mobile']) {
  const dir = `artifacts/final-audit/${vp}`, fs_ = (await fs.readdir(dir)).filter(f => f.endsWith('__top.png')).sort();
  await grid(fs_.map(f => [`${dir}/${f}`, f.replace(`__${vp}__top.png`, '') || 'home']), vp === 'desktop' ? 360 : 180, vp === 'desktop' ? 4 : 8, `artifacts/final-audit/contact-sheet-${vp}.png`);
}
const pairs = [['home', '_'], ['pages_gallery', '_pages_gallery'], ['products_modern_white', '_products_modern_white'], ['pages_faqs', '_pages_faqs'], ['pages_contact_us', '_pages_contact_us']];
for (const vp of ['desktop', 'mobile']) {
  const items = [];
  for (const [o, n] of pairs) { items.push([`artifacts/reference-audit/${vp}/${o}__viewport.png`, `BEFORE ${o}`], [`artifacts/final-audit/${vp}/${n}__${vp}__top.png`, `AFTER ${o}`]); }
  await grid(items, vp === 'desktop' ? 420 : 200, vp === 'desktop' ? 4 : 10, `artifacts/final-audit/comparison-${vp}.png`);
}
console.log('ok');
