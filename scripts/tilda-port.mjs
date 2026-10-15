/**
 * Перенос alex-krown.com (Тильда) в данные сайта.
 *
 *   node scripts/tilda-port.mjs [--no-assets] [--refresh]
 *
 * 1. Обход: адреса из sitemap.xml + все внутренние ссылки страниц (в sitemap
 *    есть не всё: договоры, оферты, политики). Блог, посты и новости не берём.
 *    Ответ 3xx – редирект Тильды, пишем запись {redirect}.
 * 2. Страница режется на атрибуты <html>, содержимое <head>, атрибуты <body>
 *    и его содержимое. Скрипты платформы и сайта остаются (как в экспорте
 *    Тильды), вырезаются только счётчики и отправка заявок в Calltouch.
 * 3. Ссылки на перенесённые страницы → корневые /slug, на остальное
 *    (файлы и прочее) → https://alex-krown.com/…
 * 4. Ресурсы CDN → public/_t/ (scripts/tilda-assets.mjs).
 * Итог: src/data/pages/<slug>.json. Кэш – node_modules/.cache/tilda-port.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssets } from './tilda-assets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://alex-krown.com';
/* сайт отдаёт 403 запросам без браузерного User-Agent */
export const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' };
const CACHE = join(ROOT, 'node_modules/.cache/tilda-port');
const OUT = join(ROOT, 'src/data/pages');
const PUBLIC = join(ROOT, 'public');
const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');

/* служебные адреса Тильды pageNNN.html – дубли страниц с ЧПУ, не переносим */
const SKIP = /^page\d+(\.html)?$|^tilda\//;
/* счётчики и коллтрекинг – на копию не ставим */
const COUNTER =
  /CalltouchDataObject|calltouch|window\.ct\(|ctw\.|gtagTrackerID|googletagmanager|mc\.yandex|ym\(\d|_tmr|top-fwz|VK\.Retargeting|vk\.com\/rtrg|mainTracker|tilda-stat|window\.dataLayer\s*=/;

mkdirSync(join(CACHE, 'html'), { recursive: true });

/* ---------- сеть ---------- */

const fileOf = (path) => (path || 'index').replace(/\//g, '__');

async function fetchPage(path) {
  const cached = join(CACHE, 'html', fileOf(path) + '.json');
  if (!REFRESH && existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  let res;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${SITE}/${path}`, { redirect: 'manual', headers: UA });
      if (r.status >= 300 && r.status < 400) {
        res = { status: r.status, location: new URL(r.headers.get('location'), `${SITE}/${path}`).href };
      } else {
        const html = await r.text();
        if (r.ok && !/<\/html>\s*$/i.test(html)) throw new Error('страница пришла не целиком');
        res = { status: r.status, html };
      }
      break;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  }
  writeFileSync(cached, JSON.stringify(res));
  return res;
}

/** Путь страницы сайта из ссылки или null, если ссылка не на страницу сайта */
function sitePath(href) {
  const h = href.trim();
  if (h.startsWith('//')) return null; // адрес без протокола – чужой хост
  const m = h.match(/^(?:https?:\/\/(?:www\.)?alex-krown\.com)?(\/[^?#"']*)?([?#].*)?$/);
  if (!m || (!m[1] && !/^https?:/.test(h))) return null;
  return (m[1] || '/').replace(/^\/+|\/+$/g, '');
}

const isFile = (p) => /\.[a-z0-9]{2,4}$/i.test(p);
/* блок Тильды T303 – переадресация скриптом location.replace(адрес) */
const T303 = /data-record-type="305"[\s\S]*?location\.replace\(\\?"([^"\\]+)\\?"/;

/* ---------- обход ---------- */

/* sitemap.xml – страницы, sitemap-store-*.xml – карточки товаров и разделы магазина */
let sitemap = '';
for (const f of ['sitemap.xml', 'sitemap-store-part1.xml', 'sitemap-store-parts.xml']) {
  const r = await fetch(`${SITE}/${f}`, { headers: UA });
  if (!r.ok) throw new Error(`${f}: ${r.status}`);
  sitemap += await r.text();
}
const queue = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => sitePath(m[1])).filter((p) => p !== null);
const seen = new Set();
const pages = new Map(); // path → {html} | {redirect}
const missing = [];

while (queue.length) {
  const batch = [];
  while (queue.length && batch.length < 4) {
    const p = queue.shift();
    if (seen.has(p) || SKIP.test(p)) continue;
    seen.add(p);
    batch.push(p);
  }
  await Promise.all(
    batch.map(async (p) => {
      const r = await fetchPage(p);
      if (r.location) {
        const to = sitePath(r.location);
        pages.set(p, { redirect: to });
        if (to !== null) queue.push(to);
        return;
      }
      if (r.status !== 200) return void missing.push(`${p} – ${r.status}`);
      const t303 = r.html.match(T303);
      if (t303) {
        const to = sitePath(t303[1]);
        pages.set(p, { redirect: to });
        if (to !== null) queue.push(to);
        return;
      }
      pages.set(p, { html: r.html });
      for (const m of r.html.matchAll(/href=["']([^"']*)["']/g)) {
        const q = sitePath(m[1]);
        if (q !== null && !isFile(q) && !seen.has(q)) queue.push(q);
      }
    }),
  );
}
const ported = new Set(pages.keys());
console.log(`страниц: ${[...pages.values()].filter((p) => p.html).length}, редиректов: ${[...pages.values()].filter((p) => 'redirect' in p).length}`);
if (missing.length) console.log('не отдаются:', missing.join('; '));

/* ---------- разбор ---------- */

function attrs(s) {
  const out = {};
  for (const m of (s || '').matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function stripCounters(s, log) {
  return s
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, a, body) => {
      if (!COUNTER.test(a + body)) return full;
      log.add((a.match(/src="([^"]+)"/)?.[1] || body.trim().slice(0, 50)).replace(/\s+/g, ' '));
      return '';
    })
    .replace(/<noscript>(?:(?!<\/noscript>)[\s\S])*?(mc\.yandex|top-fwz|vk\.com\/rtrg|googletagmanager)[\s\S]*?<\/noscript>/gi, '')
    .replace(/<link\b[^>]*rel="(?:dns-prefetch|preconnect)"[^>]*>/gi, '')
    .replace(/<script\b[^>]*src="https:\/\/neo\.tildacdn\.com\/js\/tilda-fallback[^"]*"[^>]*><\/script>/gi, '');
}

function mapLinks(s) {
  return s.replace(/(\shref=)(["'])([^"']*)\2/g, (full, a, q, href) => {
    const p = sitePath(href);
    if (p === null) return full;
    if (isFile(p)) return `${a}${q}${SITE}/${p}${href.match(/[?#].*$/)?.[0] || ''}${q}`;
    const tail = href.match(/[?#].*$/)?.[0] || '';
    return ported.has(p) ? `${a}${q}/${p}${tail}${q}` : `${a}${q}${SITE}/${p}${tail}${q}`;
  });
}

const assets = createAssets({ publicDir: PUBLIC, cacheDir: CACHE });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const dropped = new Set();

for (const [path, pg] of pages) {
  const file = join(OUT, fileOf(path) + '.json');
  if ('redirect' in pg) {
    /* цепочки (cards → borodinskaya/cards → imperial/cards) сразу в конечную страницу */
    let end = pg.redirect;
    for (let k = 0; k < 5 && end !== null && pages.get(end) && 'redirect' in pages.get(end); k++) end = pages.get(end).redirect;
    const to = end === null ? SITE : ported.has(end) && !('redirect' in pages.get(end)) ? `/${end}` : `${SITE}/${end}`;
    writeFileSync(file, JSON.stringify({ path, redirect: to }));
    continue;
  }
  const html = pg.html;
  const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const bodyOpen = html.match(/<body\b([^>]*)>/i);
  const body = html.slice(bodyOpen.index + bodyOpen[0].length, html.lastIndexOf('</body>'));
  const clean = (s) => assets.mapText(mapLinks(stripCounters(s, dropped))).trim();
  writeFileSync(
    file,
    JSON.stringify({
      path,
      htmlAttrs: attrs(html.match(/<html\b([^>]*)>/i)?.[1]),
      head: clean(head),
      bodyAttrs: attrs(bodyOpen[1]),
      body: clean(body),
    }),
  );
}
console.log(`вырезано счётчиков: ${dropped.size} разных скриптов`);
for (const d of dropped) console.log('  –', d);
console.log(`файлов страниц: ${readdirSync(OUT).length}; ресурсов к переносу: ${assets.size()}`);

if (!args.includes('--no-assets')) {
  const r = await assets.download();
  console.log(`ресурсы: ${r.total}, ошибок ${r.failed.length}`);
  for (const f of r.failed) console.log('  ✗', f);
}
