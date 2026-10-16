/**
 * Товарный спрос по периодам – для вкладки «Товарный спрос» админки (Показатели и Сравнение, как у Метрики).
 * Периоды – те же, что посчитал код EV для «Метрики и каналов» (src/data/v1/analytics/metrika_report.json,
 * scripts/metrika-ev.py): неделя, месяц, квартал, год и пары год / месяц / квартал / неделя к предыдущим.
 * Источник – электронная коммерция Метрики: сейчас её шлёт Тильда с alex-krown.com, после переезда – сам
 * сайт (src/v1/ecommerce.ts), формат тот же. Фильтр «только люди», как во всём разделе.
 *
 *   node scripts/demand-collect.mjs     (сначала scripts/metrika-ev.py – он задаёт периоды)
 *
 * Итог – src/data/v1/analytics/demand.json (вне репозитория: цифры коммерческие).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/v1/analytics');
const COUNTER = 112281637;
const env = readFileSync(join(homedir(), '.config/yandex-metrika/metrika.env'), 'utf8');
const TOKEN = env.match(/YANDEX_METRIKA_TOKEN\s*=\s*["']?([^"'\s]+)/)?.[1];
if (!TOKEN) throw new Error('нет YANDEX_METRIKA_TOKEN в ~/.config/yandex-metrika/metrika.env');
const report = JSON.parse(readFileSync(join(OUT, 'metrika_report.json'), 'utf8'));
const HUMANS = "ym:s:isRobot=='No'";

async function table(date1, date2, dimensions, metrics, extra = {}) {
  const filters = extra.filters ? `(${extra.filters}) AND ${HUMANS}` : HUMANS;
  const q = new URLSearchParams({ ids: String(COUNTER), date1, date2, dimensions, metrics, accuracy: 'full', lang: 'ru', limit: '300', ...extra, filters });
  if (!dimensions) q.delete('dimensions'); // итог без разреза
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://api-metrika.yandex.net/stat/v1/data?${q}`, { headers: { Authorization: 'OAuth ' + TOKEN } });
    if (r.status === 429) {
      await new Promise((ok) => setTimeout(ok, 4000 * (i + 1)));
      continue;
    }
    const d = await r.json();
    if (!r.ok) return { error: d.message || String(r.status) };
    return { totals: d.totals, rows: d.data.map((x) => ({ dims: x.dimensions.map((y) => y.name ?? y.id), m: x.metrics.map((v) => Math.round(v * 100) / 100) })) };
  }
  return { error: '429 – квота API исчерпана' };
}

const PRODUCT_M = 'ym:s:productImpressions,ym:s:productBasketsQuantity,ym:s:productPurchasedQuantity,ym:s:productPurchasedPrice';
/** срез за период: товары, карточки как вход на сайт (по каналам), фразы поиска */
const slice = async (d1, d2, withPhrases = true) => ({
  products: await table(d1, d2, 'ym:s:productName', PRODUCT_M, { sort: '-ym:s:productImpressions' }),
  productEntries: await table(d1, d2, 'ym:s:startURLPath,ym:s:lastTrafficSource', 'ym:s:visits', { filters: "ym:s:startURLPath=@'tproduct'", sort: '-ym:s:visits', limit: '500' }),
  ...(withPhrases ? { phrases: await table(d1, d2, 'ym:s:lastSearchPhrase', 'ym:s:visits', { sort: '-ym:s:visits', limit: '100' }) } : {}),
  sales: await table(d1, d2, '', 'ym:s:ecommercePurchases,ym:s:ecommerceRevenue'),
});

const out = { collectedAt: new Date().toISOString(), counter: COUNTER, periods: {}, modes: {} };
for (const [key, p] of Object.entries(report.periods)) out.periods[key] = { date1: p.date1, date2: p.date2, ...(await slice(p.date1, p.date2)) };
for (const [key, p] of Object.entries(report.modes))
  out.modes[key] = { label: p.label, prevLabel: p.prev_label, date1: p.date1, date2: p.date2, prev1: p.prev1, prev2: p.prev2, now: await slice(p.date1, p.date2, false), prev: await slice(p.prev1, p.prev2, false) };

writeFileSync(join(OUT, 'demand.json'), JSON.stringify(out));
const errs = [];
const walk = (o, path) => Object.entries(o).forEach(([k, v]) => (v && typeof v === 'object' ? (v.error ? errs.push(`${path}${k}: ${v.error}`) : walk(v, `${path}${k}.`)) : 0));
walk(out, '');
for (const [k, p] of Object.entries(out.periods)) console.log(`${k} ${p.date1}…${p.date2}: товаров ${p.products.rows?.length ?? '?'}, просмотров ${p.products.totals?.[0] ?? '?'}, куплено ${p.products.totals?.[2] ?? '?'}`);
for (const [k, p] of Object.entries(out.modes)) console.log(`${k}: просмотров ${p.prev.products.totals?.[0] ?? '?'} → ${p.now.products.totals?.[0] ?? '?'}`);
if (errs.length) console.log('ошибки:', errs.join(' | '));
