import { useEffect, useState } from 'preact/hooks';
import { VIDEO, VIDEO_RULE, prepareVideo, firstFrame, preparePoster, uploadsOf, type Video, type Upload } from './media';

/* Редактор товара магазина «Вариант 1» – вкладки как у эталона Elite Rose (src/islands/admin/ProductEditor.tsx):
   «Основное», «Фото», «Разделы», «Варианты», «Размеры и вес», «SEO». Варианты – размеры одежды со своей ценой.
   Товар может стоять в нескольких разделах – на сайте он покажется в каждом. Новые фото сжимаются в WebP. */

export interface Photo { name: string; w: number; h: number }
export interface Size { size: string; price: number; priceOld: number | null }
export interface AdmProduct {
  uid: string; path: string; title: string; price: number; priceOld: number | null; sizes: Size[];
  kind: string; color: string; descr: string; composition: string; photos: Photo[];
  hidden: boolean; seoTitle: string; seoDescr: string; sections: string[];
  /** наличие: остатки не ведём (владелец 28.10.2026) – только «в наличии» или «под заказ» */
  preorder: boolean; weight: string; dims: string;
  /** видео товара (как в TEYES): на сайте – после обложки, само и без звука */
  videos: Video[];
}
export interface SectionOpt { path: string; label: string; depth: number }
/** видео в ленте редактора: уже на сайте (src – адрес) или новое (base64 – загрузится при сохранении) */
type VMedia = { file: string; src: string; base64?: string; sound: boolean; poster?: { name: string; src: string; base64?: string } };

const TABS = ['Основное', 'Фото', 'Разделы', 'Варианты', 'Размеры и вес', 'SEO'] as const;
const digits = (v: string) => v.replace(/\D/g, '');

export default function ProductEditor({ product, sections, imgBase, siteBase, onClose, onSave, onDelete }: {
  product: AdmProduct; sections: SectionOpt[]; imgBase: string; siteBase: string;
  onClose: () => void; onSave: (p: AdmProduct, files: File[], extra: Upload[]) => void; onDelete: (p: AdmProduct) => void;
}) {
  const [p, setP] = useState<AdmProduct>(product);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const vidBase = imgBase.replace(/img\/?$/, 'video/p');
  const [vids, setVids] = useState<VMedia[]>(product.videos.map((v) => ({ file: v.file, src: `${vidBase}/${v.file}`, sound: v.sound,
    poster: v.poster ? { name: v.poster, src: `${imgBase}/${v.poster}.webp` } : undefined })));
  const [vnote, setVnote] = useState('');
  const [verrs, setVerrs] = useState<string[]>([]);
  const addVideos = async (list: File[]) => {
    if (vnote) return;
    const errs: string[] = [], out: VMedia[] = [];
    setVnote('Проверяю видео…');
    for (const f of list) {
      if (vids.length + out.length >= VIDEO.maxCount) { errs.push(`«${f.name}»: у товара уже ${VIDEO.maxCount} видео – больше нельзя`); continue; }
      try {
        const r = await prepareVideo(f);
        if ([...vids, ...out].some((m) => m.file === r.name)) { errs.push(`«${f.name}»: такое видео уже есть у товара`); continue; }
        let poster: VMedia['poster'];
        try { const fr = await firstFrame(r.url, `v-${r.name.split('.')[0]}`); poster = { name: fr.name, src: fr.url, base64: fr.base64 }; } catch { /* без превью – браузер покажет кадр сам */ }
        out.push({ file: r.name, src: r.url, base64: r.base64, sound: false, poster });
      } catch (e: any) { errs.push(e.message); }
    }
    setVids([...vids, ...out]); setVerrs(errs); setVnote('');
  };
  const moveVid = (i: number, j: number) => { if (j < 0 || j >= vids.length) return; const a = [...vids]; [a[i], a[j]] = [a[j], a[i]]; setVids(a); };
  const doSave = () => onSave({ ...p, videos: vids.map((m) => ({ file: m.file, poster: m.poster?.name || '', sound: !!m.sound })) }, files.map((f) => f.file), uploadsOf(vids));
  const [tab, setTab] = useState<(typeof TABS)[number]>('Основное');
  const isNew = !product.uid;
  useEffect(() => setP(product), [product]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  const set = (k: keyof AdmProduct) => (e: Event) => setP({ ...p, [k]: (e.target as HTMLInputElement).value });
  const setSize = (i: number, k: keyof Size, v: string) =>
    setP({ ...p, sizes: p.sizes.map((s, n) => (n !== i ? s : { ...s, [k]: k === 'size' ? v : k === 'priceOld' ? (digits(v) ? +digits(v) : null) : +digits(v) || 0 })) });
  const move = (i: number, d: number) => {
    const a = [...p.photos];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setP({ ...p, photos: a });
  };

  return (
    <div class="ed" role="dialog" aria-modal="true" aria-label={isNew ? 'Новый товар' : `Товар «${p.title}»`}>
      <div class="ed__bg" onClick={onClose} />
      <div class="ed__panel">
        <header class="ed__head">
          <div>
            <p class="muted" style="margin:0;font-size:12px">{isNew ? 'Магазин → новый товар' : `Магазин → товар № ${p.uid}`}</p>
            <h2>{p.title || 'Новый товар'}</h2>
          </div>
          <label class="sw" title="Показывать на сайте">
            <input type="checkbox" checked={!p.hidden} onChange={(e) => setP({ ...p, hidden: !(e.target as HTMLInputElement).checked })} />
            <span />{p.hidden ? 'Скрыт' : 'Опубликован'}
          </label>
          <button class="btn" onClick={onClose}>Закрыть</button>
          <button class="btn primary" onClick={doSave}>Сохранить</button>
        </header>
        <nav class="ed__tabs">{TABS.map((t) => <button class={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>

        <div class="ed__body">
          {tab === 'Основное' && (
            <div class="fgrid">
              <label class="f f--wide"><span>Название товара</span><input value={p.title} onInput={set('title')} placeholder="Например, Худи “Cardiogram Black”" /></label>
              <label class="f"><span>Цена, ₽ <em>если у размера своя – во вкладке «Варианты»</em></span><input inputMode="numeric" value={p.price || ''} onInput={(e) => setP({ ...p, price: +digits((e.target as HTMLInputElement).value) || 0 })} /></label>
              <label class="f"><span>Старая цена, ₽</span><input inputMode="numeric" value={p.priceOld ?? ''} onInput={(e) => { const v = digits((e.target as HTMLInputElement).value); setP({ ...p, priceOld: v ? +v : null }); }} placeholder="Для скидки" /></label>
              <label class="f"><span>Вид товара</span><input value={p.kind} onInput={set('kind')} placeholder="Худи, Джоггеры, Куртка…" /></label>
              <label class="f"><span>Цвет</span><input value={p.color} onInput={set('color')} placeholder="Чёрный" /></label>
              <label class="f"><span>Номер товара</span><input value={p.uid || 'присвоится при сохранении'} readOnly /></label>
              <label class="f"><span>Наличие</span><select value={p.preorder ? 'preorder' : 'stock'} onChange={(e) => setP({ ...p, preorder: (e.target as HTMLSelectElement).value === 'preorder' })}><option value="stock">В наличии</option><option value="preorder">Под заказ</option></select></label>
              <label class="f f--wide"><span>Описание <em>на странице товара и в фидах; мат в фиды не попадёт</em></span><textarea rows={7} value={p.descr} onInput={set('descr')} /></label>
              <label class="f f--wide"><span>Состав</span><input value={p.composition} onInput={set('composition')} placeholder="90% хлопок, 10% полиэстер" /></label>
            </div>
          )}

          {tab === 'Варианты' && (
            <div>
              <p class="muted" style="margin:0 0 12px">Варианты одного товара со своей ценой – у одежды это размеры. Покупатель выбирает размер на странице товара; каждый размер – отдельное предложение в корзине и в рекламных фидах. Пустая цена – как у товара.</p>
              <table class="vt">
                <thead><tr><th>Размер</th><th>Цена, ₽</th><th>Старая цена, ₽</th><th></th></tr></thead>
                <tbody>
                  {p.sizes.map((s, i) => (
                    <tr>
                      <td><input value={s.size} onInput={(e) => setSize(i, 'size', (e.target as HTMLInputElement).value)} /></td>
                      <td><input inputMode="numeric" value={s.price || ''} onInput={(e) => setSize(i, 'price', (e.target as HTMLInputElement).value)} placeholder={String(p.price)} /></td>
                      <td><input inputMode="numeric" value={s.priceOld ?? ''} onInput={(e) => setSize(i, 'priceOld', (e.target as HTMLInputElement).value)} /></td>
                      <td><button class="btn ghost" onClick={() => setP({ ...p, sizes: p.sizes.filter((_, n) => n !== i) })}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button class="btn" style="margin-top:10px" onClick={() => setP({ ...p, sizes: [...p.sizes, { size: '', price: p.price, priceOld: null }] })}>+ Добавить размер</button>
            </div>
          )}

          {tab === 'Фото' && (
            <div>
              <p class="muted" style="margin:0 0 12px">Первое фото – обложка в каталоге и в рекламе. Новые фото сжимаются в WebP (960 и 480 px) при сохранении.</p>
              <div class="gal">
                {p.photos.map((ph, i) => (
                  <figure class="gal__item">
                    <img src={`${imgBase}/${ph.name}-s.webp`} alt="" onError={(e) => ((e.target as HTMLImageElement).src = `${imgBase}/${ph.name}.webp`)} />
                    {i === 0 && <span class="gal__cover">Обложка</span>}
                    <button class="gal__del" title="Убрать фото" onClick={() => setP({ ...p, photos: p.photos.filter((_, n) => n !== i) })}>×</button>
                    <span style="position:absolute;left:6px;bottom:6px;display:flex;gap:4px">
                      <button class="btn" style="height:26px;padding:0 8px" title="Левее" onClick={() => move(i, -1)}>←</button>
                      <button class="btn" style="height:26px;padding:0 8px" title="Правее" onClick={() => move(i, 1)}>→</button>
                    </span>
                  </figure>
                ))}
                {files.map((f, i) => (
                  <figure class="gal__item gal__item--new">
                    <img src={f.url} alt="" />
                    <span class="gal__badge">загрузится при сохранении</span>
                    <button class="gal__del" title="Убрать фото" onClick={() => setFiles(files.filter((_, n) => n !== i))}>×</button>
                  </figure>
                ))}
                <label class="gal__add">
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { const fl = [...((e.target as HTMLInputElement).files || [])]; setFiles([...files, ...fl.map((file) => ({ file, url: URL.createObjectURL(file) }))]); (e.target as HTMLInputElement).value = ''; }} />
                  <b>+</b><span>Загрузить фото</span><small>JPG, PNG или WebP</small>
                </label>
              </div>

              <h3 style="margin:22px 0 10px;font-size:15px">Видео</h3>
              <div class="gal">
                {vids.map((m, i) => (
                  <figure class={`gal__item gal__item--video${m.base64 ? ' gal__item--new' : ''}`}>
                    <video src={m.src} poster={m.poster?.src} muted autoplay loop playsInline preload="metadata" />
                    {m.base64 && <span class="gal__badge">загрузится при сохранении</span>}
                    <button class="gal__del" title="Убрать видео" onClick={() => setVids(vids.filter((_, n) => n !== i))}>×</button>
                    <span style="position:absolute;left:6px;top:6px;display:flex;gap:4px">
                      <button class="btn" style="height:26px;padding:0 8px" title="Левее" disabled={i === 0} onClick={() => moveVid(i, i - 1)}>←</button>
                      <button class="btn" style="height:26px;padding:0 8px" title="Правее" disabled={i === vids.length - 1} onClick={() => moveVid(i, i + 1)}>→</button>
                    </span>
                    <div class="gal__vopts">
                      <label><input type="checkbox" checked={!!m.sound} onChange={(e) => setVids(vids.map((x, n) => (n === i ? { ...x, sound: (e.target as HTMLInputElement).checked } : x)))} /> Со звуком</label>
                      <label class="gal__poster"><span>{m.poster ? 'Превью: заменить' : 'Загрузить превью'}</span>
                        <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
                          const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (!f) return;
                          try { const r = await preparePoster(f, `v-${m.file.split('.')[0]}-${Date.now().toString(36)}`); setVids(vids.map((x, n) => (n === i ? { ...x, poster: { name: r.name, src: r.url, base64: r.base64 } } : x))); setVerrs([]); }
                          catch (er: any) { setVerrs([er.message]); }
                        }} /></label>
                    </div>
                  </figure>
                ))}
                <label class={`gal__add${vnote ? ' is-busy' : ''}`}>
                  <input type="file" disabled={!!vnote} accept="video/mp4,video/webm,.mov" multiple hidden onChange={(e) => { const fl = [...((e.target as HTMLInputElement).files || [])]; (e.target as HTMLInputElement).value = ''; addVideos(fl); }} />
                  <b>+</b><span>Загрузить видео</span><small>MP4 или WebM</small>
                </label>
              </div>
              <p class="muted" style="margin:8px 0 0;font-size:12px">{VIDEO_RULE}</p>
              {vnote && <p class="muted" style="margin:10px 0 0">{vnote}</p>}
              {verrs.length > 0 && <div class="gal__err" role="alert"><b>Не загружено:</b><ul>{verrs.map((x) => <li>{x}</li>)}</ul></div>}
            </div>
          )}

          {tab === 'Разделы' && (
            <div>
              <p class="muted" style="margin:0 0 12px">Товар может быть в нескольких разделах – на сайте он покажется в каждом. Новый товар встаёт в конец раздела.</p>
              {/* верхний раздел – строкой, его подразделы – сеткой под ним */}
              {sections.filter((s) => s.depth === 0).map((top) => {
                const box = (s: SectionOpt) => (
                  <label class="ck">
                    <input type="checkbox" checked={p.sections.includes(s.path)} onChange={(e) => setP({ ...p, sections: (e.target as HTMLInputElement).checked ? [...p.sections, s.path] : p.sections.filter((x) => x !== s.path) })} />
                    {s.label}
                  </label>
                );
                const kids = sections.filter((s) => s.depth === 1 && s.path.startsWith(top.path + '/'));
                return (
                  <div style="margin-bottom:12px">
                    <div style="font-weight:600">{box(top)}</div>
                    {kids.length > 0 && <div class="checks" style="margin:6px 0 0 22px">{kids.map(box)}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'Размеры и вес' && (
            <div class="fgrid">
              <p class="muted f--wide" style="margin:0">Нужны для расчёта доставки службами (СДЭК). Можно не заполнять.</p>
              <label class="f"><span>Вес, кг</span><input value={p.weight} onInput={set('weight')} placeholder="0,8" /></label>
              <label class="f"><span>Габариты Д×Ш×В, см</span><input value={p.dims} onInput={set('dims')} placeholder="40×30×10" /></label>
            </div>
          )}

          {tab === 'SEO' && (
            <div class="fgrid">
              <label class="f f--wide"><span>Адрес страницы <em>как на alex-krown.com, не меняется после создания</em></span><input value={p.path ? `/v1/${p.path}/` : 'создастся из названия'} readOnly /></label>
              <label class="f f--wide"><span>Title <em>{p.seoTitle.length}/70 · пусто – соберётся сам из названия и цены</em></span><input value={p.seoTitle} onInput={set('seoTitle')} /></label>
              <label class="f f--wide"><span>Description <em>{p.seoDescr.length}/160 · пусто – из описания, размеров и цены</em></span><textarea rows={3} value={p.seoDescr} onInput={set('seoDescr')} /></label>
              <div class="snip f--wide">
                <span class="snip__url">alex-krown.com › {p.path.split('/').slice(0, 2).join(' › ')}</span>
                <span class="snip__t">{p.seoTitle || `${p.title} – купить | ALEX KROWN`}</span>
                <span class="snip__d">{p.seoDescr || p.descr.slice(0, 160) || 'Описание для поиска появится здесь.'}</span>
              </div>
            </div>
          )}
        </div>
        {!isNew && (
          <footer class="ed__foot">
            <button class="btn ghost" style="color:#b0333f" onClick={() => onDelete(p)}>Удалить товар</button>
            <a class="btn" href={`${siteBase}/${p.path}/`} target="_blank" rel="noopener">Открыть на сайте ↗</a>
          </footer>
        )}
      </div>
    </div>
  );
}
