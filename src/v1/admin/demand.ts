/** Анализ товарного спроса для админки «Метрика и спрос» и «Точки А».
    Вход – выгрузка Метрики (scripts/tochka-a.mjs → src/data/v1/analytics/metrika.json, вне репо):
    по товару – просмотры карточки, добавления в корзину, купленные штуки и выручка.
    Что считаем и зачем:
    - конверсия просмотр → покупка: какие вещи «продают себя», а какие смотрят и уходят;
    - ABC по выручке: A – товары, дающие первые 80 % выручки, B – следующие 15 %, C – остальное;
    - сегменты: «Хиты» (покупают), «Смотрят, но не покупают» (много просмотров, 0 покупок – цена, фото,
      размеры или описание), «Тихие» (почти не смотрят – витрина и реклама), «Нет данных» (товара не было в отчёте);
    - спрос по каталогам: сумма просмотров и покупок товаров каталога.
    Товары сопоставляются по названию (Метрика хранит название, как его передала Тильда). */
import { allProducts, allSections, sectionName, type Product } from '../site';

export interface MetrikaTable { totals?: number[]; rows?: { dims: string[]; m: number[] }[]; error?: string }
export interface Metrika { period: { from: string; to: string }; collectedAt: string; byMonth: MetrikaTable; salesByMonth: MetrikaTable; sources: MetrikaTable; engines: MetrikaTable; phrases: MetrikaTable; devices: MetrikaTable; cities: MetrikaTable; landing: MetrikaTable; products: MetrikaTable; goals: { id: number; name: string; reaches: number | null }[] }

export interface Demand { p: Product | null; title: string; views: number; baskets: number; qty: number; revenue: number; conv: number; abc: 'A' | 'B' | 'C' | '–'; segment: string }

const norm = (s: string) => s.toLowerCase().replace(/[«»“”"'’]/g, '').replace(/\s+/g, ' ').trim();

export function demand(m: Metrika) {
  const byTitle = new Map(allProducts.map((p) => [norm(p.title), p]));
  const rows = (m.products.rows ?? []).filter((r) => !/доставка/i.test(r.dims[0]));
  const list: Demand[] = rows.map((r) => {
    const [views, baskets, qty, revenue] = r.m;
    return { p: byTitle.get(norm(r.dims[0])) ?? null, title: r.dims[0], views, baskets, qty, revenue, conv: views ? qty / views : 0, abc: '–', segment: '' };
  });
  /* ABC по выручке */
  const total = list.reduce((s, d) => s + d.revenue, 0);
  let acc = 0;
  for (const d of [...list].sort((a, b) => b.revenue - a.revenue)) {
    if (!d.revenue) break;
    acc += d.revenue;
    d.abc = acc / total <= 0.8 || acc === d.revenue ? 'A' : acc / total <= 0.95 ? 'B' : 'C';
  }
  /* сегменты: порог «много смотрят» – верхняя четверть по просмотрам */
  const sorted = list.map((d) => d.views).sort((a, b) => a - b);
  const q75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  for (const d of list) d.segment = d.qty > 0 ? 'Хит' : d.views >= Math.max(q75, 10) ? 'Смотрят, но не покупают' : d.views < 5 ? 'Тихий' : 'Без покупок';
  /* товары каталога, которых нет в отчёте Метрики */
  const seen = new Set(list.map((d) => d.p?.uid).filter(Boolean));
  const unseen = allProducts.filter((p) => !p.hidden && !seen.has(p.uid));
  /* спрос по каталогам */
  const byUid = new Map(list.filter((d) => d.p).map((d) => [d.p!.uid, d]));
  const cats = allSections
    .filter((s) => s.path !== 'catalog' && s.path !== 'sale')
    .map((s) => {
      const ds = s.uids.map((u) => byUid.get(u)).filter(Boolean) as Demand[];
      return { name: sectionName(s), path: s.path, products: s.uids.length, views: ds.reduce((a, d) => a + d.views, 0), qty: ds.reduce((a, d) => a + d.qty, 0), revenue: ds.reduce((a, d) => a + d.revenue, 0) };
    })
    .filter((c) => c.views || c.qty)
    .sort((a, b) => b.views - a.views);
  const matched = list.filter((d) => d.p).length;
  return { list: list.sort((a, b) => b.views - a.views), unseen, cats, total, matched, delivery: (m.products.rows ?? []).find((r) => /доставка/i.test(r.dims[0]))?.m[3] ?? 0 };
}

/** доля брендовых запросов среди поисковых фраз Метрики */
export function brandShare(m: Metrika) {
  const rows = m.phrases.rows ?? [];
  const brand = /(alex|алекс)\s*(krown|crown|краун|кроун|крон)/i;
  const b = rows.filter((r) => brand.test(r.dims[0])).reduce((s, r) => s + r.m[0], 0);
  const all = rows.reduce((s, r) => s + r.m[0], 0);
  return { brand: b, all, share: all ? b / all : 0, nonBrand: rows.filter((r) => !brand.test(r.dims[0])) };
}
