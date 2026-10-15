/**
 * Локализация ресурсов Тильды для scripts/tilda-port.mjs.
 *
 * Все внешние ресурсы страницы (скрипты и стили платформы, картинки, шрифты,
 * owl.carousel с cdnjs, /custom.css с корня сайта) переезжают в public/_t/:
 *   https://static.tildacdn.com/js/x.min.js   → /_t/static/js/x.min.js
 *   https://thb.tildacdn.com/tildID/-/resize/20x/a.png → /_t/thb/tildID/-/resize/20x/a.png
 *   https://cdnjs.cloudflare.com/ajax/libs/…  → /_t/cdnjs/ajax/libs/…
 *   https://alex-krown.com/custom.css         → /_t/site/custom.css
 * Пути в HTML корневые (/_t/…) – подпапку Pages дописывает маршрут при сборке.
 * Внутри CSS пути относительные, поэтому от подпапки не зависят.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';

const HOSTS = [
  [/^(static\d?|thb|thumb|optim)\.tildacdn\.[a-z]+$/, (m) => (m[1].startsWith('static') ? 'static' : m[1])],
  [/^cdnjs\.cloudflare\.com$/, () => 'cdnjs'],
  [/^(?:www\.)?alex-krown\.com$/, () => 'site'],
];

/* адрес на CDN в тексте: обычный и экранированный в JSON (https:\/\/…) */
const CDN_RE =
  /(?:https?:)?(\\?\/)\1(static\d?|thb|thumb|optim)\.tildacdn\.(?:com|net|info|pro|one)((?:\\?\/[^\s"'()<>\\?#,&]*)+)(\?[^\s"'()<>\\#]*)?/g;
const CDNJS_RE = /https:\/\/cdnjs\.cloudflare\.com(\/ajax\/libs\/[^\s"'()<>?#]+)/g;

export function createAssets({ publicDir, cacheDir }) {
  const want = new Map(); // локальный путь (/_t/…) → исходный адрес

  function local(url) {
    const u = new URL(url);
    for (const [re, sub] of HOSTS) {
      const m = u.hostname.match(re);
      if (m) return `/_t/${sub(m)}${u.pathname}`;
    }
    return null;
  }

  function add(url) {
    const path = local(url);
    if (path && !want.has(path)) want.set(path, url);
    return path;
  }

  /** Заменяет адреса CDN в HTML/JS-тексте страницы на локальные /_t/… */
  function mapText(s) {
    s = s.replace(CDN_RE, (_m, sl, host, path) => {
      const esc = sl === '\\/';
      const clean = path.replace(/\\\//g, '/');
      if (clean === '/' || clean === '') return _m;
      const loc = add(`https://${host.startsWith('static') ? 'static' : host}.tildacdn.com${clean}`);
      return esc ? loc.replace(/\//g, '\\/') : loc;
    });
    s = s.replace(CDNJS_RE, (_m, path) => add(`https://cdnjs.cloudflare.com${path}`));
    /* /custom.css с корня сайта (с кэш-меткой ?t=…) */
    s = s.replace(/(["'])(?:https:\/\/alex-krown\.com)?\/custom\.css(?:\?[^"']*)?\1/g, (_m, q) => q + add('https://alex-krown.com/custom.css') + q);
    return s;
  }

  async function get(url) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { headers: { Referer: 'https://alex-krown.com/' } });
        if (!r.ok) throw new Error(`${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      } catch (e) {
        if (i === 2) throw e;
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    }
  }

  /** url(...) и @import внутри CSS: скачать и переписать относительным путём */
  function mapCss(css, cssUrl, cssLocal) {
    const rel = (target) => {
      const loc = add(target);
      return loc ? posix.relative(posix.dirname(cssLocal), loc) : null;
    };
    return css
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
        if (/^(data:|#)/.test(ref)) return m;
        let abs;
        try {
          abs = new URL(ref, cssUrl);
        } catch {
          return m;
        }
        const r = rel(abs.href.replace(/[?#].*$/, ''));
        return r ? `url(${q}${r}${abs.hash}${q})` : m;
      })
      .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, ref) => {
        const r = rel(new URL(ref, cssUrl).href);
        return r ? `@import ${q}${r}${q}` : m;
      });
  }

  /** Скачивает всё, что набрали mapText/mapCss (CSS тянет за собой шрифты и картинки). */
  async function download({ concurrency = 6, onImage } = {}) {
    const done = new Set();
    const failed = [];
    let pending;
    while ((pending = [...want.keys()].filter((p) => !done.has(p))).length) {
      let i = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (i < pending.length) {
            const path = pending[i++];
            done.add(path);
            const url = want.get(path);
            const out = join(publicDir, decodeURIComponent(path));
            const raw = join(cacheDir, 'assets', decodeURIComponent(path));
            try {
              if (!(existsSync(raw) && statSync(raw).size > 0)) {
                mkdirSync(dirname(raw), { recursive: true });
                writeFileSync(raw, await get(url));
              }
              mkdirSync(dirname(out), { recursive: true });
              if (/\.css$/i.test(path)) writeFileSync(out, mapCss(readFileSync(raw, 'utf8'), url, path));
              else if (onImage && /\.(jpe?g|png)$/i.test(path)) await onImage(raw, out);
              else writeFileSync(out, readFileSync(raw));
            } catch (e) {
              failed.push(`${url} – ${e.message}`);
            }
          }
        }),
      );
    }
    return { total: done.size, failed };
  }

  return { mapText, download, local, size: () => want.size, relativeTo: (p) => relative(publicDir, p) };
}
