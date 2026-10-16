/** Анализ товарного спроса для админки «Метрика и спрос» и «Точки А».
    Вход – срез Метрики за период (scripts/demand-collect.mjs → src/data/v1/analytics/demand.json, вне репо):
    по товару – просмотры карточки, добавления в корзину, купленные штуки и выручка.
    Что считаем и зачем:
    - конверсия просмотр → покупка: какие вещи «продают себя», а какие смотрят и уходят;
    - ABC по выручке: A – товары, дающие первые 80 % выручки, B – следующие 15 %, C – остальное;
    - сегменты: «Хиты» (покупают), «Смотрят, но не покупают» (много просмотров, 0 покупок – цена, фото,
      размеры или описание), «Тихие» (почти не смотрят – витрина и реклама), «Нет данных» (товара не было в отчёте);
    - спрос по каталогам: сумма просмотров и покупок товаров каталога;
    - сравнение двух периодов (compareDemand): что набирает интерес, что остывает;
    - карточка как вход: сколько людей попадают сразу на товар и с какого канала (поиск, соцсети, реклама);
    - ценовые группы: где смотрят и где покупают;
    - небрендовый поиск: по каким видам товаров сайт находят без названия бренда.
    Товары сопоставляются по названию (Метрика хранит название, как его передала Тильда). */
import { allProducts, allSections, sectionName, type Product } from '../site';

export interface MetrikaTable { totals?: number[]; rows?: { dims: string[]; m: number[] }[]; error?: string }
export interface Metrika { products: MetrikaTable; productEntries?: MetrikaTable; phrases?: MetrikaTable }

export interface Demand { p: Product | null; title: string; views: number; baskets: number; qty: number; revenue: number; conv: number; abc: 'A' | 'B' | 'C' | '–'; segment: string; entries: number; entriesSearch: number }
export interface Entry { uid: string; p: Product | null; all: number; search: number; direct: number; social: number; ads: number; other: number }

const norm = (s: string) => s.toLowerCase().replace(/[«»“”"'’]/g, '').replace(/\s+/g, ' ').trim();

/** срез за период: достаточно товаров; входы на карточки, динамика и фразы – если есть */
export type Slice = Pick<Metrika, 'products'> & Partial<Metrika>;

export function demand(m: Slice) {
  const byTitle = new Map(allProducts.map((p) => [norm(p.title), p]));
  const rows = (m.products.rows ?? []).filter((r) => !/доставка/i.test(r.dims[0]));
  const list: Demand[] = rows.map((r) => {
    const [views, baskets, qty, revenue] = r.m;
    return { p: byTitle.get(norm(r.dims[0])) ?? null, title: r.dims[0], views, baskets, qty, revenue, conv: views ? qty / views : 0, abc: '–', segment: '', entries: 0, entriesSearch: 0 };
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
  /* карточка товара как вход на сайт: адрес /…/tproduct/<номер>-… → товар, каналы Метрики → группы */
  const ent = new Map<string, Entry>();
  for (const r of m.productEntries?.rows ?? []) {
    const uid = r.dims[0].match(/tproduct\/(\d+)/)?.[1];
    if (!uid) continue;
    const e = ent.get(uid) ?? { uid, p: allProducts.find((x) => x.uid === uid) ?? null, all: 0, search: 0, direct: 0, social: 0, ads: 0, other: 0 };
    const src = r.dims[1] ?? '', v = r.m[0];
    e.all += v;
    if (/поисков/i.test(src)) e.search += v; else if (/прям/i.test(src)) e.direct += v; else if (/социальн/i.test(src)) e.social += v; else if (/реклам/i.test(src)) e.ads += v; else e.other += v;
    ent.set(uid, e);
  }
  for (const d of list) if (d.p && ent.has(d.p.uid)) (d.entries = ent.get(d.p.uid)!.all), (d.entriesSearch = ent.get(d.p.uid)!.search);
  const entries = [...ent.values()].sort((a, b) => b.all - a.all);
  /* ценовые группы: товары каталога, просмотры, покупки */
  const bands = ([[0, 5000, 'до 5 000 ₽'], [5000, 10000, '5 000 – 10 000 ₽'], [10000, 20000, '10 000 – 20 000 ₽'], [20000, Infinity, 'от 20 000 ₽']] as const).map(([lo, hi, label]) => {
    const ds = list.filter((d) => d.p && d.p.price >= lo && d.p.price < hi);
    return { label, products: allProducts.filter((p) => !p.hidden && p.price >= lo && p.price < hi).length, views: ds.reduce((a, d) => a + d.views, 0), qty: ds.reduce((a, d) => a + d.qty, 0), revenue: ds.reduce((a, d) => a + d.revenue, 0) };
  });
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
  return { list: list.sort((a, b) => b.views - a.views), unseen, cats, total, matched, entries, bands, delivery: (m.products.rows ?? []).find((r) => /доставка/i.test(r.dims[0]))?.m[3] ?? 0 };
}

/** доля брендовых запросов среди поисковых фраз Метрики */
export function brandShare(m: Slice) {
  const rows = m.phrases?.rows ?? [];
  // написания бренда – опечатки из реальной выгрузки («алек кроу», «ераун»); в фразах бывают русские буквы
  // вперемешку с латиницей («Аlex» с русской А) – проверяем и исходную фразу, и её латинскую запись
  const brand = /(alex|алекс?|александр)[\s\-]*(krown|crown|краун|кроун|крон|кроу|ераун)/i;
  const LAT: Record<string, string> = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', к: 'k', м: 'm', т: 't', в: 'b', н: 'h', у: 'y' };
  const isBrand = (x: string) => brand.test(x) || brand.test(x.toLowerCase().replace(/[аеорсхкмтвну]/g, (c) => LAT[c]));
  const b = rows.filter((r) => isBrand(r.dims[0])).reduce((s, r) => s + r.m[0], 0);
  const all = rows.reduce((s, r) => s + r.m[0], 0);
  return { brand: b, all, share: all ? b / all : 0, nonBrand: rows.filter((r) => !isBrand(r.dims[0])) };
}

/** небрендовые фразы поиска (Метрика) с видом товара, который в них назван: «худи», «джоггеры», «куртка» */
export function productSearch(m: Slice) {
  const { brand, all, nonBrand } = brandShare(m);
  const kinds = [...new Set(allProducts.map((p) => p.kind).filter(Boolean))];
  const stem = (k: string) => k.toLowerCase().slice(0, Math.max(4, k.length - 2));
  const rows = nonBrand.map((r) => ({ phrase: r.dims[0], visits: r.m[0], kind: kinds.find((k) => r.dims[0].toLowerCase().includes(stem(k))) ?? null }));
  return { brand, all, rows };
}

/** сравнение двух периодов по товарам и каталогам: было → стало (вкладка «Товарный спрос» → «Сравнение») */
export function compareDemand(now: Slice, prev: Slice) {
  const a = demand(now), b = demand(prev);
  const key = (d: Demand) => d.p?.uid ?? norm(d.title);
  const before = new Map(b.list.map((d) => [key(d), d]));
  const rows = a.list.map((d) => ({ d, was: before.get(key(d)) ?? null }));
  for (const d of b.list) if (!a.list.some((x) => key(x) === key(d))) rows.push({ d: { ...d, views: 0, qty: 0, revenue: 0, entries: 0, entriesSearch: 0 }, was: d });
  const sum = (l: Demand[], f: (d: Demand) => number) => l.reduce((s, d) => s + f(d), 0);
  const tot = (x: ReturnType<typeof demand>) => ({ views: sum(x.list, (d) => d.views), qty: sum(x.list, (d) => d.qty), revenue: x.total, entries: x.entries.reduce((s, e) => s + e.all, 0), search: x.entries.reduce((s, e) => s + e.search, 0) });
  const catsWas = new Map(b.cats.map((c) => [c.path, c]));
  const cats = a.cats.map((c) => ({ ...c, was: catsWas.get(c.path) ?? null }));
  return { rows, now: tot(a), prev: tot(b), cats };
}
