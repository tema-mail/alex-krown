/**
 * Данные новой главной (src/pages/new/) из перенесённого сайта.
 *
 *   node scripts/home-data.mjs
 *
 * 1. Товары блока «Уже в продаже» – из снимка API магазина (src/data/store/),
 *    цена и старая цена – из первого варианта товара, как показывает Тильда.
 *    Два фото товара скачиваются с CDN Тильды в public/home/img/p-*.webp.
 * 2. Картинки блоков главной (категории, акция, капсулы, лояльность, галерея)
 *    берутся из public/_t/ и сжимаются в public/home/img/<имя>.webp.
 * Итог – src/data/home.json (товары). Тексты блоков – в самой странице.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/home/img');
const T = join(ROOT, 'public/_t/static');
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36' };
mkdirSync(OUT, { recursive: true });

/* блок каталога «Уже в продаже» на главной – recid 798012268 */
const index = JSON.parse(readFileSync(join(ROOT, 'src/data/store/index.json'), 'utf8'));
const key = Object.keys(index).find((k) => k.includes('"798012268"') && k.includes('getproductslist'));
const list = JSON.parse(readFileSync(join(ROOT, 'src/data/store', index[key] + '.json'), 'utf8'));

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
const num = (s) => Math.round(parseFloat(String(s || '').replace(/\s/g, '')) || 0);

/* размеры картинок для width/height и srcset: имя → [ширина, высота] */
const sizes = {};
/* полная версия <имя>.webp и вдвое меньшая <имя>-s.webp для телефона */
async function save(input, name, width) {
  const out = join(OUT, name + '.webp');
  if (!existsSync(out)) await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
  const { width: w, height: h } = await sharp(out).metadata();
  const small = join(OUT, name + '-s.webp');
  if (!existsSync(small)) await sharp(out).resize({ width: Math.max(320, Math.round(w / 2)) }).webp({ quality: 78 }).toFile(small);
  sizes[name] = [w, h];
  return name;
}

async function fetchImg(url) {
  const r = await fetch(url, { headers: { ...UA, Referer: 'https://alex-krown.com/' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

const products = [];
for (const p of list.products) {
  const gallery = (typeof p.gallery === 'string' ? JSON.parse(p.gallery) : p.gallery) || [];
  const ed = (p.editions || [])[0] || {};
  const imgs = [];
  for (const [i, g] of gallery.slice(0, 2).entries()) imgs.push(await save(await fetchImg(g.img), `p-${p.uid}-${i + 1}`, 720));
  products.push({
    title: unescape(p.title),
    price: num(ed.price) || num(p.price),
    priceOld: num(ed.priceold) || num(p.priceold) || null,
    url: new URL(p.url).pathname,
    imgs,
  });
}

/* картинки блоков главной: имя → файл в public/_t/static, ширина */
const STATIC = {
  'cat-man': ['tild3263-6637-4561-b039-633732663364/_1.png', 900],
  'cat-woman': ['tild6233-3863-4334-a535-353934353065/_2_1.png', 900],
  'cat-menshoes': ['tild6162-3238-4461-b930-306365383132/Group_843.png', 900],
  'cat-womenshoes': ['tild3834-6564-4236-b738-366232613233/Group_844.png', 700],
  'cat-firmware': ['tild3132-3536-4361-b665-316232366334/photo_2021-09-20_00-.png', 800],
  'cat-perfume': ['tild3364-3132-4461-a237-396363363739/Group_839_1.png', 1000],
  'promo-couple': ['tild6365-6233-4131-a362-623362303062/Frame_139.png', 1400],
  'sub-robes': ['tild3831-3435-4562-a234-623961613161/Frame_159.png', 700],
  'sub-tshirts': ['tild3538-3736-4662-b630-303831613065/Frame_140.png', 700],
  'sub-tops': ['tild3438-6562-4738-a364-333361306366/IMG_6056-transformed.png', 700],
  'sub-sweatshirts': ['tild3034-3630-4261-b138-326238316163/E5887908-0352-4D2D-A.png', 700],
  'cap-1': ['tild3361-6539-4936-b930-333935313265/18483520-q82.webp', 1100],
  'cap-1a': ['tild6663-6434-4466-b961-653135653136/50838504-q82.webp', 600],
  'cap-1b': ['tild3433-3339-4962-b064-306631363862/94748718-q82.webp', 600],
  'cap-2': ['tild3031-6634-4534-a430-663736376663/FB92C926-q82.webp', 1100],
  'cap-2a': ['tild3465-6136-4263-a630-386362353631/1055A497-q82.webp', 600],
  'cap-2b': ['tild3865-3437-4235-b132-643962366564/2F48B36D-q82.webp', 600],
  'cap-3': ['tild3638-3635-4633-a538-333535356539/IMG_4580-q82.webp', 1100],
  'cap-3a': ['tild3762-3364-4935-b037-653564663037/IMG_4621_2-q82.webp', 600],
  'cap-3b': ['tild6266-3038-4630-b034-366136613064/IMG_4578-q82.webp', 600],
  'cap-4': ['tild3936-3966-4337-b936-333536626639/84439139-q82.webp', 1100],
  'cap-4a': ['tild6135-3565-4263-b036-623366396162/19476053-q82.webp', 600],
  'cap-4b': ['tild3939-6433-4532-a339-383662346138/58670070-q82.webp', 600],
  'bonus-gift-cards': ['tild6438-3237-4830-a333-323962643766/Group_813_optimized.webp', 700],
  'bonus-sets': ['tild3963-3337-4738-a565-363738396436/Frame_141_optimized.webp', 700],
  'bonus-loyal-card': ['tild6235-3766-4465-a639-383132613939/Group_815.png', 700],
};
const GALLERY = [
  'tild6130-3662-4231-a631-626130306634/photo.webp',
  'tild6465-6462-4533-a663-653931353864/1.webp',
  'tild6161-6261-4639-b063-663663653363/412.webp',
  'tild3736-3837-4764-b130-613535393363/13.webp',
  'tild3934-3263-4438-b434-633766333563/666.webp',
  'tild3364-3939-4130-a238-616465643333/75.webp',
  'tild6234-6661-4239-a139-376233386662/54.webp',
  'tild3137-6163-4338-b064-316234393530/222.webp',
  'tild3266-6538-4332-b539-623938663835/_.webp',
  'tild6362-3231-4066-b162-323936393836/8541.webp',
  'tild3335-6433-4636-a161-633239623331/321.webp',
  'tild3733-6566-4565-a630-323863316464/42.webp',
  'tild3337-3366-4633-b262-636162323865/652.webp',
  'tild6264-3033-4538-b533-643065353336/654895.webp',
  'tild6466-3733-4235-b364-653230393363/6523.webp',
  'tild3062-3363-4837-a230-623032373137/4444.webp',
];
for (const [name, [file, w]] of Object.entries(STATIC)) await save(join(T, file), name, w);
for (const [i, file] of GALLERY.entries()) await save(join(T, file), `gal-${i + 1}`, 1400);

/* «Новая коллекция» – Cardiogram Black: фото джоггеров с сайта, у худи на сайте фото нет – кадр из клипа VK
   (public/home/video/cardiogram-hoodie.webp, scripts/collection-media.mjs) */
await save(join(T, 'stor6365-3235-4837-a533-646466323365/c0bc16a7a684351843826f7d4ca5e08c.jpg'), 'cardiogram-joggers-photo', 720);
await save(join(ROOT, 'public/home/video/cardiogram-hoodie.webp'), 'cardiogram-hoodie-photo', 480);

writeFileSync(join(ROOT, 'src/data/home.json'), JSON.stringify({ products, gallery: GALLERY.length, sizes }, null, 1));
console.log(`товаров: ${products.length}, картинок блоков: ${Object.keys(STATIC).length}, галерея: ${GALLERY.length}`);
