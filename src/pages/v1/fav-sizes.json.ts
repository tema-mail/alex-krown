/** Размеры и цены товаров для кнопки «В корзину» в избранном (islands/FavBuy.tsx): uid → [{ size, price }].
    Отдельный файл, чтобы не грузить в браузер весь каталог; скрытых товаров нет – у них остаётся «Выбрать размер». */
import type { APIRoute } from 'astro';
import { products } from '../../v1/site';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(Object.fromEntries(products.map((p) => [p.uid, p.sizes.map((s) => ({ size: s.size, price: s.price }))]))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
