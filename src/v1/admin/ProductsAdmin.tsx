import { useEffect, useMemo, useState } from 'preact/hooks';
import ProductEditor, { type AdmProduct, type SectionOpt } from './ProductEditor';
import GhConnect from './GhConnect';
import CsvImport, { downloadCsv } from './CsvImport';
import { IMG_DIR, PRODUCTS_PATH, SECTIONS_PATH, buildOf, commit, getToken, humanError, readJson, slugify, toWebp, type FileChange } from './gh';

/* «Каталоги и товары» магазина «Вариант 1» (по образцу Тильды и админки Elite Rose). Каталоги – из
   src/data/v1/sections.json (товар = uid в списке раздела, может стоять в нескольких), товары –
   src/data/v1/products.json. С ключом GitHub изменения сохраняются одним коммитом, сайт пересобирается
   за 1–2 минуты; без ключа – только просмотр. */

type Raw = Record<string, any> & { uid: string; path: string; title: string; price: number; priceOld: number | null; sizes: any[]; photos: any[]; hidden?: boolean };
type Sec = { path: string; title: string; h1: string; name: string | null; uids: string[] } & Record<string, any>;
type Status = { kind: 'idle' | 'saving' | 'building' | 'done' | 'error'; text: string; url?: string; sha?: string };

const fmt = (n: number | null) => (n == null ? '–' : n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽');

export default function ProductsAdmin({ items, secs, labels, imgBase, siteBase }: {
  items: Raw[]; secs: Sec[]; labels: Record<string, string>; imgBase: string; siteBase: string;
}) {
  const [raw, setRaw] = useState<Raw[]>(items);
  const [sections, setSections] = useState<Sec[]>(secs);
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [cur, setCur] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('site');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<AdmProduct | null>(null);
  const [csv, setCsv] = useState(false);
  const [newSec, setNewSec] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });

  /* с ключом – свежие данные прямо из репозитория: собранный сайт отстаёт на время сборки */
  const reload = async () => {
    const [p, s] = await Promise.all([readJson<Raw[]>(PRODUCTS_PATH), readJson<Sec[]>(SECTIONS_PATH)]);
    setRaw(p);
    setSections(s);
  };
  useEffect(() => {
    if (getToken()) {
      setConnected(true);
      reload().catch(() => setStatus({ kind: 'error', text: 'Не удалось загрузить данные из GitHub – проверьте ключ' }));
    }
  }, []);

  /* следим за сборкой, которую запустил именно наш коммит */
  useEffect(() => {
    if (status.kind !== 'building' || !status.sha) return;
    const sha = status.sha;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const b = await buildOf(sha);
        if (b && b.status === 'completed') {
          setStatus(b.conclusion === 'success' ? { kind: 'done', text: 'Сайт обновлён – изменения уже на сайте', url: b.url } : { kind: 'error', text: 'Сборка сайта упала – откройте журнал', url: b.url });
          return;
        }
        if (b) setStatus((s) => ({ ...s, url: b.url }));
      } catch {}
      setTimeout(tick, 6000);
    };
    const t = setTimeout(tick, 8000);
    return () => ((stop = true), clearTimeout(t));
  }, [status.kind, status.sha]);

  /* дерево каталогов: верхние разделы в порядке меню, под ними подразделы */
  const tree: SectionOpt[] = useMemo(() => {
    const top = sections.filter((s) => s.path !== 'catalog' && !s.path.replace(/^catalog\//, '').includes('/'));
    const order = (p: string) => (labels[p] ? Object.keys(labels).indexOf(p) : 99);
    return top
      .sort((a, b) => order(a.path) - order(b.path))
      .flatMap((s) => [
        { path: s.path, label: labels[s.path] || s.name || s.h1, depth: 0 },
        ...sections.filter((x) => x.path.startsWith(s.path + '/')).map((x) => ({ path: x.path, label: (x.name || x.h1).replace(/^./, (c: string) => c.toUpperCase()), depth: 1 })),
      ]);
  }, [sections]);
  const label = (path: string) => tree.find((t) => t.path === path)?.label ?? path;
  const secOf = (uid: string) => sections.filter((s) => s.uids.includes(uid) && s.path !== 'catalog').map((s) => s.path);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const inCur = (p: Raw) => (cur === 'all' ? true : cur === 'hidden' ? p.hidden : sections.find((x) => x.path === cur)?.uids.includes(p.uid));
    let out = raw.filter((p) => inCur(p) && (!s || p.title.toLowerCase().includes(s) || p.uid.includes(s)));
    if (cur !== 'all' && cur !== 'hidden' && sort === 'site') {
      const order = sections.find((x) => x.path === cur)!.uids;
      out = [...out].sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid));
    }
    if (sort === 'price-asc') out = [...out].sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') out = [...out].sort((a, b) => b.price - a.price);
    if (sort === 'name') out = [...out].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return out;
  }, [raw, sections, cur, q, sort]);

  /** сохранить товары и каталоги (и новые фото) одним коммитом */
  const persist = async (nextRaw: Raw[], nextSecs: Sec[], message: string, extra: FileChange[] = []) => {
    setRaw(nextRaw);
    setSections(nextSecs);
    if (!connected) return setStatus({ kind: 'error', text: 'Изменение видно только у вас – подключите сохранение, чтобы оно попало на сайт' });
    setStatus({ kind: 'saving', text: 'Сохраняем…' });
    try {
      const files: FileChange[] = [
        { path: PRODUCTS_PATH, text: JSON.stringify(nextRaw) },
        { path: SECTIONS_PATH, text: JSON.stringify(nextSecs, null, 1) },
        ...extra,
      ];
      const sha = await commit(files, `Админка: ${message}`);
      setStatus({ kind: 'building', text: 'Сохранено. Сайт обновляется – обычно 1–2 минуты', sha });
    } catch (e: any) {
      setStatus({ kind: 'error', text: `Не сохранилось: ${humanError(e)}` });
    }
  };

  /** членство товара в каталогах: добавить в конец нужных, убрать из лишних */
  const placeIn = (secs0: Sec[], uid: string, want: string[]) =>
    secs0.map((s) => {
      if (s.path === 'catalog') return s.uids.includes(uid) ? s : { ...s, uids: [...s.uids, uid] };
      const has = s.uids.includes(uid);
      if (want.includes(s.path) && !has) return { ...s, uids: [...s.uids, uid] };
      if (!want.includes(s.path) && has) return { ...s, uids: s.uids.filter((x) => x !== uid) };
      return s;
    });

  const toAdm = (p: Raw): AdmProduct => ({
    uid: p.uid, path: p.path, title: p.title, price: p.price, priceOld: p.priceOld, sizes: p.sizes ?? [], kind: p.kind ?? '', color: p.color ?? '',
    descr: p.descr ?? '', composition: p.composition ?? '', photos: p.photos ?? [], hidden: !!p.hidden, seoTitle: p.seoTitle ?? '', seoDescr: p.seoDescr ?? '', sections: secOf(p.uid),
    stock: p.stock == null ? '' : String(p.stock), weight: p.weight ?? '', dims: p.dims ?? '',
  });

  const save = async (a: AdmProduct, files: File[]) => {
    if (!a.title.trim()) return setStatus({ kind: 'error', text: 'Укажите название товара' });
    if (!a.price && !a.sizes.some((s) => s.price)) return setStatus({ kind: 'error', text: 'Укажите цену' });
    const isNew = !a.uid;
    const uid = isNew ? String(Date.now()) : a.uid;
    const top = a.sections.find((s) => s.startsWith('catalog/man')) ? 'catalog/man' : a.sections.find((s) => s.startsWith('catalog/woman')) ? 'catalog/woman' : 'catalog';
    const path = a.path || `${top}/tproduct/${uid}-${slugify(a.title)}`;
    const photos = [...a.photos];
    const uploads: FileChange[] = [];
    let n = photos.reduce((m, ph) => Math.max(m, Number(ph.name.match(/-(\d+)$/)?.[1] ?? 0)), 0) + 1;
    setStatus({ kind: 'saving', text: files.length ? 'Сжимаем фото…' : 'Сохраняем…' });
    try {
      for (const f of files) {
        const big = await toWebp(f, 960);
        const small = await toWebp(f, 480);
        const name = `${uid}-${n++}`;
        uploads.push({ path: `${IMG_DIR}/${name}.webp`, base64: big.base64 }, { path: `${IMG_DIR}/${name}-s.webp`, base64: small.base64 });
        photos.push({ name, w: big.w, h: big.h });
      }
    } catch (e: any) {
      return setStatus({ kind: 'error', text: `Фото не сохранились: ${e.message}` });
    }
    const old = raw.find((x) => x.uid === uid);
    const sizes = a.sizes.filter((s) => s.size.trim()).map((s) => ({ ...s, size: s.size.trim(), price: s.price || a.price }));
    const next: Raw = {
      ...(old ?? { parts: [], sort: 0, sizeChart: null }),
      uid, path, title: a.title.trim(), price: a.price || sizes[0]?.price || 0, priceOld: a.priceOld, sizes, kind: a.kind.trim(), color: a.color.trim(),
      descr: a.descr.trim(), composition: a.composition.trim(), photos, hidden: a.hidden,
      ...(a.seoTitle.trim() ? { seoTitle: a.seoTitle.trim() } : { seoTitle: undefined }), ...(a.seoDescr.trim() ? { seoDescr: a.seoDescr.trim() } : { seoDescr: undefined }),
      stock: a.stock === '' ? undefined : Number(a.stock), weight: a.weight.trim() || undefined, dims: a.dims.trim() || undefined,
    };
    const nextRaw = isNew ? [next, ...raw] : raw.map((x) => (x.uid === uid ? next : x));
    setEdit(null);
    await persist(nextRaw, placeIn(sections, uid, a.sections), `${isNew ? 'новый товар' : 'товар'} «${next.title}»`, uploads);
  };

  const remove = async (a: AdmProduct) => {
    if (!confirm(`Удалить товар «${a.title}» насовсем? Убрать с сайта на время можно переключателем «На сайте».`)) return;
    setEdit(null);
    await persist(raw.filter((x) => x.uid !== a.uid), sections.map((s) => ({ ...s, uids: s.uids.filter((u) => u !== a.uid) })), `удалён товар «${a.title}»`);
  };
  const setHidden = (uids: string[], hidden: boolean) =>
    persist(raw.map((x) => (uids.includes(x.uid) ? { ...x, hidden } : x)), sections, `${hidden ? 'скрыто' : 'показано'} на сайте: ${uids.length} шт.`);
  const addTo = (uids: string[], path: string) =>
    persist(raw, sections.map((s) => (s.path === path ? { ...s, uids: [...s.uids, ...uids.filter((u) => !s.uids.includes(u))] } : s)), `в раздел «${label(path)}»: ${uids.length} шт.`);
  const removeFrom = (uids: string[], path: string) =>
    persist(raw, sections.map((s) => (s.path === path ? { ...s, uids: s.uids.filter((u) => !uids.includes(u)) } : s)), `из раздела «${label(path)}»: ${uids.length} шт.`);

  /* «+ Добавить раздел» как у эталона: выбранные товары сразу попадают в него. Раздел = запись в
     sections.json; открыт каталог – новый станет его подкаталогом, иначе – верхним. Страница раздела
     собирается из sections.json при следующей сборке. */
  const topOf = (path: string) => tree.find((t) => !t.depth && (path === t.path || path.startsWith(t.path + '/')))?.path;
  const createSection = async (name: string) => {
    const t = name.trim();
    if (!t) return;
    const parent = isSection ? topOf(cur) : undefined;
    let path = (parent ? parent + '/' : '') + slugify(t);
    while (sections.some((s) => s.path === path)) path += '-2';
    if (tree.some((x) => (parent ? topOf(x.path) === parent && x.depth : !x.depth) && x.label.toLowerCase() === t.toLowerCase())) return setStatus({ kind: 'error', text: `Раздел «${t}» уже есть` });
    const uids = [...sel];
    setNewSec(null);
    await persist(raw, [...sections, { path, storepart: '', title: '', description: '', h1: `${t} ALEX KROWN`, name: t, uids }], `новый раздел «${t}»${uids.length ? ` + ${uids.length} товаров` : ''}`);
    setSel(new Set());
    setCur(path);
  };

  const allOn = shown.length > 0 && shown.every((p) => sel.has(p.uid));
  const toggle = (uid: string) => {
    const s = new Set(sel);
    s.has(uid) ? s.delete(uid) : s.add(uid);
    setSel(s);
  };
  const blank = (): AdmProduct => ({ uid: '', path: '', title: '', price: 0, priceOld: null, sizes: ['S', 'M', 'L', 'XL'].map((size) => ({ size, price: 0, priceOld: null })), kind: '', color: '', descr: '', composition: '', photos: [], hidden: false, seoTitle: '', seoDescr: '', sections: cur !== 'all' && cur !== 'hidden' ? [cur] : [], stock: '', weight: '', dims: '' });
  const count = (path: string) => sections.find((s) => s.path === path)?.uids.length ?? 0;
  const isSection = cur !== 'all' && cur !== 'hidden';

  return (
    <div>
      <div class={`sync sync--${connected ? 'on' : 'off'}`}>
        <span class="sync__dot" />
        <span>{connected ? 'Сохранение подключено – изменения попадают на сайт' : 'Режим просмотра: изменения не сохраняются.'}</span>
        {status.kind !== 'idle' && <span class={`sync__st sync__st--${status.kind}`}>{status.text}{status.url && <> · <a href={status.url} target="_blank" rel="noopener">журнал сборки</a></>}</span>}
        <button class={connected ? 'btn ghost' : 'btn primary'} onClick={() => setShowConnect(true)}>{connected ? 'Ключ' : 'Подключить сохранение'}</button>
      </div>

      <div class="pa">
        <aside class="pa__side">
          <p class="pa__cap">Разделы</p>
          <button class={cur === 'all' ? 'on' : ''} onClick={() => setCur('all')}>Все товары<span>{raw.length}</span></button>
          {tree.map((t) => (
            <button class={cur === t.path ? 'on' : ''} style={t.depth ? 'padding-left:26px;font-size:12.5px' : ''} onClick={() => setCur(t.path)}>{t.label}<span>{count(t.path)}</span></button>
          ))}
          <button class={cur === 'hidden' ? 'on' : ''} onClick={() => setCur('hidden')}>Скрытые<span>{raw.filter((p) => p.hidden).length}</span></button>
          {newSec === null ? (
            <button class="pa__addpart" onClick={() => setNewSec('')}>+ Добавить раздел</button>
          ) : (
            <form class="pa__newpart" onSubmit={(e) => (e.preventDefault(), createSection(newSec))}>
              <input autoFocus placeholder="Название раздела" value={newSec} onInput={(e) => setNewSec((e.target as HTMLInputElement).value)} />
              <small class="muted">{isSection && topOf(cur) ? `Подраздел в «${label(topOf(cur)!)}»` : 'Верхний раздел – в меню сайта добавляется отдельно'}</small>
              {sel.size > 0 && <small class="muted">Выбранные товары ({sel.size}) попадут в него</small>}
              <div><button class="btn primary" type="submit">Создать</button><button class="btn ghost" type="button" onClick={() => setNewSec(null)}>Отмена</button></div>
            </form>
          )}
        </aside>

        <section class="pa__main">
          <div class="tools">
            <h1>{cur === 'all' ? 'Все товары' : cur === 'hidden' ? 'Скрытые товары' : label(cur)} <span class="muted" style="font-size:15px;font-weight:400">{shown.length}</span></h1>
            <input type="search" placeholder="Название или номер" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value)} aria-label="Сортировка">
              <option value="site">Как на сайте</option><option value="name">По названию</option>
              <option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option>
            </select>
            <button class="btn" onClick={() => setCsv(true)}>⇪ Импорт CSV</button>
            <button class="btn" onClick={() => downloadCsv(raw, sections, imgBase, siteBase)}>⇩ Экспорт CSV</button>
            <button class="btn primary" onClick={() => setEdit(blank())}>+ Добавить товар</button>
          </div>

          {sel.size > 0 && (
            <div class="pa__bulk">
              <b>Выбрано: {sel.size}</b>
              <button class="btn" onClick={() => (setHidden([...sel], true), setSel(new Set()))}>Скрыть с сайта</button>
              <button class="btn" onClick={() => (setHidden([...sel], false), setSel(new Set()))}>Показать на сайте</button>
              <select class="btn" value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) (addTo([...sel], v), setSel(new Set())); }}>
                <option value="">Добавить в раздел…</option>{tree.map((t) => <option value={t.path}>{t.depth ? '– ' : ''}{t.label}</option>)}
              </select>
              {isSection && <button class="btn" onClick={() => (removeFrom([...sel], cur), setSel(new Set()))}>Убрать из «{label(cur)}»</button>}
              <button class="btn ghost" onClick={() => setNewSec('')}>+ Новый раздел из выбранных</button>
              <button class="btn ghost" onClick={() => setSel(new Set())}>Снять выбор</button>
            </div>
          )}

          <div class="pt">
            <div class="pt__head">
              <label><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((p) => p.uid)))} aria-label="Выбрать все" /></label>
              <span></span><span>Товар</span><span>Разделы</span><span>Цена</span><span>Остаток</span><span>На сайте</span>
            </div>
            {shown.map((p) => (
              <div class={`pt__row${sel.has(p.uid) ? ' is-sel' : ''}${p.hidden ? ' is-off' : ''}`} onClick={() => setEdit(toAdm(p))}>
                <label onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.uid)} onChange={() => toggle(p.uid)} aria-label={`Выбрать ${p.title}`} /></label>
                {p.photos[0] ? <img class="thumb" src={`${imgBase}/${p.photos[0].name}-s.webp`} alt="" loading="lazy" /> : <span class="thumb" />}
                <div><span class="pname">{p.title}</span><span class="muted pt__sku">№ {p.uid}{(p.priceOld ?? 0) > p.price && <i class="pt__mark">-{Math.round((1 - p.price / p.priceOld!) * 100)}%</i>}{p.hidden && <i class="pt__off">скрыт</i>}</span></div>
                <div>{secOf(p.uid).slice(0, 3).map((s) => <span class="chip">{label(s)}</span>)}{secOf(p.uid).length > 3 && <span class="chip">+{secOf(p.uid).length - 3}</span>}</div>
                <div class="pt__price"><b>{fmt(p.price)}</b>{p.priceOld && <s>{fmt(p.priceOld)}</s>}{p.sizes?.length > 0 && <small class="muted" style="display:block;font-size:11.5px">{p.sizes.map((s: any) => s.size).join(' ')}</small>}</div>
                <span class="muted">{p.stock ?? '∞'}</span>
                <label class="sw" onClick={(e) => e.stopPropagation()} title={p.hidden ? 'Показать на сайте' : 'Скрыть с сайта'}>
                  <input type="checkbox" checked={!p.hidden} onChange={() => setHidden([p.uid], !p.hidden)} /><span />
                </label>
              </div>
            ))}
            {shown.length === 0 && <p class="muted" style="padding:28px;text-align:center">Ничего не найдено</p>}
          </div>
        </section>
      </div>

      {edit && <ProductEditor product={edit} sections={tree} imgBase={imgBase} siteBase={siteBase} onClose={() => setEdit(null)} onSave={save} onDelete={remove} />}
      {csv && <CsvImport raw={raw} secs={sections} siteBase={siteBase} imgBase={imgBase} placeIn={(s, u, w) => placeIn(s as Sec[], u, w)} onApply={(r, s, m) => persist(r as Raw[], s as Sec[], m)} onClose={() => setCsv(false)} />}
      {showConnect && <GhConnect onClose={() => setShowConnect(false)} onConnected={(ok) => { setConnected(ok); setShowConnect(false); if (ok) reload(); }} />}
    </div>
  );
}
