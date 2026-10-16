/* Электронная коммерция Яндекс Метрики для магазина «Вариант 1» – вместо Тильды, которая сейчас шлёт эти
   события с alex-krown.com. Формат тот же (dataLayer, detail / add / remove / purchase; товар по названию),
   поэтому отчёты «Товарный спрос» в админке после переезда считаются так же.
   Счётчик читает dataLayer, только если он стоит на странице (V1.astro, PUBLIC_METRIKA_ID – боевой домен);
   на показе в GitHub события копятся в window.dataLayer и никуда не уходят – так их и проверяем. */

export interface EcItem { uid: string; title: string; price: number; size?: string; qty?: number; category?: string }

const BRAND = 'ALEX KROWN';

function push(action: 'detail' | 'add' | 'remove' | 'purchase', products: EcItem[], actionField?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !products.length) return;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({
    ecommerce: {
      currencyCode: 'RUB',
      [action]: {
        ...(actionField ? { actionField } : {}),
        products: products.map((p) => ({
          id: p.uid,
          name: p.title,
          price: p.price,
          brand: BRAND,
          ...(p.category ? { category: p.category } : {}),
          ...(p.size ? { variant: p.size } : {}),
          ...(action === 'detail' ? {} : { quantity: p.qty ?? 1 }),
        })),
      },
    },
  });
}

/** открыли карточку товара */
export const ecDetail = (p: EcItem) => push('detail', [p]);
/** положили в корзину (qty – сколько добавили) */
export const ecAdd = (p: EcItem) => push('add', [p]);
/** убрали из корзины (qty – сколько убрали) */
export const ecRemove = (p: EcItem) => push('remove', [p]);
/** отправили заказ: номер заказа и весь состав корзины */
export const ecPurchase = (orderId: string, items: EcItem[], revenue: number) => push('purchase', items, { id: orderId, revenue });
