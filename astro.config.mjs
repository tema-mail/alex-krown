import { defineConfig } from 'astro/config';

/* GitHub Pages отдаёт сайт из подпапки /alex-krown/ – её задаёт PUBLIC_BASE
   при сборке в CI; локально сайт живёт в корне. */
export default defineConfig({
  site: 'https://tema-mail.github.io',
  base: process.env.PUBLIC_BASE || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
});
