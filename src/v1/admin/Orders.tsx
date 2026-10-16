import { useMemo, useState } from 'preact/hooks';

/* «Продажи» и «Заявки» админки магазина «Вариант 1» – по модели заказов Тильды: номер, дата, покупатель,
   состав с размерами, сумма, доставка, способ и статус оплаты, статус заказа, источник (UTM), история.
   Заявки – обращения без оплаты (формы, «перезвоните»), этапы как на доске.
   Своего приёмника заказов у сайта пока нет (заказ уходит в WhatsApp), поэтому без данных показывается
   пустой список; кнопка «Показать пример» включает явно подписанные примерные записи. */

export type PayStatus = 'не оплачен' | 'оплачен' | 'частично' | 'возврат';
export type OrderStatus = 'новый' | 'подтверждён' | 'собран' | 'отправлен' | 'получен' | 'отменён';
export interface OrderItem { uid: string; title: string; size: string; qty: number; price: number }
export interface Order {
  id: string; createdAt: string; customer: { name: string; phone: string; email?: string; city: string; address?: string };
  items: OrderItem[]; delivery: { method: string; cost: number | null }; promo?: string; discount?: number;
  payment: { method: string; status: PayStatus }; status: OrderStatus;
  source: { channel: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; referrer?: string };
  comment?: string; history: { at: string; text: string }[];
}
export interface Lead { id: string; createdAt: string; name: string; phone: string; form: string; page: string; message?: string; stage: 'новая' | 'в работе' | 'перезвонить' | 'закрыта'; source: string }

const PAY: PayStatus[] = ['не оплачен', 'оплачен', 'частично', 'возврат'];
const FLOW: OrderStatus[] = ['новый', 'подтверждён', 'собран', 'отправлен', 'получен', 'отменён'];
const STAGES: Lead['stage'][] = ['новая', 'в работе', 'перезвонить', 'закрыта'];
const rub = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
const dt = (s: string) => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const sum = (o: Order) => o.items.reduce((s, i) => s + i.price * i.qty, 0) - (o.discount ?? 0) + (o.delivery.cost ?? 0);
const payColor: Record<PayStatus, string> = { 'не оплачен': '#b0333f', оплачен: '#1f7a4d', частично: '#a86b00', возврат: '#55605d' };

function SalesView({ orders: init, example }: { orders: Order[]; example: boolean }) {
  const [orders, setOrders] = useState(init);
  const [st, setSt] = useState('');
  const [pay, setPay] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Order | null>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter((o) => (!st || o.status === st) && (!pay || o.payment.status === pay) && (!s || [o.id, o.customer.name, o.customer.phone, ...o.items.map((i) => i.title)].join(' ').toLowerCase().includes(s)));
  }, [orders, st, pay, q]);
  const paid = orders.filter((o) => o.payment.status === 'оплачен' && o.status !== 'отменён');
  const revenue = paid.reduce((s, o) => s + sum(o), 0);
  const update = (o: Order, patch: Partial<Order>, text: string) => {
    const next = { ...o, ...patch, history: [...o.history, { at: new Date().toISOString(), text }] };
    setOrders(orders.map((x) => (x.id === o.id ? next : x)));
    setOpen(next);
  };

  return (
    <>
      <div class="kpi" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px">
        {[['Заказов', String(orders.length)], ['Оплачено', String(paid.length)], ['Выручка (оплаченные)', rub(revenue)], ['Средний чек', paid.length ? rub(Math.round(revenue / paid.length)) : '–']].map(([t, v]) => (
          <div class="panel" style="margin:0"><p class="muted" style="margin:0 0 6px;font-size:12px">{t}</p><b style="font-size:22px">{v}</b></div>
        ))}
      </div>
      <div class="tools">
        <h1>Продажи {example && <span class="chip">пример</span>}</h1>
        <input type="search" placeholder="Номер, имя, телефон, товар" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select value={st} onChange={(e) => setSt((e.target as HTMLSelectElement).value)} aria-label="Статус заказа"><option value="">Все статусы</option>{FLOW.map((s) => <option>{s}</option>)}</select>
        <select value={pay} onChange={(e) => setPay((e.target as HTMLSelectElement).value)} aria-label="Оплата"><option value="">Любая оплата</option>{PAY.map((s) => <option>{s}</option>)}</select>
      </div>
      <div class="panel" style="padding:0;overflow:auto">
        <table class="vt" style="width:100%;min-width:900px">
          <thead><tr><th>№</th><th>Дата</th><th>Покупатель</th><th>Состав</th><th>Сумма</th><th>Оплата</th><th>Статус</th><th>Источник</th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr style="cursor:pointer" onClick={() => setOpen(o)}>
                <td><b>{o.id}</b></td><td>{dt(o.createdAt)}</td>
                <td>{o.customer.name}<br /><span class="muted">{o.customer.city}</span></td>
                <td>{o.items.map((i) => <div>{i.title}{i.size && `, ${i.size}`} × {i.qty}</div>)}</td>
                <td><b>{rub(sum(o))}</b></td>
                <td><span style={`color:${payColor[o.payment.status]};font-weight:600`}>{o.payment.status}</span><br /><span class="muted">{o.payment.method}</span></td>
                <td><span class="chip">{o.status}</span></td>
                <td class="muted">{o.source.utm_source || o.source.channel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p class="muted" style="padding:28px;text-align:center">{orders.length ? 'Ничего не найдено' : 'Заказов пока нет – они появятся, когда подключим приём заказов с сайта'}</p>}
      </div>

      {open && (
        <div class="ed" role="dialog" aria-modal="true" aria-label={`Заказ ${open.id}`}>
          <div class="ed__bg" onClick={() => setOpen(null)} />
          <div class="ed__panel">
            <header class="ed__head">
              <div><p class="muted" style="margin:0;font-size:12px">Продажи → заказ {example && '(пример)'}</p><h2>Заказ № {open.id}</h2></div>
              <button class="btn" onClick={() => setOpen(null)}>Закрыть</button>
            </header>
            <div class="ed__body">
              <div class="fgrid">
                <label class="f"><span>Статус заказа</span><select value={open.status} onChange={(e) => update(open, { status: (e.target as HTMLSelectElement).value as OrderStatus }, `Статус: ${(e.target as HTMLSelectElement).value}`)}>{FLOW.map((s) => <option>{s}</option>)}</select></label>
                <label class="f"><span>Оплата</span><select value={open.payment.status} onChange={(e) => update(open, { payment: { ...open.payment, status: (e.target as HTMLSelectElement).value as PayStatus } }, `Оплата: ${(e.target as HTMLSelectElement).value}`)}>{PAY.map((s) => <option>{s}</option>)}</select></label>
              </div>
              <h3 class="ed__h3">Покупатель</h3>
              <p>{open.customer.name} · <a href={`tel:${open.customer.phone}`}>{open.customer.phone}</a>{open.customer.email && <> · {open.customer.email}</>}<br />{open.customer.city}{open.customer.address && `, ${open.customer.address}`}</p>
              <h3 class="ed__h3">Состав</h3>
              <table class="vt" style="width:100%"><tbody>
                {open.items.map((i) => <tr><td>{i.title}</td><td>{i.size}</td><td>{i.qty} шт.</td><td style="text-align:right">{rub(i.price * i.qty)}</td></tr>)}
                {open.discount ? <tr><td colSpan={3}>Скидка{open.promo && ` (промокод ${open.promo})`}</td><td style="text-align:right">−{rub(open.discount)}</td></tr> : null}
                <tr><td colSpan={3}>Доставка: {open.delivery.method}</td><td style="text-align:right">{open.delivery.cost == null ? 'по тарифу' : rub(open.delivery.cost)}</td></tr>
                <tr><td colSpan={3}><b>Итого</b></td><td style="text-align:right"><b>{rub(sum(open))}</b></td></tr>
              </tbody></table>
              <h3 class="ed__h3">Источник</h3>
              <p class="muted">Канал: {open.source.channel}{open.source.utm_source && ` · utm_source=${open.source.utm_source}`}{open.source.utm_medium && ` · utm_medium=${open.source.utm_medium}`}{open.source.utm_campaign && ` · utm_campaign=${open.source.utm_campaign}`}</p>
              {open.comment && <><h3 class="ed__h3">Комментарий</h3><p>{open.comment}</p></>}
              <h3 class="ed__h3">История</h3>
              {open.history.map((h) => <p class="muted" style="margin:2px 0">{dt(h.at)} – {h.text}</p>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LeadsView({ leads, example }: { leads: Lead[]; example: boolean }) {
  const [list, setList] = useState(leads);
  return (
    <>
      <div class="tools"><h1>Заявки {example && <span class="chip">пример</span>}</h1></div>
      <div class="kb">
        {STAGES.map((stg) => (
          <section class="kb__col">
            <h2>{stg} <span>{list.filter((l) => l.stage === stg).length}</span></h2>
            {list.filter((l) => l.stage === stg).map((l) => (
              <article class="kb__card">
                <p class="kb__top"><b>№ {l.id}</b><span class="chip">{l.form}</span></p>
                <p class="kb__who">{l.name} · {l.phone}</p>
                {l.message && <p>{l.message}</p>}
                <p class="kb__meta"><span>{dt(l.createdAt)}</span><span class="muted">{l.source}</span></p>
                <select value={l.stage} onChange={(e) => setList(list.map((x) => (x.id === l.id ? { ...x, stage: (e.target as HTMLSelectElement).value as Lead['stage'] } : x)))} aria-label="Этап">{STAGES.map((s) => <option>{s}</option>)}</select>
              </article>
            ))}
            {list.filter((l) => l.stage === stg).length === 0 && <p class="muted" style="font-size:12.5px;text-align:center;padding:16px 0">Пусто</p>}
          </section>
        ))}
      </div>
    </>
  );
}

export default function Orders({ mode, orders, leads, sampleOrders, sampleLeads }: { mode: 'sales' | 'leads'; orders: Order[]; leads: Lead[]; sampleOrders: Order[]; sampleLeads: Lead[] }) {
  const [example, setExample] = useState(false);
  const empty = mode === 'sales' ? !orders.length : !leads.length;
  return (
    <div>
      {empty && (
        <p class="demo-note">
          {mode === 'sales'
            ? 'Своего приёмника заказов у сайта пока нет: заказ с сайта уходит менеджеру в WhatsApp, прежние заказы – в кабинете Тильды. Сюда заказы начнут падать, когда подключим приём (вопрос владельцу).'
            : 'Форм заявок на сайте пока нет, а заказы уходят в WhatsApp. Здесь будут обращения с форм и «перезвоните мне», когда подключим приём.'}
          <button class="btn" style="margin-left:auto" onClick={() => setExample(!example)}>{example ? 'Скрыть пример' : 'Показать пример'}</button>
        </p>
      )}
      {mode === 'sales' ? <SalesView key={String(example)} orders={example ? sampleOrders : orders} example={example} /> : <LeadsView key={String(example)} leads={example ? sampleLeads : leads} example={example} />}
    </div>
  );
}
