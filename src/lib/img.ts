// Swaps every remote CDN image in rendered HTML for its local mirror (tools/img/mirror.mjs) and adds the blurred
// placeholder, so pages never depend on the CDN. Anything not mirrored yet stays remote and is logged for the next mirror run.
import fs from 'node:fs';
import manifest from '../data/img-manifest.json';
import { key } from './imgkey.mjs';

type E = { i: string; w: number; h: number; bs: number[]; a: number; lq: string };
const M = manifest as Record<string, E | number>;
const byId = new Map<string, E>(Object.values(M).filter((e): e is E => typeof e === 'object').map(e => [e.i, e]));
const BAD = '"\'\\s)<>\\\\';
const URL_RE = new RegExp(`https?://[^${BAD}]+?\\.(?:png|jpe?g|webp|gif|avif)(\\?[^${BAD},]*)?(?=[${BAD},]|$)`, 'gi');
const missing = new Set<string>();

export const local = (url: string, w = 1600): string | null => {
  const e = M[key(url)];
  if (!e || typeof e !== 'object') return null;
  return `/img/${e.i}-${e.bs.find(b => b >= w) ?? e.bs[e.bs.length - 1]}.webp`;
};

export const localize = (html: string): string => {
  html = html.replace(URL_RE, (m, q?: string) => {
    const w = Number(/[?&]width=(\d+)/.exec(q ?? '')?.[1]) || undefined;
    const l = local(m.replace(/\?.*$/, ''), w);
    if (!l) { if (!M['!' + key(m.replace(/\?.*$/, ''))]) missing.add(m.replace(/\?.*$/, '')); return m; }
    return l;
  });
  if (missing.size) { try { fs.mkdirSync('artifacts/_tmp', { recursive: true }); fs.writeFileSync('artifacts/_tmp/missing-img.json', JSON.stringify([...missing])); } catch {} }
  return html.replace(/<img\b[^>]*>/g, tag => {
    const id = /\ssrc="\/img\/([0-9a-f]{10})-/.exec(tag)?.[1], e = id ? byId.get(id) : undefined;
    if (!e) return tag;
    if (!/\sloading=/.test(tag)) tag = tag.replace('<img', '<img loading="lazy" decoding="async"');
    if (e.a || e.w < 300) return tag; // transparent logos: a backdrop would show through
    const bg = `background:url(${e.lq}) center/cover no-repeat;`;
    tag = /\sstyle="/.test(tag) ? tag.replace(/\sstyle="/, ` style="${bg}`) : tag.replace('<img', `<img style="${bg}"`);
    return tag.replace('<img', '<img data-lq');
  });
};
