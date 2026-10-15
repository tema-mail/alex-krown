import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

/* GitHub Pages отдаёт сайт из подпапки /alex-krown/ – её задаёт PUBLIC_BASE
   при сборке в CI; локально сайт живёт в корне. */
export default defineConfig({
  /* адрес для canonical, sitemap и фидов: на показе – GitHub Pages, на боевом – домен бренда */
  site: process.env.PUBLIC_SITE_URL || 'https://tema-mail.github.io',
  /* острова магазина «Вариант 1» (корзина, избранное, заказ) – Preact, правило владельца для сайтов */
  integrations: [preact()],
  base: process.env.PUBLIC_BASE || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
});
