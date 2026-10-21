import { useEffect, useState } from 'preact/hooks';
import { addToCart, cart, favs, sheet, toggleFav } from '../store';
import { snap, v1url } from '../loyalty';
import { Points } from './Sheets';

/* Блок покупки на карточке товара: выбор размера (цена у размера своя), «В корзину», «Купить сразу»,
   избранное, баллы за вещь (docs/ПЛАН-ЛК.md, решение 3; гостю – «Войдите, чтобы копить»). Товары без размеров (парфюм, аксессуары) кладутся в корзину без размера. */
interface P { uid: string; title: string; price: number; priceOld: number | null; img: string; path: string; sizes: { size: string; price: number; priceOld: number | null }[]; orderHref: string }

export default function ProductBuy({ p }: { p: P }) {
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<string>(p.sizes.length === 1 ? p.sizes[0].size : '');
  useEffect(() => {
    setReady(true);
    /* ссылка из рекламного фида ведёт на конкретный размер: ?size=XL – выбираем его и показываем его цену */
    const q = new URLSearchParams(location.search).get('size');
    if (q && p.sizes.some((s) => s.size === q)) setSize(q);
  }, []);
  const [err, setErr] = useState(false);
  const needSize = p.sizes.length > 0;
  const cur = p.sizes.find((s) => s.size === size);
  const price = cur?.price ?? p.price;
  const fav = ready && favs.value.some((f) => f.uid === p.uid);
  const inCart = ready ? cart.value.filter((x) => x.uid === p.uid) : [];

  const add = () => {
    if (needSize && !size) {
      setErr(true);
      return false;
    }
    addToCart({ uid: p.uid, size, title: p.title, price, img: p.img, path: p.path });
    return true;
  };

  return (
    <div class="pb">
      {needSize && (
        <div>
          <p class="pp__label" id={`sz-${p.uid}`}>Размер</p>
          <div class="chips" role="radiogroup" aria-labelledby={`sz-${p.uid}`}>
            {p.sizes.map((s) => (
              <button
                type="button" role="radio" aria-checked={size === s.size} class={`chip${size === s.size ? ' is-on' : ''}`}
                onClick={() => (setSize(s.size), setErr(false))}
              >
                {s.size}
              </button>
            ))}
          </div>
        </div>
      )}
      {cur && <p class="pp__price" style={{ marginTop: '14px' }} aria-live="polite">Размер {cur.size}: {price.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₽</p>}
      <p class="pb__pts">
        <Points price={price} size={15} />
        {ready && snap.value.email !== null ? (
          <span>за эту вещь – на следующий заказ</span>
        ) : (
          <span><a href={v1url('lk')}>Войдите</a>, чтобы копить баллы</span>
        )}
      </p>
      <p class={`pp__hint${err ? ' pp__hint--err' : ''}`} aria-live="polite">
        {err ? 'Выберите размер' : inCart.length ? `В корзине: ${inCart.map((i) => `${i.size || 'шт.'} × ${i.qty}`).join(', ')}` : ''}
      </p>
      <div class="pp__buy">
        <button type="button" class="btn btn--solid" onClick={add}>В корзину</button>
        <button
          type="button" class="pp__fav" aria-pressed={fav} aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
          onClick={() => toggleFav({ uid: p.uid, title: p.title, price: p.price, priceOld: p.priceOld, img: p.img, path: p.path })}
        >
          {fav ? '♥' : '♡'}
        </button>
      </div>
      <a
        class="btn" href={p.orderHref} style={{ marginTop: '8px', width: '100%' }}
        onClick={(e) => {
          /* выбранный размер ещё не в корзине – кладём; без выбора размера уходим, только если в корзине уже есть этот товар */
          const id = `${p.uid}:${size}`;
          if ((size || !needSize) && cart.value.some((x) => x.id === id)) return;
          if (size || !needSize || !inCart.length) if (!add()) e.preventDefault();
        }}
      >
        Купить сразу
      </a>
      {inCart.length > 0 && (
        <button type="button" class="dr__more" style={{ marginTop: '10px' }} onClick={() => (sheet.value = 'cart')}>Открыть корзину</button>
      )}
    </div>
  );
}
