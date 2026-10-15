/**
 * Снимок магазина Тильды для копии.
 *
 *   node scripts/store-snapshot.mjs
 *
 * API магазина (store.tildaapi.com) отвечает только домену alex-krown.com:
 * на копии каталоги остались бы пустыми. Поэтому открываем живые страницы
 * с каталогом в Playwright, записываем запросы к API и их ответы, а страницы
 * пагинации добираем прямым запросом без Origin (так API отвечает).
 * Итог – src/data/store/<ключ>.json и src/data/store/index.json (ключ запроса →
 * файл). Маршрут src/pages/t-store/ отдаёт их с адресами под подпапку сайта,
 * а вставка snapshot.js подменяет адрес запроса на снимок. Запросы, которых
 * нет в снимке (фильтр или сортировка посетителя), уходят в Тильду как есть.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://alex-krown.com';
const PAGES = join(ROOT, 'src/data/pages');
const OUT = join(ROOT, 'src/data/store');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
/* метка времени и флаги первого запроса не влияют на ответ по товарам */
export const SKIP = ['c', 'getparts', 'getoptions'];
const API = /^store\d?\.tilda(api|cdn)\.[a-z]+$/;

export function keyOf(url) {
  const u = new URL(url);
  const p = [['_api', u.pathname]];
  u.searchParams.forEach((v, k) => SKIP.includes(k) || p.push([k, v]));
  if (!p.some(([k]) => k === 'slice')) p.push(['slice', '1']);
  p.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  return JSON.stringify(p);
}

/* страницы, где Тильда ходит в API магазина: каталоги и карточки товаров */
const targets = readdirSync(PAGES)
  .map((f) => JSON.parse(readFileSync(join(PAGES, f), 'utf8')))
  .filter((p) => p.body && /t_store_init\(|t_store_productInit\(/.test(p.body))
  .map((p) => p.path);
console.log(`страниц с магазином: ${targets.length}`);

const snap = new Map(); // ключ → {url, body}
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 } });
await ctx.route(/mc\.yandex|googletagmanager|tilda-stat|vk\.com\/rtrg/, (r) => r.abort());

let n = 0;
const queue = [...targets];
await Promise.all(
  Array.from({ length: 5 }, async () => {
    const page = await ctx.newPage();
    page.on('response', async (res) => {
      const u = new URL(res.url());
      if (!API.test(u.hostname) || !u.pathname.startsWith('/api/') || res.status() !== 200) return;
      try {
        const body = await res.text();
        if (!body.startsWith('{')) return;
        snap.set(keyOf(res.url()), { url: res.url(), body });
      } catch {}
    });
    while (queue.length) {
      const path = queue.shift();
      try {
        await page.goto(`${SITE}/${path}`, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(800);
      } catch (e) {
        console.log(`  ✗ ${path}: ${e.message.split('\n')[0]}`);
      }
      if (++n % 25 === 0) console.log(`  ${n}/${targets.length}, ответов API: ${snap.size}`);
    }
    await page.close();
  }),
);
await browser.close();

/* пагинация каталогов: Тильда грузит следующие страницы по кнопке – добираем все */
for (const { url, body } of [...snap.values()]) {
  const u = new URL(url);
  if (!u.pathname.includes('getproductslist')) continue;
  const total = JSON.parse(body).total;
  const size = +u.searchParams.get('size') || 0;
  if (!total || !size) continue;
  for (let s = 2; s <= Math.ceil(total / size); s++) {
    u.searchParams.set('slice', String(s));
    if (snap.has(keyOf(u.href))) continue;
    const r = await fetch(u.href, { headers: { 'User-Agent': UA } });
    const b = await r.text();
    if (r.ok && b.startsWith('{')) snap.set(keyOf(u.href), { url: u.href, body: b });
    else console.log(`  ✗ пагинация ${u.href}: ${r.status}`);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = {};
for (const [key, { body }] of snap) {
  const file = createHash('sha1').update(key).digest('hex').slice(0, 16);
  index[key] = file;
  writeFileSync(join(OUT, file + '.json'), body);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
const kinds = {};
for (const k of snap.keys()) kinds[JSON.parse(k)[0][1]] = (kinds[JSON.parse(k)[0][1]] || 0) + 1;
console.log(`снимок: ${snap.size} ответов`, kinds);
