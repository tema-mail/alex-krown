/** robots.txt: на боевом домене (PUBLIC_INDEX=1) – всё открыто, кроме служебного, и ссылка на карту сайта;
    на показе в GitHub Pages – закрыто (GitHub Actions всё равно кладёт сюда Disallow: /, см. .github/workflows). */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const body =
    import.meta.env.PUBLIC_INDEX === '1'
      ? [
          'User-agent: *',
          `Disallow: ${base}/v1/admin/`,
          `Disallow: ${base}/v1/lk/`,
          `Disallow: ${base}/v1/order/`,
          `Disallow: ${base}/v1/favorites/`,
          `Disallow: ${base}/concepts/`,
          `Disallow: ${base}/new/`,
          '',
          `Sitemap: ${new URL(`${base}/v1/sitemap.xml`, site).href}`,
          '',
        ].join('\n')
      : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
