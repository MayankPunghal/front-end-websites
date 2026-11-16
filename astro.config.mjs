import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dev only: static sites copied into public/ (e.g. /sunroof/) link to folders, as GitHub Pages serves them. The dev server
// would 404 on those, so a folder URL with an index.html inside is answered with that file.
const pub = fileURLToPath(new URL('./public/', import.meta.url));
const folderIndex = {
  name: 'folder-index',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url.split('?')[0], rest = url.replace(/^\/front-end-websites\//, '');
      if (rest && !path.extname(rest) && fs.existsSync(path.join(pub, rest, 'index.html'))) req.url = url.replace(/\/?$/, '/index.html') + req.url.slice(url.length);
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
  vite: { plugins: [folderIndex] },
});
