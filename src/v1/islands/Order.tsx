import { useEffect, useState } from 'preact/hooks';
import { cart, cartTotal, clearCart, fmt, MAX_QTY, removeFromCart, setQty } from '../store';

/* Оформление заказа магазина «Вариант 1». Своего сервера у сайта нет, поэтому заказ собирается
   в сообщение и уходит менеджеру бренда в WhatsApp (ORDER_CHANNEL). Поменять канал – одна константа:
   позже сюда встаёт приём заказов (Тильда, CRM, свой сервер). Оплата онлайн без сервера невозможна –
   покупатель выбирает удобный способ, менеджер присылает ссылку на оплату. */
export const ORDER_CHANNEL = { kind: 'whatsapp' as const, phone: '79830055859', label: 'WhatsApp' };

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

export default function Order({ catalogHref, policyHref, offerHref }: { catalogHref: string; policyHref: string; offerHref: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [f, setF] = useState<Form>({ name: '', phone: '', email: '', city: '', address: '', delivery: 'cdek', payment: 'card', comment: '', agree: false });
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<{ no: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
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

  if (!ready) return <p class="pp__hint">Загружаем корзину…</p>;

  if (done) {
    const href = `https://wa.me/${ORDER_CHANNEL.phone}?text=${encodeURIComponent(done.text)}`;
    return (
      <div class="done">
        <h2 class="h2">Заказ {done.no} собран</h2>
        <p>Отправьте его менеджеру в {ORDER_CHANNEL.label} – он подтвердит наличие размеров, посчитает доставку и пришлёт ссылку на оплату.</p>
        <p><a class="btn btn--solid" href={href} target="_blank" rel="noopener" onClick={sent}>Отправить в {ORDER_CHANNEL.label}</a></p>
        <pre>{done.text}</pre>
        <p>
          <button type="button" class="btn" onClick={() => navigator.clipboard?.writeText(done.text).then(() => (setCopied(true), sent())).catch(() => {})}>
            {copied ? 'Скопировано' : 'Скопировать текст заказа'}
          </button>
        </p>
        <p class="pp__hint">Не открылся {ORDER_CHANNEL.label}? Позвоните: <a href="tel:+79830055859">+7 983-005-58-59</a>.</p>
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

  const submit = (e: Event) => {
    e.preventDefault();
    setTried(true);
    if (bad) return;
    const d = new Date();
    const no = `AK-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const lines = [
      `Заказ ${no} с сайта ALEX KROWN`,
      '',
      ...items.map((i, n) => `${n + 1}. ${i.title}${i.size ? `, размер ${i.size}` : ''} – ${i.qty} шт. × ${fmt(i.price)}`),
      '',
      `Итого: ${fmt(cartTotal.value)} без доставки`,
      `Доставка: ${DELIVERY.find((x) => x[0] === f.delivery)![1]}`,
      `Оплата: ${PAYMENT.find((x) => x[0] === f.payment)![1]}`,
      '',
      `Имя: ${f.name.trim()}`,
      `Телефон: ${f.phone.trim()}`,
      ...(f.email.trim() ? [`Почта: ${f.email.trim()}`] : []),
      `Город: ${f.city.trim()}`,
      ...(f.address.trim() ? [`Адрес / пункт СДЭК: ${f.address.trim()}`] : []),
      ...(f.comment.trim() ? [`Комментарий: ${f.comment.trim()}`] : []),
    ];
    const order = { no, text: lines.join('\n') };
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
          <label class="field">Комментарий<textarea rows={3} value={f.comment} onInput={set('comment')} /></label>
        </fieldset>
        <label class="radio">
          <input type="checkbox" checked={f.agree} onChange={set('agree')} />
          <span>
            Согласен на обработку персональных данных по <a href={policyHref}>политике конфиденциальности</a> и с <a href={offerHref}>договором оферты</a>
            {err('agree')}
          </span>
        </label>
        <button type="submit" class="btn btn--solid">Оформить заказ</button>
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
        <p class="dr__note">Доставка СДЭК – по тарифам службы, менеджер посчитает её после заказа.</p>
      </aside>
    </div>
  );
}
