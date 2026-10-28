import { useState } from 'preact/hooks';
import { slugify } from './gh';

/* Окно «Импорт CSV» – перенесено из админки Elite Rose (src/islands/admin/CsvImport.tsx): те же шаги
   «Файл → Как загружать → Колонки», шаблон и выгрузка текущих товаров. Отличие: у эталона загрузка –
   демо («подключим, когда решим, где хранить товары»); здесь хранилище решено (src/data/v1/*.json
   через gh.ts), поэтому файл разбирается, показывается предпросмотр изменений, а «Загрузить» сохраняет
   их одним коммитом тем же механизмом, что и правка товара. Колонки – формат выгрузки эталона
   (магазин Тильды), под модель ALEX KROWN: номер товара, несколько каталогов, размеры, остаток.
   Этот же модуль формирует выгрузку (downloadCsv) – в браузере, после входа в кабинет: отдельного адреса
   с файлом нет, чтобы товары (и скрытые) не отдавались без логина и пароля. */

type P = Record<string, any> & { uid: string; path: string; title: string; price: number; priceOld: number | null; sizes: { size: string; price: number; priceOld: number | null }[] };
type S = { path: string; uids: string[] } & Record<string, any>;

export const CSV_COLUMNS: [string, string, string][] = [
  ['Tilda UID', 'Номер товара; пусто – новый товар', '894573673672'],
  ['Category', 'Каталоги через «;» – адреса разделов, как в админке', 'catalog/man/t-shirts;sale'],
  ['Title', 'Название', 'Футболка мужская'],
  ['Kind', 'Вид товара', 'Футболка'],
  ['Color', 'Цвет', 'Черный'],
  ['Description', 'Описание', 'Футболка имеет актуальный удлинённый крой…'],
  ['Composition', 'Состав', '95% хлопок, 5% эластан'],
  ['Photo', 'Ссылки на фото через пробел – только выгрузка, фото меняются в карточке', 'https://…/1.webp https://…/2.webp'],
  ['Price', 'Цена', '3790'],
  ['Price Old', 'Старая цена; пусто – без скидки', '4800'],
  ['Sizes', 'Размеры через «;»; своя цена размера – через «:»', 'S;M;L;XL:3990'],
  ['Availability', 'Наличие: «в наличии» или «под заказ»; пусто – в наличии', 'в наличии'],
  ['Url', 'Адрес страницы – только выгрузка', ''],
];
const COLS = CSV_COLUMNS.map((c) => c[0]);
const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** размеры одной строкой: цена размера пишется, только если отличается от цены товара */
export const encSizes = (p: P) =>
  p.sizes.map((s) => (s.priceOld !== p.priceOld ? `${s.size}:${s.price}:${s.priceOld ?? ''}` : s.price !== p.price ? `${s.size}:${s.price}` : s.size)).join(';');
const decSizes = (v: string, price: number, priceOld: number | null) =>
  v.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [size, pr, old] = x.split(':').map((y) => y.trim());
    return { size, price: pr ? Number(pr) : price, priceOld: old === undefined ? priceOld : old ? Number(old) : null };
  });

export const csvRow = (p: P, cats: string[], photoUrl: (name: string) => string, url: string) =>
  [p.uid, cats.join(';'), p.title, p.kind, p.color, p.descr, p.composition, (p.photos ?? []).map((ph: any) => photoUrl(ph.name)).join(' '),
    p.price, p.priceOld ?? '', encSizes(p), p.preorder ? 'под заказ' : 'в наличии', url].map(q).join(';');
/** файл CSV как у эталона: UTF-8 с BOM, разделитель «;» – открывается в Excel */
export const csvFile = (rows: string[]) => '﻿' + [COLS.join(';'), ...rows].join('\r\n');

/** «Экспорт CSV»: все товары, включая скрытые, – файл скачивается из браузера, в формате окна импорта */
export function downloadCsv(raw: P[], secs: S[], imgBase: string, siteBase: string) {
  const abs = (u: string) => new URL(u, location.origin).href;
  const rows = raw.map((p) => csvRow(p, secs.filter((s) => s.path !== 'catalog' && s.uids.includes(p.uid)).map((s) => s.path),
    (name) => abs(`${imgBase}/${name}.webp`), abs(`${siteBase}/${p.path}/`)));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csvFile(rows)], { type: 'text/csv;charset=utf-8' }));
  a.download = 'products.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const head = text.split(/\r?\n/, 1)[0];
  const sep = (head.match(/;/g)?.length ?? 0) >= (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') text[i + 1] === '"' ? ((cell += '"'), i++) : (inQ = false);
      else if (!(c === '\r' && text[i + 1] === '\n')) cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}
const num = (v: string) => { const t = v.replace(/[\s ₽]/g, '').replace(',', '.'); return t === '' ? null : Number(t); };
const rub = (n: number | null | undefined) => (n == null ? 'пусто' : n.toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽');

type Opts = { update: boolean; add: boolean; hide: boolean };
type Change = { uid: string; title: string; kind: 'new' | 'upd' | 'hide'; lines: string[] };
type Plan = { raw: P[]; secs: S[]; changes: Change[]; warns: string[] };

/** разбор файла → новые товары и каталоги + список изменений для предпросмотра */
function plan(text: string, raw: P[], secs: S[], opts: Opts, placeIn: (s: S[], uid: string, want: string[]) => S[]): Plan {
  const rows = parseCsv(text);
  const head = (rows.shift() ?? []).map((h) => h.trim());
  const at = (r: string[], col: string) => { const i = head.indexOf(col); return i < 0 ? undefined : r[i] ?? ''; };
  const warns: string[] = [];
  if (!head.includes('Tilda UID') && !head.includes('Title')) return { raw, secs, changes: [], warns: ['В файле нет колонок Tilda UID и Title – это не выгрузка товаров'] };
  /* Excel портит выгрузку при сохранении: 12-значные номера → «8,94574E+11», кириллица → cp1251. Такой файл
     создал бы дубли всех товаров – не загружаем, объясняем, как сохранить правильно (ревизия 16.10.2026) */
  if (rows.some((r) => /^\d+([.,]\d+)?e\+?\d+$/i.test((at(r, 'Tilda UID') ?? '').trim())))
    return { raw, secs, changes: [], warns: ['Номера товаров в файле испорчены (вид «8,94574E+11») – так их сохраняет Excel. Перед правкой выделите колонку Tilda UID → Формат ячеек → Текстовый, или откройте файл через «Данные → Из текста/CSV» с типом «Текст» для этой колонки.'] };
  if (rows.some((r) => r.some((c) => c.includes('\uFFFD'))))
    return { raw, secs, changes: [], warns: ['В файле испорчены русские буквы (знаки «�») – файл сохранён не в UTF-8. В Excel: «Сохранить как» → «CSV UTF-8 (разделитель – запятая)», в Numbers и Google Таблицах – экспорт в CSV.'] };
  const known = new Set(secs.map((s) => s.path));
  const secOf = (uid: string) => secs.filter((s) => s.path !== 'catalog' && s.uids.includes(uid)).map((s) => s.path);
  const byUid = new Map(raw.map((p) => [p.uid, p]));
  const seen = new Set<string>();
  let nextRaw = [...raw], nextSecs = secs;
  const changes: Change[] = [];

  rows.forEach((r, i) => {
    const line = i + 2;
    const uid0 = (at(r, 'Tilda UID') ?? '').trim();
    const old = uid0 ? byUid.get(uid0) : undefined;
    if (old ? !opts.update : !opts.add) return;
    const uid = old ? old.uid : /^\d+$/.test(uid0) ? uid0 : String(Date.now() + i);
    seen.add(uid);
    const base: P = old ?? { uid, path: '', title: '', price: 0, priceOld: null, sizes: [], kind: '', color: '', descr: '', composition: '', sizeChart: null, parts: [], sort: 0, photos: [] };
    const next: P = { ...base };
    const lines: string[] = [];
    for (const [col, key, name] of [['Title', 'title', 'Название'], ['Kind', 'kind', 'Вид'], ['Color', 'color', 'Цвет'], ['Description', 'descr', 'Описание'], ['Composition', 'composition', 'Состав']] as const) {
      const v = at(r, col);
      if (v !== undefined && v !== (base[key] ?? '')) (next[key] = v), lines.push(key === 'descr' || key === 'composition' ? `${name}: изменено` : `${name}: «${base[key] ?? ''}» → «${v}»`);
    }
    for (const [col, key, name] of [['Price', 'price', 'Цена'], ['Price Old', 'priceOld', 'Старая цена']] as const) {
      const v = at(r, col);
      if (v === undefined) continue;
      const n = num(v);
      if (n !== null && !(n >= 0)) { warns.push(`Строка ${line}: в колонке ${col} не число «${v}» – значение пропущено`); continue; }
      if (key === 'price' && n === null) { if (!old) warns.push(`Строка ${line}: нет цены`); continue; }
      if (n !== (base[key] ?? null)) ((next as Record<string, unknown>)[key] = n), lines.push(`${name}: ${rub(base[key])} → ${rub(n)}`); // цена null отсеяна выше, старая цена может быть null
    }
    /* наличие: «под заказ» – preorder, иначе в наличии; остатки не ведём, старое поле stock убираем */
    const av = at(r, 'Availability');
    if (av !== undefined) {
      const pre = /под\s*заказ|preorder/i.test(av);
      if (pre !== !!base.preorder) lines.push(`Наличие: ${base.preorder ? 'под заказ' : 'в наличии'} → ${pre ? 'под заказ' : 'в наличии'}`);
      if (pre) next.preorder = true; else delete next.preorder;
    }
    delete next.stock;
    /* размеры без своей цены идут за ценой товара – как в карточке товара */
    const sz = at(r, 'Sizes') ?? encSizes(base);
    next.sizes = decSizes(sz, next.price, next.priceOld);
    if (next.sizes.some((s) => !(s.price >= 0) || (s.priceOld !== null && !(s.priceOld >= 0)))) { warns.push(`Строка ${line}: размеры «${sz}» не разобраны – оставлены прежние`); next.sizes = base.sizes; }
    else if (encSizes(next) !== encSizes(base)) lines.push(`Размеры: ${encSizes(base) || 'нет'} → ${encSizes(next) || 'нет'}`);
    const cat = at(r, 'Category');
    let want = secOf(uid);
    if (cat !== undefined) {
      const list = cat.split(';').map((x) => x.trim().replace(/^\/|\/$/g, '')).filter(Boolean);
      list.filter((x) => !known.has(x)).forEach((x) => warns.push(`Строка ${line}: каталога «${x}» нет – пропущен`));
      want = list.filter((x) => known.has(x) && x !== 'catalog');
      if ([...want].sort().join() !== secOf(uid).sort().join()) lines.push(`Каталоги: ${secOf(uid).join(', ') || 'нет'} → ${want.join(', ') || 'нет'}`);
    }
    if (!old) {
      if (!next.title.trim() || !next.price) { warns.push(`Строка ${line}: новый товар без названия или цены – пропущен`); return; }
      const top = want.find((s) => s.startsWith('catalog/man')) ? 'catalog/man' : want.find((s) => s.startsWith('catalog/woman')) ? 'catalog/woman' : 'catalog';
      next.path = `${top}/tproduct/${uid}-${slugify(next.title)}`;
      nextRaw = [next, ...nextRaw];
      nextSecs = placeIn(nextSecs, uid, want);
      changes.push({ uid, title: next.title, kind: 'new', lines: [`${rub(next.price)}${want.length ? ' · ' + want.join(', ') : ''}`] });
    } else if (lines.length) {
      nextRaw = nextRaw.map((x) => (x.uid === uid ? next : x));
      if (cat !== undefined) nextSecs = placeIn(nextSecs, uid, want);
      changes.push({ uid, title: next.title, kind: 'upd', lines });
    }
  });
  if (opts.hide)
    nextRaw = nextRaw.map((p) => {
      if (seen.has(p.uid) || p.hidden) return p;
      changes.push({ uid: p.uid, title: p.title, kind: 'hide', lines: ['нет в файле – скрыть с сайта'] });
      return { ...p, hidden: true };
    });
  return { raw: nextRaw, secs: nextSecs, changes, warns };
}

export default function CsvImport({ raw, secs, siteBase, imgBase, placeIn, onApply, onClose }: {
  raw: P[]; secs: S[]; siteBase: string; imgBase: string;
  placeIn: (s: S[], uid: string, want: string[]) => S[];
  onApply: (raw: P[], secs: S[], message: string) => void; onClose: () => void;
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [opts, setOpts] = useState<Opts>({ update: true, add: true, hide: false });
  const p = file ? plan(file.text, raw, secs, opts, placeIn) : null;
  const n = (k: Change['kind']) => p?.changes.filter((c) => c.kind === k).length ?? 0;
  const template = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvFile([CSV_COLUMNS.map((c) => q(c[0] === 'Url' || c[0] === 'Tilda UID' || c[0] === 'Photo' ? '' : c[2])).join(';')]));

  const pick = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) setFile({ name: f.name, text: await f.text() });
  };
  const opt = (k: keyof Opts, label: string, hint?: string) => (
    <label class="ck ck--block">
      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: (e.target as HTMLInputElement).checked })} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
  const apply = () => {
    if (!p || !p.changes.length) return;
    const parts = [n('upd') && `изменено ${n('upd')}`, n('new') && `новых ${n('new')}`, n('hide') && `скрыто ${n('hide')}`].filter(Boolean).join(', ');
    onApply(p.raw, p.secs, `импорт CSV «${file!.name}» – ${parts}`);
    onClose();
  };

  return (
    <div class="ed" role="dialog" aria-modal="true" aria-label="Импорт товаров из CSV">
      <div class="ed__bg" onClick={onClose} />
      <div class="ed__panel ed__panel--narrow">
        <header class="ed__head">
          <div><p class="muted" style="margin:0;font-size:12px">Магазин → импорт</p><h2>Загрузка товаров из CSV</h2></div>
          <button class="btn" onClick={onClose}>Закрыть</button>
        </header>
        <div class="ed__body">
          <ol class="steps">
            <li>
              <b>Файл</b>
              <label class={`drop${file ? ' drop--ok' : ''}`}>
                <input type="file" accept=".csv,text/csv" hidden onChange={pick} />
                {file ? <><b>{file.name}</b><span>Найдено строк с товарами: {Math.max(0, parseCsv(file.text).length - 1)}</span></> : <><b>Выберите CSV-файл</b><span>или перетащите его сюда · кодировка UTF-8, разделитель «;»</span></>}
              </label>
              <p class="muted" style="margin:8px 0 0;font-size:12.5px">
                <a href={template} download="products-template.csv">Скачать шаблон</a> · <a href="#" onClick={(e) => { e.preventDefault(); downloadCsv(raw, secs, imgBase, siteBase); }}>Выгрузить текущие товары</a> ({raw.length} шт.) – их можно поправить в Excel и загрузить обратно.
              </p>
            </li>
            <li>
              <b>Как загружать</b>
              {opt('update', 'Обновлять товары с тем же номером', 'Меняются только колонки, которые есть в файле; фото не трогаются')}
              {opt('add', 'Добавлять новые товары', 'Строки без номера или с незнакомым номером; фото добавляются потом в карточке')}
              {opt('hide', 'Скрыть товары, которых нет в файле', 'Удобно, когда файл – полный актуальный каталог')}
            </li>
            {p && (
              <li>
                <b>Что изменится</b>
                {p.changes.length === 0 ? <p class="muted" style="margin:0">Изменений нет – файл совпадает с товарами в админке.</p> : (
                  <p style="margin:0">Изменится товаров: {n('upd')} · новых: {n('new')} · скрыть: {n('hide')}</p>
                )}
                {p.warns.map((w) => <p class="demo-note" style="margin:4px 0">{w}</p>)}
                {p.changes.length > 0 && (
                  <table class="vt">
                    <thead><tr><th>Товар</th><th>Изменения</th></tr></thead>
                    <tbody>{p.changes.slice(0, 200).map((c) => (
                      <tr><td><b>{c.title}</b><br /><span class="muted">{c.kind === 'new' ? 'новый' : `№ ${c.uid}`}</span></td><td>{c.lines.map((l) => <div>{l}</div>)}</td></tr>
                    ))}</tbody>
                  </table>
                )}
              </li>
            )}
            <li>
              <b>Колонки файла</b>
              <table class="vt vt--cols">
                <thead><tr><th>Колонка</th><th>Что в ней</th><th>Пример</th></tr></thead>
                <tbody>{CSV_COLUMNS.map(([c, d, ex]) => <tr><td><code>{c}</code></td><td>{d}</td><td class="muted">{ex}</td></tr>)}</tbody>
              </table>
            </li>
          </ol>
        </div>
        <footer class="ed__foot">
          <span class="muted" style="font-size:12.5px">{!file ? 'Файл не выбран' : p!.changes.length ? `Будет изменено: ${p!.changes.length}` : 'Изменений нет'}</span>
          <button class="btn primary" disabled={!p || !p.changes.length} onClick={apply}>Загрузить товары</button>
        </footer>
      </div>
    </div>
  );
}
