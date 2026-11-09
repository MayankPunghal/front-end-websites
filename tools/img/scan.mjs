import fs from 'node:fs'; import path from 'node:path';
const BAD = '"\'\\s)<>\\\\';
const re = new RegExp(`https?://[^${BAD}]+?\\.(?:png|jpe?g|webp|gif|avif)(?=[?${BAD}]|$)`, 'gi');
const set = new Map();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(astro|ts|json|css)$/.test(e.name)) for (const m of fs.readFileSync(p, 'utf8').matchAll(re)) { const u = m[0].replace(/^http:/, 'https:'); set.set(u, (set.get(u) || new Set()).add(p)); } });
walk('src');
const hosts = {}; for (const u of set.keys()) { const h = new URL(u).host; hosts[h] = (hosts[h] || 0) + 1; }
console.log(set.size, hosts);
fs.writeFileSync('artifacts/_tmp/remote-urls.json', JSON.stringify([...set.keys()], null, 1));
