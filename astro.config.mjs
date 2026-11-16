import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dev only (both rules below): static sites copied into public/ (e.g. /sunroof/) link to folders, as GitHub Pages serves them. The dev server
// would 404 on those, so a folder URL with an index.html inside is answered with that file.
const pub = fileURLToPath(new URL('./public/', import.meta.url));
const folderIndex = {
  name: 'folder-index',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url.split('?')[0], rest = url.replace(/^\/front-end-websites\//, '');
      // Vite serves large files at well under 1 MB/s, so the hero films come straight off disk (with byte ranges for seeking)
      const film = rest.endsWith('.mp4') && path.join(pub, decodeURIComponent(rest));
      if (film && fs.existsSync(film)) {
        const size = fs.statSync(film).size, m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || ''), a = m ? +m[1] : 0, z = m && m[2] ? +m[2] : size - 1;
        res.writeHead(m ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': z - a + 1, ...(m && { 'Content-Range': `bytes ${a}-${z}/${size}` }) });
        return fs.createReadStream(film, { start: a, end: z }).pipe(res);
      }
      if (rest && !path.extname(rest) && fs.existsSync(path.join(pub, rest, 'index.html'))) req.url = url.replace(/\/?$/, '/index.html') + req.url.slice(url.length);
      // the watcher skips these copied sites (below), so Vite never learns of files a rebuild adds: serve them off disk
      const file = /^sunroo+f\//.test(rest) && path.join(pub, decodeURIComponent(req.url.split('?')[0].replace(/^\/front-end-websites\//, '')));
      if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }[path.extname(file)];
        res.writeHead(200, { 'Content-Type': type || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        return fs.createReadStream(file).pipe(res);
      }
      next();
    });
  },
};

// Every site lives under its own route; the root page is the dashboard.
export default defineConfig({
  site: 'https://mayankpunghal.github.io',
  base: '/front-end-websites',
  output: 'static',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  // artifacts/ holds render frames, worktrees and their builds: watching it floods the dev server after every rebuild,
  // and while it churns it serves the hero films at well under 1 MB/s
  vite: { plugins: [folderIndex], server: { watch: { ignored: ['**/artifacts/**', '**/public/sunrooof/film/**', '**/public/sunroof/**'] } } },
});
