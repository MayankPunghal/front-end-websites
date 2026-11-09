import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';

// Static site. Routes mirror sunrooof.com (/products/*, /collections/*, /pages/*, /policies/*, /blogs/*).
// Routes the old site had that no longer exist as pages redirect to their closest equivalent.
const projects = JSON.parse(readFileSync(new URL('./src/data/projects.json', import.meta.url), 'utf8'));
const redirects = {
  '/pages/our-team': '/pages/about-us',
  '/pages/booking-form': '/pages/contact-us',
  '/pages/book-a-site-visit': '/pages/contact-us',
  '/pages/sunwindow': '/collections/all',
  '/pages/sunwindow-pdp': '/collections/all',
  '/pages/custom-all-products': '/collections/all',
  '/collections/frontpage': '/collections/all',
  '/collections/all-collection': '/collections/all',
  '/blogs/delivered-sites': '/pages/gallery',
  ...Object.fromEntries(projects.map(p => [`/blogs/delivered-sites/${p.handle}`, '/pages/gallery'])),
};

export default defineConfig({
  site: 'https://sunrooof.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  redirects,
});
