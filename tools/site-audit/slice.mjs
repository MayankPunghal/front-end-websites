// Slice a tall full-page screenshot into review chunks: node slice.mjs <png> <outDir> [chunkHeightPx=3000] [outWidth=720]
import sharp from 'sharp'; import fs from 'node:fs/promises'; import path from 'node:path';
const [src, out, ch = '3000', ow = '720'] = process.argv.slice(2);
const { width, height } = await sharp(src).metadata();
await fs.mkdir(out, { recursive: true });
for (let i = 0, y = 0; y < height; i++, y += +ch)
  await sharp(src).extract({ left: 0, top: y, width, height: Math.min(+ch, height - y) }).resize({ width: +ow }).png().toFile(path.join(out, `${path.basename(src, '.png')}_${String(i).padStart(2, '0')}.png`));
