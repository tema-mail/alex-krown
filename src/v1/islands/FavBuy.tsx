import { useEffect, useState } from 'preact/hooks';
import { v1url } from '../loyalty';
import { addToCart, type FavItem } from '../store';

/* «В корзину» из избранного (владелец 17.11.2026): в избранном хранится вещь без размера, размеры и цены –
   из /v1/fav-sizes.json (pages/v1/fav-sizes.json.ts). Один размер или без размеров – кладём сразу;
   товара нет в файле (скрыт, снят) – ссылка на карточку, как было. */
type Sizes = Record<string, { size: string; price: number }[]>;
let sizesReq: Promise<Sizes> | null = null;
const loadSizes = () =>
  (sizesReq ??= fetch(`${v1url('')}fav-sizes.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Sizes>) : {}))
    .catch(() => ({})));

export default function FavBuy({ item, compact = false }: { item: FavItem; compact?: boolean }) {
  const [sizes, setSizes] = useState<Sizes[string] | null | false>(null);
  const [size, setSize] = useState('');
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    loadSizes().then((all) => {
      if (!alive) return;
      const s = all[item.uid];
      setSizes(s === undefined ? false : s);
      if (s?.length === 1) setSize(s[0].size);
    });
    return () => {
      alive = false;
    };
  }, [item.uid]);
  if (sizes === null) return null;
  if (sizes === false) return <a href={item.path} class="dr__link">Выбрать размер</a>;
  const price = sizes.find((s) => s.size === size)?.price ?? item.price;
  const add = () => {
    if (sizes.length > 0 && !size) return setErr(true);
    addToCart({ uid: item.uid, size, title: item.title, price, img: item.img, path: item.path });
    setErr(false);
  };
  return (
    <div class={`fb${compact ? ' fb--c' : ''}`}>
      {sizes.length > 1 && (
        <div class="fb__sizes" role="radiogroup" aria-label="Размер">
          {sizes.map((s) => (
            <button type="button" role="radio" aria-checked={size === s.size} class={`fb__chip${size === s.size ? ' is-on' : ''}`} key={s.size}
              onClick={() => (setSize(s.size), setErr(false))}>{s.size}</button>
          ))}
        </div>
      )}
      {err && <p class="fb__err" role="alert">Выберите размер</p>}
      <button type="button" class="btn btn--solid fb__btn" onClick={add}>В корзину</button>
    </div>
  );
}
