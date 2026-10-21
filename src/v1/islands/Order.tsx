import { useEffect, useState } from 'preact/hooks';
import { cart, cartTotal, clearCart, fmt, MAX_QTY, removeFromCart, setQty } from '../store';
import { ecPurchase } from '../ecommerce';
import { earnFor, getShop, lineId, pointsWord, PROGRAM, snap, v1url } from '../loyalty';
import type { QuoteView } from '../../vendor/shop-engine/shop-engine.js';

/* Оформление заказа магазина «Вариант 1». Своего сервера у сайта нет, поэтому заказ собирается
   в сообщение и уходит менеджеру бренда в Telegram или MAX (ORDER_CHANNELS). Поменять канал – одна константа:
   позже сюда встаёт приём заказов (Тильда, CRM, свой сервер). Оплата онлайн без сервера невозможна –
   покупатель выбирает удобный способ, менеджер присылает ссылку на оплату.
   Баллы (docs/ПЛАН-ЛК.md, решение 4; как Order.tsx Milovini): кабинет – демо в браузере, поэтому менеджеру «Итого»
   уходит без вычета баллов, а демо-баллы и номер в кабинете – отдельными строками «не применять». Сбой кабинета
   не мешает настоящему заказу – он уходит без баллов. */
/* куда покупатель отправляет заказ (владелец 21.10.2026: «Telegram и MAX, а не WhatsApp»). Ссылки пока тестовые:
   Telegram – аккаунт бренда с сайта, MAX – общий адрес; ссылки менеджера владелец даст до боя (docs/ТЕХДОЛГ.md).
   Telegram и MAX не принимают текст в ссылке – кнопка сама копирует заказ, покупатель вставляет его в чат. */
export const ORDER_CHANNELS = [
  { label: 'Telegram', href: 'https://t.me/Alex_Krown', test: false },
  { label: 'MAX', href: 'https://max.ru/', test: true },
];
const ORDER_PHONE = { href: 'tel:+79830055859', text: '+7 983-005-58-59' };

/* условия – со страницы «Доставка и оплата» бренда */
const DELIVERY = [
  ['cdek', 'СДЭК', 'Сборка заказа 2–3 рабочих дня, отправка из Новосибирска; сроки и стоимость – по тарифам СДЭК'],
  ['urgent', 'Срочная доставка', 'Менеджер свяжется и предложит вариант'],
] as const;
const LAST = 'ak_v1_last_order';
const PAYMENT = [
  ['card', 'Картой, ЮMoney или по телефону (ЮKassa)'],
  ['dolyami', 'Долями от Т-Банка'],
  ['installment', 'Рассрочка от Т-Банка'],
] as const;

interface Form { name: string; phone: string; email: string; city: string; address: string; delivery: string; payment: string; comment: string; agree: boolean }

const phoneOk = (s: string) => s.replace(/\D/g, '').length >= 10;

const Crown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.5 7.5 7.5 12 12 4l4.5 8 5-4.5L19.5 18h-15z" /><rect x="4.5" y="19.3" width="15" height="1.9" rx=".4" /></svg>
);

export default function Order({ catalogHref, policyHref, offerHref }: { catalogHref: string; policyHref: string; offerHref: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [f, setF] = useState<Form>({ name: '', phone: '', email: '', city: '', address: '', delivery: 'cdek', payment: 'card', comment: '', agree: false });
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<{ no: string; text: string; lk?: boolean; pointsLost?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  /* сколько баллов списать: null – максимум, что можно (баланс и не больше доли списания программы) */
  const [pointsReq, setPointsReq] = useState<number | null>(null);
  const [q, setQ] = useState<QuoteView | null>(null);
  const [lkError, setLkError] = useState('');
  /* собранный, но ещё не отправленный заказ переживает обновление страницы */
  useEffect(() => {
    try {
      const last = JSON.parse(sessionStorage.getItem(LAST) || 'null');
      if (last?.no) setDone(last);
    } catch {}
  }, []);
  /* корзина чистится, когда заказ ушёл в мессенджер или скопирован */
  const sent = () => {
    clearCart();
    try {
      sessionStorage.removeItem(LAST);
    } catch {}
  };
  const set = (k: keyof Form) => (e: Event) => {
    const t = e.target as HTMLInputElement;
    setF({ ...f, [k]: t.type === 'checkbox' ? t.checked : t.value });
  };
  const items = ready ? cart.value : [];
  const loggedIn = ready && snap.value.email !== null;
  const lkLines = () => items.map((i) => ({ productId: lineId(i.uid, i.size), qty: i.qty }));
  const lineKey = items.map((i) => `${i.id}*${i.qty}`).join(',');
  /* расчёт баллов кабинета: сколько можно списать и сколько начислим – только для вошедшего */
  useEffect(() => {
    if (!loggedIn || !items.length || done) {
      setQ(null);
      return;
    }
    let live = true;
    getShop()
      .then((shop) => shop.quote({ lines: lkLines(), usePoints, points: pointsReq ?? undefined }))
      .then((r) => live && (setQ(r), setLkError('')))
      .catch((e: unknown) => live && (setQ(null), setLkError(e instanceof Error ? e.message : 'Кабинет не ответил')));
    return () => {
      live = false;
    };
  }, [loggedIn, lineKey, usePoints, pointsReq, !!done]);
  const earn = q ? q.earn : earnFor(ready ? cartTotal.value : 0);

  if (!ready) return <p class="pp__hint">Загружаем корзину…</p>;

  if (done) {
    const copyText = () => navigator.clipboard?.writeText(done.text).then(() => setCopied(true)).catch(() => {});
    return (
      <div class="done">
        <h2 class="h2">Заказ {done.no} оформлен</h2>
        <p>Отправьте его менеджеру в Telegram или MAX: по кнопке текст заказа скопируется сам – вставьте его в чат. Менеджер подтвердит наличие размеров, посчитает доставку и пришлёт ссылку на оплату.</p>
        <p class="done__send">
          {ORDER_CHANNELS.map((c) => (
            <a class="btn btn--solid" href={c.href} target="_blank" rel="noopener" onClick={() => (copyText(), sent())}>
              Отправить в {c.label}{c.test ? ' (тест)' : ''}
            </a>
          ))}
        </p>
        {copied && <p class="pp__hint">Текст заказа скопирован – вставьте его в чат с менеджером.</p>}
        {done.pointsLost && <p class="field__err" role="alert">Кабинет не ответил – баллы к этому заказу не применились, заказ оформлен без них.</p>}
        {done.lk && <p class="pp__hint">Заказ и баллы за него видны в <a class="order__lk" href={v1url('lk/zakazy')}>личном кабинете</a> (демо).</p>}
        <pre>{done.text}</pre>
        <p>
          <button type="button" class="btn" onClick={() => navigator.clipboard?.writeText(done.text).then(() => (setCopied(true), sent())).catch(() => {})}>
            {copied ? 'Скопировано' : 'Скопировать текст заказа'}
          </button>
        </p>
        <p class="pp__hint">Не получается написать? Позвоните: <a href={ORDER_PHONE.href}>{ORDER_PHONE.text}</a>.</p>
      </div>
    );
  }

  if (!items.length)
    return (
      <div class="dr__empty">
        <p class="dr__empty-title">В корзине пока пусто</p>
        <p>Выберите вещь и размер в каталоге – и возвращайтесь сюда.</p>
        <a class="btn btn--solid" href={catalogHref}>В каталог</a>
      </div>
    );

  const errs = {
    name: !f.name.trim() && 'Как к вам обращаться?',
    phone: !phoneOk(f.phone) && 'Нужен телефон для связи',
    city: !f.city.trim() && 'Укажите город',
    agree: !f.agree && 'Нужно согласие на обработку данных',
  };
  const bad = Object.values(errs).some(Boolean);

  const submit = async (e: Event) => {
    e.preventDefault();
    setTried(true);
    if (bad || busy) return;
    const d = new Date();
    const no = `AK-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`; // с секундами: два заказа в одну минуту – разные номера
    /* заказ в кабинете (демо) – до текста менеджеру; любой сбой кабинета – заказ уходит без баллов */
    const demo: string[] = [];
    let inLk = false, pointsLost = false;
    if (loggedIn) {
      setBusy(true);
      try {
        const shop = await getShop();
        const placed = await shop.placeOrder({ lines: lkLines(), usePoints, points: pointsReq ?? undefined, meta: { externalNum: no } });
        inLk = true; // номер в кабинете – тот же AK-…, менеджеру отдельной строкой не нужен
        if (placed.pointsUsed > 0) demo.push(`Демо-баллы (не применять): ${placed.pointsUsed} ${pointsWord(placed.pointsUsed)} – демо-кабинет, итог не уменьшать`);
      } catch {
        demo.length = 0;
        pointsLost = usePoints; // покупатель хотел оплатить баллами – скажем, что не вышло
      }
      setBusy(false);
    }
    const lines = [
      `Заказ ${no} с сайта ALEX KROWN`,
      '',
      ...items.map((i, n) => `${n + 1}. ${i.title}${i.size ? `, размер ${i.size}` : ''} – ${i.qty} шт. × ${fmt(i.price)}`),
      '',
      `Итого: ${fmt(cartTotal.value)} без доставки`,
      `Доставка: ${DELIVERY.find((x) => x[0] === f.delivery)![1]}`,
      `Оплата: ${PAYMENT.find((x) => x[0] === f.payment)![1]}`,
      ...demo,
      '',
      `Имя: ${f.name.trim()}`,
      `Телефон: ${f.phone.trim()}`,
      ...(f.email.trim() ? [`Почта: ${f.email.trim()}`] : []),
      `Город: ${f.city.trim()}`,
      ...(f.address.trim() ? [`Адрес / пункт СДЭК: ${f.address.trim()}`] : []),
      ...(f.comment.trim() ? [`Комментарий: ${f.comment.trim()}`] : []),
    ];
    const order = { no, text: lines.join('\n'), lk: inLk, pointsLost };
    /* заказ отправлен – «покупка» в Метрике, как у корзины Тильды (оплата у ALEX KROWN – после, у менеджера) */
    ecPurchase(no, items.map((i) => ({ uid: i.uid, title: i.title, price: i.price, size: i.size, qty: i.qty })), cartTotal.value);
    setDone(order);
    try {
      sessionStorage.setItem(LAST, JSON.stringify(order));
    } catch {}
    scrollTo({ top: 0, behavior: 'smooth' });
  };

  const err = (k: keyof typeof errs) => tried && errs[k] && <span class="field__err">{errs[k]}</span>;

  return (
    <div class="order">
      <form class="form" onSubmit={submit} noValidate>
        <fieldset>
          <legend>Контакты</legend>
          <label class="field">Имя<input value={f.name} onInput={set('name')} autocomplete="name" required />{err('name')}</label>
          <label class="field">Телефон<input value={f.phone} onInput={set('phone')} type="tel" inputMode="tel" autocomplete="tel" placeholder="+7" required />{err('phone')}</label>
          <label class="field">Почта (необязательно)<input value={f.email} onInput={set('email')} type="email" autocomplete="email" /></label>
        </fieldset>
        <fieldset>
          <legend>Доставка</legend>
          {DELIVERY.map(([v, t, s]) => (
            <label class="radio"><input type="radio" name="delivery" value={v} checked={f.delivery === v} onChange={set('delivery')} /><span>{t}<small>{s}</small></span></label>
          ))}
          <label class="field">Город<input value={f.city} onInput={set('city')} autocomplete="address-level2" required />{err('city')}</label>
          <label class="field">Адрес или пункт СДЭК<input value={f.address} onInput={set('address')} autocomplete="street-address" /></label>
        </fieldset>
        <fieldset>
          <legend>Оплата</legend>
          {PAYMENT.map(([v, t]) => (
            <label class="radio"><input type="radio" name="payment" value={v} checked={f.payment === v} onChange={set('payment')} /><span>{t}<small>Ссылку на оплату пришлёт менеджер после подтверждения заказа</small></span></label>
          ))}
          {loggedIn && (
            <div class="order__pts">
              <label class="radio">
                <input type="checkbox" checked={usePoints} disabled={!q || (q.maxPoints === 0 && !usePoints)} onChange={(e) => setUsePoints((e.target as HTMLInputElement).checked)} />
                <span>
                  Оплатить баллами (демо){q ? ` – на счету ${snap.value.available.toLocaleString('ru-RU')}, к этому заказу можно до ${q.maxPoints.toLocaleString('ru-RU')} (не больше ${PROGRAM.maxRedeemPercent}% суммы)` : ''}
                  <small>Демо-кабинет: баллы хранятся в этом браузере, менеджер их не списывает – итог заказа не меняется.</small>
                </span>
              </label>
              {usePoints && q && q.maxPoints > 0 && (
                <div class="order__pts-amount">
                  <label class="field">Сколько баллов списать
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={q.maxPoints}
                      step={1}
                      value={Math.min(pointsReq ?? q.maxPoints, q.maxPoints)}
                      onInput={(e) => {
                        const v = (e.target as HTMLInputElement).value;
                        // пусто – 0; иначе целое от 0 до максимума (больше движок всё равно не спишет); корзина уменьшилась – на экране новый максимум
                        setPointsReq(v === '' ? 0 : Math.max(0, Math.min(q.maxPoints, Math.floor(Number(v)) || 0)));
                      }}
                    />
                  </label>
                  <button type="button" class="btn" onClick={() => setPointsReq(null)}>Максимум – {q.maxPoints.toLocaleString('ru-RU')}</button>
                </div>
              )}
              {lkError && <p class="field__err" role="alert">{lkError}</p>}
            </div>
          )}
          <label class="field">Комментарий<textarea rows={3} value={f.comment} onInput={set('comment')} /></label>
        </fieldset>
        <label class="radio">
          <input type="checkbox" checked={f.agree} onChange={set('agree')} />
          <span>
            Согласен на обработку персональных данных по <a href={policyHref}>политике конфиденциальности</a> и с <a href={offerHref}>договором оферты</a>
            {err('agree') && <> {err('agree')}</>}
          </span>
        </label>
        {/* стандарт форм: без галочки согласия кнопка неактивна (галочка по умолчанию пустая) */}
        <button type="submit" class="btn btn--solid" disabled={busy || !f.agree}>Оформить заказ</button>
        {tried && bad && <p class="field__err" role="alert">Проверьте отмеченные поля</p>}
      </form>

      <aside class="summary" aria-label="Ваш заказ">
        <p class="dr__title">Ваш заказ</p>
        <ul class="dr__list">
          {items.map((i) => (
            <li class="dr__item" key={i.id}>
              <a href={i.path} class="dr__img"><img src={i.img} alt="" width="72" height="96" loading="lazy" /></a>
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
              <button type="button" class="dr__del" aria-label={`Удалить: ${i.title}`} onClick={() => removeFromCart(i.id)}>×</button>
            </li>
          ))}
        </ul>
        <p class="dr__total"><span>Товары</span><b>{fmt(cartTotal.value)}</b></p>
        {loggedIn && q && q.pointsUsed > 0 && (
          <dl class="order__sum-pts">
            <div><dt>Баллами (демо)</dt><dd>−{q.pointsUsed.toLocaleString('ru-RU')}</dd></div>
            <div><dt>С баллами (демо)</dt><dd>{fmt(q.payRub)}</dd></div>
          </dl>
        )}
        {earn > 0 && (
          <p class="order__earn">
            <Crown />
            <span>
              {!loggedIn && <><a href={v1url('lk')}>Войдите</a> – </>}
              начислим +{earn.toLocaleString('ru-RU')} {pointsWord(earn)}{loggedIn ? ' (демо)' : ''} на следующий заказ
            </span>
          </p>
        )}
        <p class="dr__note">Доставка СДЭК – по тарифам службы, менеджер посчитает её после заказа.</p>
      </aside>
    </div>
  );
}
