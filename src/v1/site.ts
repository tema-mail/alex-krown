/** Общие данные и помощники магазина «Вариант 1»: товары и разделы (scripts/v1-data.mjs),
    адреса с подпапкой Pages, цены, меню, контакты. Пути в данных – как на alex-krown.com,
    на сайте они живут под /v1/. */
import productsJson from '../data/v1/products.json';
import sectionsJson from '../data/v1/sections.json';
import pagesJson from '../data/v1/pages.json';
import { productSlug, sectionUrl, trimPath } from './urls';

export interface Photo { name: string; w: number; h: number }
export interface Size { size: string; price: number; priceOld: number | null }
export interface Product {
  uid: string; path: string; title: string; price: number; priceOld: number | null; sizes: Size[];
  kind: string; color: string; descr: string; composition: string; sizeChart: Photo | null;
  parts: string[]; sort: number; photos: Photo[];
  /** скрыт с сайта (админка) */
  hidden?: boolean;
  seoTitle?: string;
  seoDescr?: string;
  /** под заказ (админка, владелец 28.10.2026); нет поля – в наличии. Остатки не ведём */
  preorder?: boolean;
  /** модель в нескольких цветах: общий id (m<uid>) у всех цветов – переключатель цвета на карточке, группа в фидах */
  group?: string;
}
export interface Section {
  path: string; storepart: string; title: string; description: string; h1: string; name: string | null; uids: string[];
  /** текст раздела под H1 */ intro?: string;
  /** SEO-текст и вопросы под сеткой товаров (мантии, 03.11.2026) */ textTitle?: string; text?: string[]; faq?: { q: string; a: string }[];
}
export interface InfoPage { path: string; title: string; description: string; h1: string; paras: string[] }

/** все товары (админка); на сайт, в разделы, фиды и карту сайта идут только видимые */
export const allProducts = productsJson as Product[];
export const products = allProducts.filter((p) => !p.hidden);
const visible = new Set(products.map((p) => p.uid));
export const sections = (sectionsJson as Section[]).map((s) => ({ ...s, uids: s.uids.filter((u) => visible.has(u)) }));
/** разделы как в данных, со скрытыми товарами – для админки */
export const allSections = sectionsJson as Section[];
export const infoPages = pagesJson as InfoPage[];
export const byUid = new Map(products.map((p) => [p.uid, p]));

export const BRAND = 'ALEX KROWN';
export const PHONE = '+7 983-005-58-59';
export const PHONE_DIGITS = '79830055859';
export const EMAIL = 'alex.crown2021@gmail.com';
export const ADDRESS = 'Новосибирск, Красный проспект 161';
/* Instagram не размещаем (владелец 17.11.2026: Meta признана в РФ экстремистской, ссылки на её сети на российском сайте – риск) */
export const SOCIAL = [
  ['Telegram', 'https://t.me/Alex_Krown'],
  ['VK', 'https://vk.com/alex_krown'],
] as const;

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
/* Адрес товара «каталог/раздел/подраздел/товар» (владелец 17.11.2026): в данных путь как на Тильде
   (catalog/man/tproduct/<номер>-<название>), на сайте – самый узкий раздел товара + название без номера:
   /catalog/man/t-shirts/futbolka-black-cross/. Совпадение названий в одном разделе – суффикс -2, -3. */
const productUrls = new Map<string, string>();
{
  const used = new Set(sections.map((s) => sectionUrl(s.path)));
  for (const p of allProducts) {
    const home = p.hidden ? undefined : homeSection(p);
    const base = home ? sectionUrl(home.path) : sectionUrl(p.path.split('/tproduct/')[0]);
    const slug = productSlug(p.path);
    let url = `${base}/${slug}`;
    for (let k = 2; used.has(url); k++) url = `${base}/${slug}-${k}`;
    used.add(url);
    productUrls.set(trimPath(p.path), url);
  }
}
/** Путь страницы на сайте: товар – по таблице выше, раздел – внутри каталога, остальное как есть */
export const pagePath = (path: string) => productUrls.get(trimPath(path)) ?? sectionUrl(path);
/** Старые адреса товаров (Тильда) → новые – для перенаправлений 301 */
export const productRedirects = () => [...productUrls].map(([from, to]) => [from, to] as const);
/** Адрес страницы магазина: путь из данных → /<base>/v1/<путь на сайте>/ */
export const v1 = (path = '') => {
  const p = pagePath(path);
  return `${BASE}/v1/${p}${p ? '/' : ''}`.replace(/\/{2,}/g, '/');
};
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
  /* сначала – раздел, где товар лежит в данных (hats, catalog/man…), и его подразделы: бейсболка из «Головных уборов»
     не уезжает в «Мужскую одежду» (17.11.2026, адрес «каталог/раздел/подраздел/товар»); нет таких – любой раздел */
  const origin = p.path.split('/tproduct/')[0];
  const all = sections.filter((s) => s.uids.includes(p.uid) && s.path !== 'catalog' && s.path !== 'sale');
  const mine = all.filter((s) => s.path === origin || s.path.startsWith(origin + '/'));
  const own = mine.length ? mine : all;
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
/** Меню: фото раздела при наведении (владелец 17.11.2026 выбрал вариант «фото раздела при наведении», фото – из товаров
    раздела, не вырезки); MENU_INFO – справа под фото (юридические ссылки – только в подвале). */
export const MENU_PHOTO: Record<string, string> = {
  'catalog/man': '894573673672-1', 'catalog/woman': '698296891903-1', menshoes: '616315678593-1', womenshoes: 'menu-womenshoes',
  firmware: '580390081822-1', accessories: '249480458932-1', hats: '296025952292-1', perfume: '719239199112-1',
  socks: '989932552462-1', sale: '797620854102-1',
};
export const MENU_INFO = [
  ['О бренде', 'about'], ['Доставка и оплата', 'payment_and_delivery'], ['Контакты', 'contacts'],
  ['Рекомендации по уходу', 'recomendation'], ['Размерная сетка', 'size_chart'], ['Обмен и возврат', 'return'],
] as const;
export const FOOTER = [
  /* колонка разделов каталога (владелец 17.11.2026: «добавить разделы каталога в подвал») */
  ['Каталог', [['Мужская одежда', 'catalog/man'], ['Женская одежда', 'catalog/woman'], ['Мужская обувь', 'menshoes'], ['Женская обувь', 'womenshoes'], ['Аксессуары', 'accessories'], ['Парфюм', 'perfume'], ['Наборы со скидкой', 'sale'], ['Бонусная программа', 'bonus-program']]],
  ['Подробнее', [['О бренде', 'about'], ['Доставка и оплата', 'payment_and_delivery'], ['Контакты', 'contacts']]],
  ['Данные', [['Согласие на обработку персональных данных', 'processing_of_personal_data'], ['Политика конфиденциальности', 'privatepolicy'], ['Договор оферты', 'offer_agreement']]],
  ['Помощь', [['Связаться с нами', 'contacts'], ['Рекомендации по уходу', 'recomendation'], ['Размерная сетка', 'size_chart'], ['Обмен и возврат', 'return']]],
] as const;
