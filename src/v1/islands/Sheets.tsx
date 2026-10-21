import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cart, cartCount, cartTotal, favs, fmt, MAX_QTY, removeFromCart, setQty, sheet, toast, toggleFav } from '../store';
import { BASE_RATE, earnFor, pointsWord, snap, v1url } from '../loyalty';

/* Шторки магазина «Вариант 1»: корзина, избранное и всплывашка «добавлено». Открываются кнопками
   шапки (data-open-sheet, v1/client.ts) и из блока покупки на карточке. Справа на компьютере,
   снизу на телефоне; Esc и клик по фону закрывают. */

function Drawer({ open, label, title, children, footer }: { open: boolean; label: string; title: ComponentChildren; children: ComponentChildren; footer?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = () => (sheet.value = null);
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close();
      /* фокус не уходит со шторки на страницу */
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      if (!f.length) return;
      const [first, last] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    addEventListener('keydown', onKey);
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('button, a')?.focus(), 60);
    return () => {
      root.style.overflow = prev;
      removeEventListener('keydown', onKey);
      clearTimeout(t);
      back?.focus?.();
    };
  }, [open]);
  return (
    <div class={`dr${open ? ' is-open' : ''}`} aria-hidden={!open} inert={!open}>
      <div class="dr__bg" onClick={close} />
      <div class="dr__panel" ref={ref} role="dialog" aria-modal="true" aria-label={label}>
        <div class="dr__head">
          <p class="dr__title">{title}</p>
          <button type="button" class="dr__close" onClick={close}>Закрыть</button>
        </div>
        <div class="dr__body">{children}</div>
        {footer && <div class="dr__foot">{footer}</div>}
      </div>
    </div>
  );
}

/** «+N баллов» с короной – сколько начислим за покупку (docs/ПЛАН-ЛК.md, решение 3; Points.tsx Milovini). Процент – по
    статусу вошедшего, гостю – первого уровня; до гидратации – как у гостя: снимка из браузера в HTML сборки нет. */
export function Points({ price, qty = 1, size = 13 }: { price: number; qty?: number; size?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const n = earnFor(price * qty, ready ? snap.value.rate : BASE_RATE);
  if (n <= 0) return null;
  return (
    <span class="pts" title="Баллы за покупку: 1 балл = 1 ₽ на следующий заказ">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.5 7.5 7.5 12 12 4l4.5 8 5-4.5L19.5 18h-15z" /><rect x="4.5" y="19.3" width="15" height="1.9" rx=".4" /></svg>
      +{n.toLocaleString('ru-RU')} {pointsWord(n)}
    </span>
  );
}

function Empty({ title, text, href }: { title: string; text: string; href: string }) {
  return (
    <div class="dr__empty">
      <p class="dr__empty-title">{title}</p>
      <p>{text}</p>
      <a class="btn btn--solid" href={href}>В каталог</a>
    </div>
  );
}

export default function Sheets({ catalogHref, orderHref, favHref }: { catalogHref: string; orderHref: string; favHref: string }) {
  /* до гидратации корзина из localStorage неизвестна – рисуем пустое, чтобы не разойтись с HTML сборки */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const items = ready ? cart.value : [];
  const fav = ready ? favs.value : [];
  const t = toast.value;
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => (toast.value = null), 3200);
    return () => clearTimeout(h);
  }, [t?.key]);

  return (
    <>
      <Drawer
        open={sheet.value === 'cart'}
        label="Корзина"
        title={<>Корзина {items.length > 0 && <small>{cartCount.value}</small>}</>}
        footer={
          items.length > 0 && (
            <>
              <p class="dr__total"><span>Итого</span><b>{fmt(cartTotal.value)}</b></p>
              <p class="dr__pts">
                {snap.value.email === null ? <><a href={v1url('lk')}>Войдите</a> – начислим</> : <span>Начислим</span>} <Points price={cartTotal.value} />
              </p>
              <p class="dr__note">Доставка СДЭК из Новосибирска – по тарифам службы, менеджер посчитает её после заказа.</p>
              <a class="btn btn--solid dr__cta" href={orderHref}>Оформить заказ</a>
              <button type="button" class="dr__more" onClick={() => (sheet.value = null)}>Продолжить покупки</button>
            </>
          )
        }
      >
        {items.length === 0 ? (
          <Empty title="В корзине пока пусто" text="Выберите вещь и размер в каталоге – она появится здесь." href={catalogHref} />
        ) : (
          <ul class="dr__list">
            {items.map((i) => (
              <li class="dr__item" key={i.id}>
                <a href={i.path} class="dr__img"><img src={i.img} alt="" loading="lazy" width="96" height="128" /></a>
                <div class="dr__info">
                  <a href={i.path} class="dr__name">{i.title}</a>
                  {i.size && <span class="dr__size">Размер {i.size}</span>}
                  <div class="dr__row">
                    <div class="qty" role="group" aria-label={`Количество: ${i.title}`}>
                      <button type="button" aria-label="Меньше" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                      <span>{i.qty}</span>
                      <button type="button" aria-label="Больше" disabled={i.qty >= MAX_QTY} onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                    </div>
                    <b>{fmt(i.price * i.qty)}</b>
                  </div>
                </div>
                <button type="button" class="dr__del" aria-label={`Удалить: ${i.title}, ${i.size}`} onClick={() => removeFromCart(i.id)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <Drawer
        open={sheet.value === 'fav'}
        label="Избранное"
        title={<>Избранное {fav.length > 0 && <small>{fav.length}</small>}</>}
        footer={fav.length > 0 && <a class="btn dr__cta" href={favHref}>Все избранные</a>}
      >
        {fav.length === 0 ? (
          <Empty title="Пока ничего не сохранено" text="Нажимайте ♡ на карточках – вещи сохранятся здесь, даже если закрыть сайт." href={catalogHref} />
        ) : (
          <ul class="dr__list">
            {fav.map((f) => (
              <li class="dr__item" key={f.uid}>
                <a href={f.path} class="dr__img"><img src={f.img} alt="" loading="lazy" width="96" height="128" /></a>
                <div class="dr__info">
                  <a href={f.path} class="dr__name">{f.title}</a>
                  <b>{fmt(f.price)}</b>
                  <a href={f.path} class="dr__link">Выбрать размер</a>
                </div>
                <button type="button" class="dr__del" aria-label={`Убрать из избранного: ${f.title}`} onClick={() => toggleFav(f)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <div class={`toast${t ? ' is-on' : ''}`} role="status" aria-live="polite">
        {t && (
          <>
            <span>{t.text}</span>
            <button type="button" onClick={() => ((sheet.value = 'cart'), (toast.value = null))}>Открыть корзину</button>
          </>
        )}
      </div>
    </>
  );
}
