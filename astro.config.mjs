import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://spot-on.software',
  devToolbar: { enabled: false },
  build: { inlineStylesheets: 'auto' },
});
