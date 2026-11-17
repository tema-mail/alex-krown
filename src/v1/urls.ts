/** Адреса разделов «каталог/раздел/подраздел» (владелец 17.11.2026): разделы, которые в данных лежат в корне
    (hats, menshoes…), на сайте живут внутри каталога – /catalog/hats/. Без JSON – модуль нужен и островам. */
export const TOP_SECTIONS = new Set(['accessories', 'hats', 'menshoes', 'womenshoes', 'perfume', 'socks', 'sale', 'firmware']);
export const trimPath = (p: string) => p.replace(/^\/+|\/+$/g, '');
export function sectionUrl(path: string) {
  const p = trimPath(path);
  return TOP_SECTIONS.has(p.split('/')[0]) ? `catalog/${p}` : p;
}
/** Хвост адреса товара – название без номера Тильды: 296025952292-beisbolka-… → beisbolka-… */
export const productSlug = (path: string) => trimPath(path).split('/').pop()!.replace(/^\d+-/, '');
