/**
 * Данные магазина «Вариант 1» из перенесённого сайта (без запросов к Тильде, кроме фото товаров).
 *
 *   node scripts/v1-data.mjs [--no-photos]
 *
 * 1. Товары (208) – из снимка API магазина src/data/store/: название, цена и старая цена первого
 *    варианта (как показывает Тильда), размеры и цены по вариантам, «Вид товара», цвет, галерея.
 *    Описание и состав – со вкладки «Описание» страницы товара (src/data/pages/*tproduct*.json),
 *    таблица размеров – картинка со вкладки «Размер».
 * 2. Разделы (51) – страницы каталога из sitemap оригинала: storepart раздела из t_store_init,
 *    товары и их порядок – из ответов снимка этого раздела; title, description и H1 – с оригинала.
 * 3. Текстовые страницы (о бренде, контакты, доставка…) – текст Zero-блоков по порядку на странице.
 * 4. Фото: до 6 на товар, WebP 480 и 960 px → public/v1/img/<uid>-<n>[-s].webp. Кэш скачанного –
 *    node_modules/.cache/v1-img.
 * Итог: src/data/v1/{products,sections,pages}.json.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'src/data/pages');
const STORE = join(ROOT, 'src/data/store');
const OUT = join(ROOT, 'src/data/v1');
const IMG = join(ROOT, 'public/v1/img');
const CACHE = join(ROOT, 'node_modules/.cache/v1-img');
const NO_PHOTOS = process.argv.includes('--no-photos');
/* после запуска админки товары и каталоги правит владелец (коммиты «Админка: …») – генератор их
   не перезаписывает без явного --overwrite-admin, иначе правки потеряются */
{
  const { execSync } = await import('node:child_process');
  const last = execSync(`git -C "${join(dirname(fileURLToPath(import.meta.url)), '..')}" log -1 --format=%s -- src/data/v1/products.json src/data/v1/sections.json`).toString();
  if (last.startsWith('Админка:') && !process.argv.includes('--overwrite-admin')) {
    console.error(`Товары правились в админке («${last.trim()}»). Генератор перезапишет эти правки – запуск только с --overwrite-admin.`);
    process.exit(1);
  }
}
const MAX_PHOTOS = 6;
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36', Referer: 'https://alex-krown.com/' };
for (const d of [OUT, IMG, CACHE]) mkdirSync(d, { recursive: true });

const page = (path) => {
  const f = join(PAGES, (path.replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'index') + '.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '–').replace(/&ndash;/g, '–').replace(/—/g, '–').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html) => decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const num = (s) => Math.round(parseFloat(String(s ?? '').replace(/\s/g, '')) || 0);
const meta = (head, re) => decode(head.match(re)?.[1] ?? '').trim();

/* ---------- снимок магазина ---------- */
const index = JSON.parse(readFileSync(join(STORE, 'index.json'), 'utf8'));
const products = new Map(); // uid → товар из API
const lists = new Map(); // storepart → [{slice, uids}]
for (const [key, file] of Object.entries(index)) {
  const q = Object.fromEntries(JSON.parse(key));
  let d;
  try {
    d = JSON.parse(readFileSync(join(STORE, file + '.json'), 'utf8'));
  } catch {
    continue;
  }
  for (const p of d.products || []) products.set(String(p.uid), { ...products.get(String(p.uid)), ...p });
  if (q._api.includes('getproductslist') && q.storepartuid && !q.sort && !q.filters) {
    const arr = lists.get(q.storepartuid) || [];
    arr.push({ slice: +q.slice || 1, uids: (d.products || []).map((p) => String(p.uid)) });
    lists.set(q.storepartuid, arr);
  }
}

/* ---------- товары ---------- */
const gallery = (p) => (typeof p.gallery === 'string' ? JSON.parse(p.gallery || '[]') : p.gallery || []).map((g) => g.img).filter(Boolean);
/* размеры набраны вперемешку кириллицей («М») – приводим к латинице для фидов и корзины */
const latinSize = (s) => String(s).trim().replace(/[МмХхСс]/g, (c) => ({ М: 'M', м: 'M', Х: 'X', х: 'X', С: 'C', с: 'C' })[c]);
const charc = (p, name) => (p.characteristics || []).find((c) => c.title === name)?.value || '';

function tabs(body) {
  const out = {};
  for (const m of body.matchAll(/item-title[^>]*>([^<]+)<\/h2>\s*<\/div>\s*<div class="t-store__tabs__content[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)) out[decode(m[1]).trim()] = m[2];
  return out;
}

const items = [];
for (const [uid, p] of products) {
  const path = new URL(p.url).pathname.replace(/^\/|\/$/g, '');
  const pg = page(path);
  const t = pg?.body ? tabs(pg.body) : {};
  let descr = t['Описание'] ? text(t['Описание']) : '';
  let composition = '';
  const cm = descr.match(/Состав\s*:?\s*([^\n]+)/i);
  if (cm) {
    composition = cm[1].trim().replace(/\.$/, '');
    descr = descr.replace(cm[0], '').trim();
  }
  const sizeImg = t['Размер']?.match(/src="(\/_t\/static\/[^"]+)"/)?.[1] || null;
  const eds = (p.editions || []).filter((e) => e['Размер'] || e.price);
  const first = eds[0] || {};
  items.push({
    uid,
    path,
    title: decode(p.title).trim(),
    price: num(first.price) || num(p.price),
    priceOld: num(first.priceold) || num(p.priceold) || null,
    sizes: eds.filter((e) => e['Размер']).map((e) => ({ size: latinSize(e['Размер']), price: num(e.price) || num(p.price), priceOld: num(e.priceold) || null })),
    kind: charc(p, 'Вид товара'),
    color: charc(p, 'Цвет'),
    descr: descr.replace(/\n{2,}/g, '\n').trim(),
    composition,
    sizeChart: sizeImg,
    parts: (typeof p.partuids === 'string' ? JSON.parse(p.partuids || '[]') : p.partuids || []).map(String),
    sort: num(p.sort),
    src: gallery(p).slice(0, MAX_PHOTOS),
    photos: [],
  });
}

/* ---------- разделы ---------- */
/* страницы каталога – все перенесённые страницы с блоком магазина, кроме главной и карточек */
const sm = readdirSync(PAGES)
  .map((f) => f.replace(/\.json$/, '').replace(/__/g, '/'))
  .filter((p) => p !== 'index' && !p.includes('tproduct') && !/^page\d+/.test(p))
  .sort();
const menu = new Map();
for (const m of page('').body.matchAll(/href="\/(catalog\/(?:man|woman)\/[\w-]+)"[^>]*>\s*([^<]+?)\s*</g)) menu.set(m[1], decode(m[2]));
const sections = [];
for (const path of sm) {
  const pg = page(path);
  const sp = pg?.body?.match(/storepart:'(\d+)'/)?.[1];
  if (!sp) continue;
  const uids = [...new Set((lists.get(sp) || []).sort((a, b) => a.slice - b.slice).flatMap((l) => l.uids))].filter((u) => products.has(u));
  sections.push({
    path,
    storepart: sp,
    title: meta(pg.head, /<title>([^<]*)<\/title>/),
    description: meta(pg.head, /name="description" content="([^"]*)"/),
    h1: text(pg.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || ''),
    name: menu.get(path) || null,
    uids,
  });
}

/* ---------- текстовые страницы ---------- */
const INFO = ['about', 'contacts', 'payment_and_delivery', 'return', 'size_chart', 'recomendation', 'privatepolicy', 'processing_of_personal_data', 'offer_agreement'];
const infoPages = [];
for (const path of INFO) {
  const pg = page(path);
  if (!pg?.body) continue;
  const blocks = pg.body.split(/(?=<div id="rec\d+")/).filter((r) => /data-record-type="(396|106|30|60|127)"/.test(r));
  const paras = [];
  for (const r of blocks) {
    if (/Подробнее[\s\S]*Данные[\s\S]*Помощь/.test(r) || /The best ideas come as jokes/.test(r)) continue; // подвал и шапка
    const els = [...r.matchAll(/data-elem-type='text'[^>]*?data-field-top-value="(-?\d+)"[^>]*?data-field-left-value="(-?\d+)"[\s\S]*?<div class='tn-atom'[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)]
      .map((m) => ({ top: +m[1], left: +m[2], t: text(m[3]) }))
      .sort((a, b) => a.top - b.top || a.left - b.left);
    for (const e of els) if (e.t && !/^(Главная|\/)$/.test(e.t)) paras.push(e.t);
    for (const m of r.matchAll(/class="t-(?:text|descr|title)[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
      const t = text(m[1]);
      if (t) paras.push(t);
    }
  }
  infoPages.push({
    path,
    title: meta(pg.head, /<title>([^<]*)<\/title>/),
    description: meta(pg.head, /name="description" content="([^"]*)"/),
    h1: text(pg.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || ''),
    paras: [...new Set(paras)].filter((t) => t !== text(pg.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || '')),
  });
}

/* ---------- фото ---------- */
async function fetchBuf(url) {
  const key = join(CACHE, url.replace(/[^\w.-]+/g, '_').slice(-120));
  if (existsSync(key)) return readFileSync(key);
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(String(r.status));
      const b = Buffer.from(await r.arrayBuffer());
      writeFileSync(key, b);
      return b;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((ok) => setTimeout(ok, 1200));
    }
  }
}
async function photo(input, name) {
  const big = join(IMG, name + '.webp');
  if (!existsSync(big)) await sharp(input).rotate().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 78 }).toFile(big);
  const small = join(IMG, name + '-s.webp');
  if (!existsSync(small)) await sharp(input).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 74 }).toFile(small);
  const { width, height } = await sharp(big).metadata();
  return { name, w: width, h: height };
}
if (!NO_PHOTOS) {
  const jobs = items.flatMap((it) => it.src.map((url, i) => ({ it, url, i })));
  let k = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (k < jobs.length) {
        const { it, url, i } = jobs[k++];
        try {
          it.photos[i] = await photo(await fetchBuf(url), `${it.uid}-${i + 1}`);
        } catch (e) {
          failed++;
          console.log(`  ✗ ${it.title}: ${url} – ${e.message}`);
        }
      }
    }),
  );
  for (const it of items) it.photos = it.photos.filter(Boolean);
  /* у худи Cardiogram Black на сайте нет фото – кадр из клипа VK бренда (scripts/collection-media.mjs) */
  const FALLBACK = { '238837028463': 'public/home/video/cardiogram-hoodie.webp' };
  for (const it of items)
    if (!it.photos.length && FALLBACK[it.uid] && existsSync(join(ROOT, FALLBACK[it.uid]))) it.photos = [await photo(join(ROOT, FALLBACK[it.uid]), `${it.uid}-1`)];
  console.log(`фото: ${jobs.length}, ошибок ${failed}`);
  /* таблицы размеров – из перенесённых файлов public/_t */
  const charts = new Map();
  for (const it of items) {
    if (!it.sizeChart) continue;
    if (!charts.has(it.sizeChart)) {
      const src = join(ROOT, 'public', decodeURIComponent(it.sizeChart));
      charts.set(it.sizeChart, existsSync(src) ? await photo(src, 'size-' + it.sizeChart.split('/')[3]) : null);
    }
    it.sizeChart = charts.get(it.sizeChart);
  }
}
/* --no-photos: фото и таблицы размеров – из прошлого запуска, чтобы не затереть их пустыми */
if (NO_PHOTOS && existsSync(join(OUT, 'products.json'))) {
  const prev = new Map(JSON.parse(readFileSync(join(OUT, 'products.json'), 'utf8')).map((x) => [x.uid, x]));
  for (const it of items) Object.assign(it, { photos: prev.get(it.uid)?.photos ?? [], sizeChart: prev.get(it.uid)?.sizeChart ?? null });
}
for (const it of items) delete it.src;

writeFileSync(join(OUT, 'products.json'), JSON.stringify(items));
writeFileSync(join(OUT, 'sections.json'), JSON.stringify(sections, null, 1));
writeFileSync(join(OUT, 'pages.json'), JSON.stringify(infoPages, null, 1));
const stat = (f) => items.filter(f).length;
console.log(`товаров ${items.length}: с описанием ${stat((i) => i.descr.length > 20)}, с составом ${stat((i) => i.composition)}, с размерами ${stat((i) => i.sizes.length)}, с фото ${stat((i) => i.photos.length)}`);
console.log(`разделов ${sections.length}, пустых ${sections.filter((s) => !s.uids.length).map((s) => s.path).join(', ') || 'нет'}; текстовых страниц ${infoPages.length}`);
