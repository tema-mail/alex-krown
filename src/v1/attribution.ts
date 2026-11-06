// Откуда пришла заявка: источник (Яндекс / Google, реклама / поиск), страница заявки, страница входа и все метки.
// Запоминается при заходе на 30 дней и не теряется при переходах по сайту. Подключён в общем шаблоне на всех страницах.
const KEY = 'lead_attribution';
const TTL = 30 * 24 * 60 * 60 * 1000;
const CLICK_IDS = ['yclid', 'gclid', 'gbraid', 'wbraid'];

export type Attribution = { channel: string; landing: string; referrer: string; marks: Record<string, string>; at: number };

/** Все рекламные метки адреса: любые utm_* и идентификаторы кликов. */
export function marksOf(params: URLSearchParams): Record<string, string> {
  const marks: Record<string, string> = {};
  params.forEach((v, k) => {
    const key = k.toLowerCase();
    if (v && (key.startsWith('utm_') || CLICK_IDS.includes(key))) marks[key] = v.slice(0, 200);
  });
  return marks;
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

const YANDEX_HOST = /^(yandex\.(ru|by|kz|ua|uz|com|com\.tr|net)|ya\.ru)$/;
const GOOGLE_HOST = /^google\.(com?\.)?[a-z]{2,3}$/;
const SOCIAL_HOST = /(^|\.)(vk\.(com|ru)|ok\.ru|t\.me|telegram\.org|instagram\.com|dzen\.ru|youtube\.com)$/;
const PAID_MEDIUM = /^(cpc|ppc|cpm|cpa|cpv|paid|paid_?search|ads?|display|retargeting|remarketing|banner)$/;

/** Источник простыми словами – по меткам, а без меток по сайту, с которого пришли. */
export function classify(marks: Record<string, string>, referrer: string, host: string): string {
  const s = (marks.utm_source || '').toLowerCase();
  const medium = (marks.utm_medium || '').toLowerCase();
  const organic = /^(organic|seo)$/.test(medium);
  const paid = !medium || PAID_MEDIUM.test(medium);
  if (/geoadv|yabs/.test(s) || /geoadv|yabs/.test((marks.utm_referer || '').toLowerCase())) return 'Яндекс Бизнес (реклама)';
  if (marks.yclid) return 'Яндекс реклама';
  if (marks.gclid || marks.gbraid || marks.wbraid) return 'Google реклама';
  const yandex = /^(yandex|ya|yadirect)([_.-].*)?$/.test(s) || s === 'direct';
  const google = /^(google|gads|adwords)([_.-].*)?$/.test(s) || s === 'googlemybusiness';
  if (yandex && /map/.test(s)) return 'Яндекс Карты';
  if (google && /map|mybusiness|gmb/.test(s)) return 'Google Карты';
  if (yandex && organic) return 'Яндекс поиск';
  if (google && organic) return 'Google поиск';
  if (yandex && paid) return 'Яндекс реклама';
  if (google && paid) return 'Google реклама';
  if (s) return `Метка: ${s}`;
  if (medium && PAID_MEDIUM.test(medium)) return 'Реклама: источник не указан';
  const other = Object.values(marks)[0];
  if (other) return `Метка: ${other}`;
  const ref = hostOf(referrer);
  if (!ref || ref === host.replace(/^www\./, '').toLowerCase()) return 'Прямой заход';
  const path = (() => { try { return new URL(referrer).pathname; } catch { return ''; } })();
  // Браузер часто обрезает адрес до домена: тогда переход с Яндекс Карт виден как «Яндекс поиск».
  if (YANDEX_HOST.test(ref)) return path.startsWith('/maps') ? 'Яндекс Карты' : 'Яндекс поиск';
  if (/^maps\.(google\.|app\.goo\.gl$)/.test(ref)) return 'Google Карты';
  if (GOOGLE_HOST.test(ref)) return path.startsWith('/maps') ? 'Google Карты' : 'Google поиск';
  if (SOCIAL_HOST.test(ref)) return `Соцсети: ${ref}`;
  return `Сайт: ${ref}`;
}

function current(): Attribution {
  const marks = marksOf(new URLSearchParams(location.search));
  return { channel: classify(marks, document.referrer, location.hostname), landing: location.pathname, referrer: document.referrer, marks, at: Date.now() };
}

function saved(): Attribution | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || 'null') as Attribution | null;
    return a && Date.now() - a.at < TTL ? a : null;
  } catch { return null; }
}

const isAd = (a: Attribution) => a.channel.includes('реклама') || a.channel.startsWith('Реклама');

/** Новая реклама заменяет всё; другая метка заменяет всё, кроме рекламы; заход с другого сайта заменяет только прямой. */
export function capture(): Attribution {
  const now = current();
  const old = saved();
  const hasMarks = Object.keys(now.marks).length > 0;
  const replace = !old || isAd(now) || (hasMarks && !isAd(old)) || (old.channel === 'Прямой заход' && now.channel !== 'Прямой заход');
  if (!replace) return old as Attribution;
  try { localStorage.setItem(KEY, JSON.stringify(now)); } catch { /* браузер не дал память: источник останется только для этой страницы */ }
  return now;
}

/** Поля для заявки: сюда же можно дописать поля формы. */
export function leadFields(): Record<string, string> {
  const a = capture();
  return { 'Источник': a.channel, 'Страница заявки': location.pathname, 'Страница входа': a.landing, ...a.marks };
}

/** Одной строкой – для приёмников, где под источник одно поле. */
export function sourceLine(): string {
  const a = capture();
  const marks = Object.entries(a.marks).map(([k, v]) => `${k}=${v}`).join(' ');
  return [a.channel, `вход: ${a.landing}`, marks].filter(Boolean).join(' · ');
}

if (typeof window !== 'undefined') capture();
