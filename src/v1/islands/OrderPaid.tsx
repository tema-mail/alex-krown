import { useEffect, useRef, useState } from 'preact/hooks';
import { API_MODE, getShop } from '../loyalty';
import { ORDER_CHANNELS } from './Order';

/* Итог оплаты картой (план shop-modules ПЛАН-ОПЛАТА-ЮKASSA, P9): ЮKassa возвращает покупателя сюда с ?order=<номер
   заказа на сервере>. Итог – только от сервера магазина (он сам спрашивает ЮKassa): «оплачен», «проверяем – не платите
   повторно», «не прошла – оплатить ещё раз». Пока «проверяем» – спрашиваем раз в 3 с, минуту (один цикл), дальше – по кнопке.
   Доставка в платёж не входит: после оплаты покупатель отправляет заказ менеджеру (текст – из оформления в этой
   вкладке, ключ ak_v1_last_order, как в Order.tsx), менеджер считает доставку. Демо-сборка (Pages) оплату не знает. */

const LAST = 'ak_v1_last_order';
const POLL_MS = 3000;
const POLL_TRIES = 20;
const ID_RE = /^[1-9]\d{0,17}$/;

type View =
  | { s: 'loading' }
  | { s: 'paid' | 'pending' | 'declined' | 'none'; message: string }
  | { s: 'login' }
  | { s: 'bad' };

const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Не получилось – попробуйте ещё раз');
const statusOf = (e: unknown) => (e as { status?: unknown } | null)?.status;

export default function OrderPaid({ catalogHref, ordersHref, accountHref }: { catalogHref: string; ordersHref: string; accountHref: string }) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ s: 'loading' });
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [last, setLast] = useState<{ no: string; text: string } | null>(null);
  const live = useRef(true);
  /* номер цикла опроса: новый цикл («Проверить ещё раз») гасит старый – одновременно идёт не больше одного */
  const gen = useRef(0);

  const poll = (id: string) => {
    const g = ++gen.current;
    setPolling(true);
    void check(id, POLL_TRIES, g);
  };
  /* один опрос сервера; pending или сбой – ещё раз через 3 с, пока не кончились попытки */
  const check = async (id: string, triesLeft: number, g: number) => {
    const mine = () => live.current && g === gen.current;
    const again = () => setTimeout(() => mine() && void check(id, triesLeft - 1, g), POLL_MS);
    setError('');
    try {
      const shop = await getShop();
      if (!shop.payments) throw new Error('Оплата картой сейчас недоступна');
      const r = await shop.payments.status(id);
      if (!mine()) return;
      setView({ s: r.state, message: r.message });
      if (r.state === 'pending' && triesLeft > 0) again();
      else setPolling(false);
    } catch (e) {
      if (!mine()) return;
      const st = statusOf(e);
      if (st === 401 || st === 404) {
        setView({ s: st === 401 ? 'login' : 'bad' }); // не вошёл / чужой или несуществующий заказ
        setPolling(false);
        return;
      }
      // сеть или частота: «проверяем», ещё раз позже – оплата могла пройти, повторно платить нельзя
      setView((v) => (v.s === 'loading' ? { s: 'pending', message: 'Проверяем оплату у банка. Не платите повторно' } : v));
      if (triesLeft > 0) again();
      else (setPolling(false), setError(errText(e)));
    }
  };

  useEffect(() => {
    live.current = true;
    const id = new URLSearchParams(location.search).get('order') ?? '';
    if (!API_MODE || !ID_RE.test(id)) {
      setView({ s: 'bad' });
      return;
    }
    setOrderId(id);
    try {
      const l = JSON.parse(sessionStorage.getItem(LAST) || 'null');
      if (l?.payOrderId === id && typeof l.text === 'string') setLast({ no: String(l.no), text: l.text });
    } catch {}
    poll(id);
    return () => {
      live.current = false;
    };
  }, []);

  /* «оплатить ещё раз»: новая попытка на сервере и переход на страницу ЮKassa */
  const payAgain = async () => {
    if (!orderId || busy) return;
    setBusy(true);
    setError('');
    try {
      const shop = await getShop();
      if (!shop.payments) throw new Error('Оплата картой сейчас недоступна');
      const { confirmationUrl } = await shop.payments.start(orderId);
      location.assign(confirmationUrl);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };
  const copy = () => last && navigator.clipboard?.writeText(last.text).then(() => setCopied(true)).catch(() => {});

  if (view.s === 'loading') return <p class="pp__hint">Проверяем оплату…</p>;
  if (view.s === 'bad')
    return (
      <div class="done">
        <p>{API_MODE ? 'Не нашли заказ по этой ссылке. Ваши заказы – в личном кабинете.' : 'Оплата картой на этом сайте не подключена – заказ оформляется через менеджера.'}</p>
        <p><a class="btn btn--solid" href={API_MODE ? ordersHref : catalogHref}>{API_MODE ? 'Мои заказы' : 'В каталог'}</a></p>
      </div>
    );
  if (view.s === 'login')
    return (
      <div class="done">
        <p>Войдите в личный кабинет – там видно, оплачен ли заказ.</p>
        <p><a class="btn btn--solid" href={accountHref}>Войти</a></p>
      </div>
    );

  return (
    <div class="done" aria-live="polite">
      {view.s === 'paid' && (
        <>
          <h2 class="h2">{last ? `Заказ ${last.no} оплачен` : 'Заказ оплачен'}</h2>
          <p>Картой оплачены товары. Доставку менеджер посчитает отдельно – отправьте ему заказ{last ? ': по кнопке текст скопируется сам, вставьте его в чат.' : ' (номер – в личном кабинете).'}</p>
          <p class="done__send">
            {ORDER_CHANNELS.map((c) => (
              <a class="btn btn--solid" href={c.href} target="_blank" rel="noopener" onClick={() => void copy()}>
                Отправить в {c.label}
              </a>
            ))}
          </p>
          {copied && <p class="pp__hint">Текст заказа скопирован – вставьте его в чат с менеджером.</p>}
          <p><a href={ordersHref}>Мои заказы</a></p>
        </>
      )}
      {view.s === 'pending' && (
        <>
          <h2 class="h2">Ждём ответ банка</h2>
          <p>{view.message || 'Проверяем оплату у банка. Не платите повторно'}</p>
          {polling ? (
            <p class="pp__hint" role="status">Обновится само через несколько секунд.</p>
          ) : (
            <p>
              <button type="button" class="btn" disabled={busy} onClick={() => orderId && poll(orderId)}>
                Проверить ещё раз
              </button>
            </p>
          )}
        </>
      )}
      {view.s === 'declined' && (
        <>
          <h2 class="h2">Оплата не прошла</h2>
          <p>{view.message || 'Оплата не прошла – можно оплатить ещё раз'}</p>
          <p>
            <button type="button" class="btn btn--solid" disabled={busy} onClick={() => void payAgain()}>
              {busy ? 'Открываем оплату…' : 'Оплатить ещё раз'}
            </button>
          </p>
        </>
      )}
      {view.s === 'none' && (
        <>
          <p>{view.message || 'Оплаты по заказу нет'}</p>
          <p><a class="btn btn--solid" href={ordersHref}>Мои заказы</a></p>
        </>
      )}
      {error && <p class="field__err" role="alert">{error}</p>}
    </div>
  );
}
