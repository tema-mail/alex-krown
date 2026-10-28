/** Фиды товаров магазина «Вариант 1» для рекламы и карта сайта.
    Google Merchant – RSS 2.0 с пространством g:, Яндекс – YML. Предложение – товар в конкретном
    размере (id = <uid>-<размер>), размеры одного товара и цвета одной модели (Product.group) связаны общим item_group_id / group_id.
    Цена со скидкой: Google – price (старая) + sale_price, Яндекс – price + oldprice. */
import { products, sections, infoPages, homeSection, sectionName, gender, metaDescription, adSafe, v1, img, BRAND, type Product } from './site';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]&gt;')}]]>`;
const money = (n: number) => n.toFixed(2);

/** описание для фидов: текст бренда + состав + размеры; без текста бренда – из фактов товара */
export function feedDescription(p: Product) {
  const parts = [adSafe(p.descr) || metaDescription(p)];
  if (p.composition) parts.push(`Состав: ${p.composition}.`);
  if (p.sizes.length) parts.push(`Размеры: ${p.sizes.map((s) => s.size).join(', ')}.`);
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 4900);
}

/* Google product category (числовые id таксономии Google) по виду товара */
function googleCategory(p: Product) {
  const k = `${p.kind} ${p.title} ${homeSection(p)?.path ?? ''}`.toLowerCase();
  if (/парфюм|аромат|perfume/.test(k)) return 479; // Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne
  if (/обув|кросс|ботин|кед|shoes/.test(k)) return 187; // Apparel & Accessories > Shoes
  if (/носк|socks/.test(k)) return 209; // Clothing > Underwear & Socks > Socks
  if (/шапк|кепк|бейсбол|панам|головн|hats/.test(k)) return 173; // Clothing Accessories > Hats
  if (/сумк|аксессуар|ремен|accessor/.test(k)) return 167; // Clothing Accessories
  return 1604; // Apparel & Accessories > Clothing
}

/* в фиды – только товары с фото; подарочный сертификат – не товар для торговой рекламы */
const feedProducts = () => products.filter((p) => p.photos.length && !/сертификат/i.test(p.title));
/* ссылка на размер: карточка выбирает его по ?size= и показывает его цену (цена бывает разной у размеров) */
const sizeLink = (p: Product, size: string) => v1(p.path) + (size ? `?size=${encodeURIComponent(size)}` : '');
const variants = (p: Product) => (p.sizes.length ? p.sizes : [{ size: '', price: p.price, priceOld: p.priceOld }]);
const productType = (p: Product) => {
  const h = homeSection(p);
  if (!h) return 'Каталог';
  const top = h.path.split('/').length > 2 ? sections.find((s) => s.path === h.path.split('/').slice(0, 2).join('/')) : undefined;
  return [top && sectionName(top), sectionName(h)].filter(Boolean).join(' > ');
};

export function googleFeed(site: URL) {
  const abs = (x: string) => new URL(x, site).href;
  const items = feedProducts()
    .flatMap((p) =>
      variants(p).map((v) => {
        const sale = v.priceOld && v.priceOld > v.price;
        const g = gender(p);
        return `<item>
<g:id>${esc(v.size ? `${p.uid}-${v.size}` : p.uid)}</g:id>
<g:item_group_id>${p.group ?? p.uid}</g:item_group_id>
<g:title>${esc(`${p.title}${v.size ? `, размер ${v.size}` : ''} – ${BRAND}`.slice(0, 150))}</g:title>
<g:description>${esc(feedDescription(p))}</g:description>
<g:link>${esc(abs(sizeLink(p, v.size)))}</g:link>
<g:image_link>${esc(abs(img(p.photos[0].name)))}</g:image_link>
${p.photos.slice(1, 11).map((ph) => `<g:additional_image_link>${esc(abs(img(ph.name)))}</g:additional_image_link>`).join('\n')}
<g:availability>in_stock</g:availability>${'' /* «под заказ» Google без даты поступления не принимает – остаётся in_stock, срок – в доставке (ТЕХДОЛГ) */}
<g:price>${money(sale ? v.priceOld! : v.price)} RUB</g:price>
${sale ? `<g:sale_price>${money(v.price)} RUB</g:sale_price>` : ''}
<g:brand>${BRAND}</g:brand>
<g:condition>new</g:condition>
<g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>${googleCategory(p)}</g:google_product_category>
<g:product_type>${esc(productType(p))}</g:product_type>
<g:age_group>adult</g:age_group>
<g:gender>${g}</g:gender>
${v.size ? `<g:size>${esc(v.size)}</g:size>` : ''}
${p.color ? `<g:color>${esc(p.color)}</g:color>` : ''}
${p.composition ? `<g:material>${esc(p.composition.slice(0, 200))}</g:material>` : ''}
</item>`.replace(/\n{2,}/g, '\n');
      }),
    );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${BRAND}</title>
<link>${esc(abs(v1('')))}</link>
<description>Дизайнерская одежда ${BRAND} для мужчин и женщин</description>
${items.join('\n')}
</channel>
</rss>
`;
}

export function yandexFeed(site: URL, date = new Date()) {
  const abs = (x: string) => new URL(x, site).href;
  /* категории – разделы каталога: мужское/женское и их подразделы, остальные разделы – верхний уровень */
  const cats = sections.filter((s) => s.path !== 'catalog' && s.path !== 'sale');
  const catId = new Map(cats.map((s) => [s.path, s.storepart]));
  const categories = cats
    .map((s) => {
      const parent = s.path.split('/').length > 2 ? catId.get(s.path.split('/').slice(0, 2).join('/')) : undefined;
      return `<category id="${s.storepart}"${parent ? ` parentId="${parent}"` : ''}>${esc(sectionName(s))}</category>`;
    })
    .join('\n');
  const offers = feedProducts()
    .flatMap((p) =>
      variants(p).map((v) => {
        const h = homeSection(p);
        const sale = v.priceOld && v.priceOld > v.price;
        const g = gender(p);
        return `<offer id="${(v.size ? `${p.uid}${v.size.replace(/[^A-Za-z0-9]/g, '')}` : p.uid).slice(0, 20)}" group_id="${(p.group ? p.group.slice(1) : p.uid).slice(-9)}" available="${p.preorder ? 'false' : 'true'}">
<name>${esc(p.title)}</name>
<vendor>${BRAND}</vendor>
<url>${esc(abs(sizeLink(p, v.size)))}</url>
<price>${v.price}</price>
${sale ? `<oldprice>${v.priceOld}</oldprice>` : ''}
<currencyId>RUR</currencyId>
<categoryId>${h ? catId.get(h.path) ?? cats[0].storepart : cats[0].storepart}</categoryId>
${p.photos.slice(0, 10).map((ph) => `<picture>${esc(abs(img(ph.name)))}</picture>`).join('\n')}
<description>${cdata(feedDescription(p))}</description>
${v.size ? `<param name="Размер" unit="${/^\d/.test(v.size) ? 'RU' : 'INT'}">${esc(v.size)}</param>` : ''}
${p.color ? `<param name="Цвет">${esc(p.color)}</param>` : ''}
${p.composition ? `<param name="Состав">${esc(p.composition)}</param>` : ''}
<param name="Пол">${g === 'male' ? 'Мужской' : g === 'female' ? 'Женский' : 'Унисекс'}</param>
</offer>`.replace(/\n{2,}/g, '\n');
      }),
    );
  return `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${date.toISOString().slice(0, 16).replace('T', ' ')}">
<shop>
<name>${BRAND}</name>
<company>${BRAND}</company>
<url>${esc(abs(v1('')))}</url>
<currencies><currency id="RUR" rate="1"/></currencies>
<categories>
${categories}
</categories>
<offers>
${offers.join('\n')}
</offers>
</shop>
</yml_catalog>
`;
}

export function sitemap(site: URL) {
  /* bonusnaya-programma – правила программы лояльности (docs/ПЛАН-ЛК.md, решение 6); кабинет /v1/lk/* в карту не входит */
  const paths = ['', ...sections.map((s) => s.path), ...products.map((p) => p.path), ...infoPages.map((pg) => pg.path), 'bonusnaya-programma'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${esc(new URL(v1(p), site).href)}</loc></url>`).join('\n')}
</urlset>
`;
}
