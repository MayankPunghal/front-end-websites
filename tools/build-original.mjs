// Publishes the first rebuild (branch main) inside this site at /original/. Run once after main changes:
//   git worktree add artifacts/_tmp/main-wt main && (cd artifacts/_tmp/main-wt && npm ci && npx astro build) && node tools/build-original.mjs
// That site uses root-relative URLs throughout, so they are rewritten to its new home.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'artifacts/_tmp/main-wt/dist', OUT = 'public/original', PRE = '/front-end-websites/original';
const DIRS = '_astro|brand|video|img|ig|fonts|pages|products|collections|blogs|policies|favicon\\.svg';

const rewrite = text => text
  .replace(/(\s(?:href|src|poster|action|data-[\w-]+)=["'])\/(?![/])/g, `$1${PRE}/`)
  .replace(/srcset="([^"]*)"/g, (_, v) => `srcset="${v.replace(/(^|,\s*)\/(?!\/)/g, `$1${PRE}/`)}"`)
  .replace(/return`\/`\+/g, 'return`' + PRE + '/`+') // Vite's preload helper
  .replace(/url\((["']?)\/(?!\/)/g, `url($1${PRE}/`)
  .replace(/(content="\d+;\s*url=)\/(?!\/)/g, `$1${PRE}/`)
  .replace(new RegExp(`(["'\`])/(${DIRS})(?=[/"'\`?#])`, 'g'), `$1${PRE}/$2`);

fs.rmSync(OUT, { recursive: true, force: true });
let n = 0;
for (const entry of fs.readdirSync(SRC, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const from = path.join(entry.parentPath, entry.name), to = path.join(OUT, path.relative(SRC, from));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (/\.(html|css|js|json)$/.test(entry.name)) fs.writeFileSync(to, rewrite(fs.readFileSync(from, 'utf8'))); else fs.copyFileSync(from, to);
  n++;
}
console.log(n, 'files written to', OUT);
