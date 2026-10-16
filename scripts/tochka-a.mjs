/**
 * «Точка А» – срез аналитики alex-krown.com для админки (раздел «Метрика»): трафик, источники,
 * поиск, устройства, города, страницы входа, цели и товарный спрос (электронная коммерция).
 *
 *   node scripts/tochka-a.mjs [дней=365]
 *
 * Ключ – ~/.config/yandex-metrika/metrika.env (YANDEX_METRIKA_TOKEN), в репозиторий не попадает.
 * Счётчик alex-krown.com – 112281637 (с сайта). Итог – src/data/v1/analytics/metrika.json:
 * только агрегаты, без персональных данных. Квота API отчётов – общая на пользователя Яндекса,
 * при 429 скрипт ждёт и повторяет.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTER = 112281637;
const DAYS = +(process.argv[2] || 365);
const env = readFileSync(join(homedir(), '.config/yandex-metrika/metrika.env'), 'utf8');
const TOKEN = env.match(/YANDEX_METRIKA_TOKEN\s*=\s*["']?([^"'\s]+)/)?.[1];
if (!TOKEN) throw new Error('нет YANDEX_METRIKA_TOKEN в ~/.config/yandex-metrika/metrika.env');
const H = { Authorization: 'OAuth ' + TOKEN };
const day = (d) => d.toISOString().slice(0, 10);
const to = new Date(Date.now() - 864e5);
const from = new Date(to.getTime() - (DAYS - 1) * 864e5);

async function api(path, params = {}) {
  const q = new URLSearchParams({ ids: String(COUNTER), date1: day(from), date2: day(to), accuracy: 'full', lang: 'ru', ...params });
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://api-metrika.yandex.net${path}?${q}`, { headers: H });
    if (r.status === 429) {
      await new Promise((ok) => setTimeout(ok, 4000 * (i + 1)));
      continue;
    }
    const d = await r.json();
    if (!r.ok) return { error: d.message || r.status };
    return d;
  }
  return { error: '429 – квота API исчерпана' };
}
const table = async (dimensions, metrics, extra = {}) => {
  const d = await api('/stat/v1/data', { dimensions, metrics, limit: '100', ...extra });
  if (d.error) return { error: d.error };
  return {
    totals: d.totals,
    rows: d.data.map((x) => ({ dims: x.dimensions.map((y) => y.name ?? y.id), m: x.metrics.map((v) => Math.round(v * 100) / 100) })),
  };
};

const BASE = 'ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds';
const SALES = 'ym:s:visits,ym:s:ecommercePurchases,ym:s:ecommerceRevenue';
const out = { counter: COUNTER, period: { from: day(from), to: day(to) }, collectedAt: new Date().toISOString() };

out.byMonth = await table('ym:s:startOfMonth', BASE, { sort: 'ym:s:startOfMonth', group: 'month' });
out.salesByMonth = await table('ym:s:startOfMonth', SALES, { sort: 'ym:s:startOfMonth' });
out.sources = await table('ym:s:lastTrafficSource', SALES, { sort: '-ym:s:visits' });
out.engines = await table('ym:s:lastSearchEngineRoot', 'ym:s:visits,ym:s:bounceRate', { sort: '-ym:s:visits' });
out.phrases = await table('ym:s:lastSearchPhrase', 'ym:s:visits,ym:s:bounceRate', { sort: '-ym:s:visits', limit: '60' });
out.devices = await table('ym:s:deviceCategory', SALES, { sort: '-ym:s:visits' });
out.cities = await table('ym:s:regionCity', 'ym:s:visits', { sort: '-ym:s:visits', limit: '20' });
out.landing = await table('ym:s:startURLPathFull', 'ym:s:visits,ym:s:bounceRate', { sort: '-ym:s:visits', limit: '40' });
/* товарный спрос: показы карточки, добавления в корзину, покупки и выручка по товарам */
out.products = await table('ym:s:productName', 'ym:s:productImpressions,ym:s:productBasketsQuantity,ym:s:productPurchasedQuantity,ym:s:productPurchasedPrice', {
  sort: '-ym:s:productImpressions',
  limit: '200',
});
/* цели счётчика и их достижения */
const goals = await api(`/management/v1/counter/${COUNTER}/goals`, {});
out.goals = [];
for (const g of (goals.goals || []).slice(0, 20)) {
  const t = await table('ym:s:lastTrafficSource', `ym:s:goal${g.id}reaches`, {});
  out.goals.push({ id: g.id, name: g.name, type: g.type, reaches: t.totals?.[0] ?? null, error: t.error });
}

mkdirSync(join(ROOT, 'src/data/v1/analytics'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/v1/analytics/metrika.json'), JSON.stringify(out, null, 1));
const errs = Object.entries(out).filter(([, v]) => v && v.error).map(([k, v]) => `${k}: ${v.error}`);
console.log(`период ${out.period.from} – ${out.period.to}; визитов ${out.byMonth.totals?.[0] ?? '?'}; покупок ${out.salesByMonth.totals?.[1] ?? '?'}; товаров в отчёте ${out.products.rows?.length ?? 0}; целей ${out.goals.length}`);
if (errs.length) console.log('ошибки:', errs.join(' | '));
