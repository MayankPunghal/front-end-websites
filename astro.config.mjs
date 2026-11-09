import { defineConfig } from 'astro/config';

// Every site lives under its own route; the root page is the dashboard.
export default defineConfig({
  site: 'https://mayankpunghal.github.io',
  base: '/front-end-websites',
  output: 'static',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
