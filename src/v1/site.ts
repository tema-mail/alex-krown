/** Общие данные и помощники магазина «Вариант 1»: товары и разделы (scripts/v1-data.mjs),
    адреса с подпапкой Pages, цены, меню, контакты. Пути в данных – как на alex-krown.com,
    на сайте они живут под /v1/. */
import productsJson from '../data/v1/products.json';
import sectionsJson from '../data/v1/sections.json';
import pagesJson from '../data/v1/pages.json';

export interface Photo { name: string; w: number; h: number }
export interface Size { size: string; price: number; priceOld: number | null }
export interface Product {
  uid: string; path: string; title: string; price: number; priceOld: number | null; sizes: Size[];
  kind: string; color: string; descr: string; composition: string; sizeChart: Photo | null;
  parts: string[]; sort: number; photos: Photo[];
}
export interface Section { path: string; storepart: string; title: string; description: string; h1: string; name: string | null; uids: string[] }
export interface InfoPage { path: string; title: string; description: string; h1: string; paras: string[] }

export const products = productsJson as Product[];
export const sections = sectionsJson as Section[];
export const infoPages = pagesJson as InfoPage[];
export const byUid = new Map(products.map((p) => [p.uid, p]));

export const BRAND = 'ALEX KROWN';
export const PHONE = '+7 983-005-58-59';
export const PHONE_DIGITS = '79830055859';
export const EMAIL = 'alex.crown2021@gmail.com';
export const ADDRESS = 'Новосибирск, Красный проспект 161';
export const SOCIAL = [
  ['Instagram', 'https://instagram.com/alex_krown_'],
  ['Telegram', 'https://t.me/Alex_Krown'],
  ['VK', 'https://vk.com/alex_krown'],
  ['WhatsApp', 'https://api.whatsapp.com/message/XAQLYFCWCUSSA1?autoload=1&app_absent=0'],
] as const;

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
/** Адрес страницы магазина: путь как на оригинале → /<base>/v1/<путь>/ */
export const v1 = (path = '') => `${BASE}/v1/${path.replace(/^\/|\/$/g, '')}${path ? '/' : ''}`.replace(/\/{2,}/g, '/');
/** Адрес файла из public/ с учётом подпапки */
export const asset = (p: string) => `${BASE}/${p.replace(/^\//, '')}`;
export const img = (name: string) => asset(`v1/img/${name}.webp`);
/** srcset фото товара: 480 и 960 px */
export const srcset = (ph: Photo) => (ph.w > 480 ? `${img(ph.name + '-s')} 480w, ${img(ph.name)} ${ph.w}w` : `${img(ph.name)} ${ph.w}w`);
export const rub = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';

export const section = (path: string) => sections.find((s) => s.path === path);
/** Подразделы раздела: catalog/man → catalog/man/hoodie… (только непустые) */
export const subsOf = (path: string) => sections.filter((s) => s.path.startsWith(path + '/') && !s.path.slice(path.length + 1).includes('/') && s.uids.length);
/** Самый узкий раздел товара – для хлебных крошек и «похожих» */
export function homeSection(p: Product): Section | undefined {
  const own = sections.filter((s) => s.uids.includes(p.uid) && s.path !== 'catalog' && s.path !== 'sale');
  return own.sort((a, b) => b.path.split('/').length - a.path.split('/').length || a.uids.length - b.uids.length)[0];
}
/** Короткое имя раздела для меню и крошек */
export function sectionName(s: Section) {
  const m = MENU.find(([, p]) => p === s.path);
  if (m) return m[0];
  if (s.path === 'catalog') return 'Каталог';
  if (s.name) return s.name.charAt(0).toUpperCase() + s.name.slice(1);
  return s.h1.replace(/\s*ALEX KROWN\s*$/i, '').replace(/ дизайнерская одежда/i, '').trim();
}
export const gender = (p: Product) =>
  p.parts.includes('379061541892') || p.path.includes('/man/') ? 'male' : p.parts.includes('319168061712') || p.path.includes('/woman/') ? 'female' : 'unisex';

/** Мат в рекламе запрещён (Google Shopping, ст. 5 закона «О рекламе»): в фидах и мета-описаниях
    строки с ним убираются. На странице товара текст бренда остаётся как есть (это надпись-принт). */
const PROFANE = /(?:^|[^а-яё])(?:х[уy][йеёяию]|пизд|бля[дт]|[её]б[аеиуы]|муда|залуп|пидор)/i;
export const adSafe = (t: string) => t.split(/(?<=[.!?»])\s+|\n/).filter((x) => !PROFANE.test(x)).join(' ').replace(/\s+/g, ' ').trim();
/** минимальная цена по размерам – если цена зависит от размера, на витрине «от …» */
export const minPrice = (p: Product) => Math.min(p.price, ...p.sizes.map((s) => s.price));
export const priceVaries = (p: Product) => new Set([p.price, ...p.sizes.map((s) => s.price)]).size > 1;

/** Описание для meta description и фидов: текст бренда + факты (цена, размеры, состав), до ~160 знаков */
export function metaDescription(p: Product) {
  const first = adSafe(p.descr).split(/(?<=[.!?])\s/)[0] || '';
  const sizes = p.sizes.length ? ` Размеры ${p.sizes.map((s) => s.size).join(', ')}.` : '';
  const base = `${p.title} от ${BRAND} – ${priceVaries(p) ? 'от ' : ''}${rub(minPrice(p))}.${sizes} ${first}`.trim();
  return base.length > 165 ? base.slice(0, 162).replace(/\s+\S*$/, '') + '…' : base;
}

export const MENU = [
  ['Мужская одежда', 'catalog/man'],
  ['Женская одежда', 'catalog/woman'],
  ['Мужская обувь', 'menshoes'],
  ['Женская обувь', 'womenshoes'],
  ['Перепрошивка', 'firmware'],
  ['Аксессуары', 'accessories'],
  ['Головные уборы', 'hats'],
  ['Парфюм', 'perfume'],
  ['Носки', 'socks'],
  ['Наборы со скидкой', 'sale'],
] as const;
export const FOOTER = [
  ['Подробнее', [['О бренде', 'about'], ['Доставка и оплата', 'payment_and_delivery'], ['Контакты', 'contacts']]],
  ['Данные', [['Пользовательское соглашение', 'processing_of_personal_data'], ['Политика конфиденциальности', 'privatepolicy'], ['Договор оферты', 'offer_agreement']]],
  ['Помощь', [['Связаться с нами', 'contacts'], ['Рекомендации по уходу', 'recomendation'], ['Размерная сетка', 'size_chart'], ['Обмен и возврат', 'return']]],
] as const;
