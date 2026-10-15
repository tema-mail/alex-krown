import { useEffect, useState } from 'preact/hooks';
import { favs, fmt, toggleFav } from '../store';

/* Страница избранного: сохранённые вещи из localStorage сеткой (2 в ряд на телефоне). Размер
   выбирается на карточке товара – сюда сохраняется сама вещь. */
export default function FavPage({ catalogHref }: { catalogHref: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  const list = favs.value;
  if (!list.length)
    return (
      <div class="dr__empty">
        <p class="dr__empty-title">Пока ничего не сохранено</p>
        <p>Нажимайте ♡ на карточках – вещи сохранятся здесь, даже если закрыть сайт.</p>
        <a class="btn btn--solid" href={catalogHref}>В каталог</a>
      </div>
    );
  return (
    <div class="grid">
      {list.map((f) => (
        <article class="prod" key={f.uid}>
          <a href={f.path} class="prod__img"><img src={f.img} alt={f.title} loading="lazy" width="480" height="640" /></a>
          <button type="button" class="prod__fav" aria-pressed="true" aria-label={`Убрать из избранного: ${f.title}`} onClick={() => toggleFav(f)}>♥</button>
          <a href={f.path}>
            <h2 class="prod__name">{f.title}</h2>
            <p class="prod__price">{fmt(f.price)}{f.priceOld && f.priceOld > f.price && <s>{fmt(f.priceOld)}</s>}</p>
          </a>
        </article>
      ))}
    </div>
  );
}
