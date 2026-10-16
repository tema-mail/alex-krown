import { useMemo, useState } from 'preact/hooks';

/* «Продажи» и «Заявки» админки магазина «Вариант 1» – по модели заказов Тильды: номер, дата, покупатель,
   состав с размерами, сумма, доставка, способ и статус оплаты, статус заказа, источник (UTM), история.
   Заявки – обращения без оплаты (формы, «перезвоните»), этапы как на доске.
   Своего приёмника заказов у сайта пока нет (заказ уходит в WhatsApp), поэтому без данных показывается
   сразу пример с пометкой (как у эталона Elite Rose), кнопка «Скрыть пример» показывает пустой список. */

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
export interface Lead { id: string; createdAt: string; name: string; phone: string; form: string; page: string; message?: string; stage: 'новая' | 'в работе' | 'выполнена' | 'отказ'; source: string }

const PAY: PayStatus[] = ['не оплачен', 'оплачен', 'частично', 'возврат'];
const FLOW: OrderStatus[] = ['новый', 'подтверждён', 'собран', 'отправлен', 'получен', 'отменён'];
/* этапы – как на доске EV SIBIR (Новые, В работе, Выполнена, Отказ); «Записан» у EV – запись на услугу, здесь не нужен */
const STAGES: Lead['stage'][] = ['новая', 'в работе', 'выполнена', 'отказ'];
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
                <label class="f"><span>Статус заказа</span><select value={open.status} onChange={(e) => update(open, { status: (e.target as HTMLSelectElement).value as OrderStatus }, `Статус: ${(e.target as HTMLSelectElement).value}`)}>{FLOW.map((s) => <option selected={s === open.status}>{s}</option>)}</select></label>
                <label class="f"><span>Оплата</span><select value={open.payment.status} onChange={(e) => update(open, { payment: { ...open.payment, status: (e.target as HTMLSelectElement).value as PayStatus } }, `Оплата: ${(e.target as HTMLSelectElement).value}`)}>{PAY.map((s) => <option selected={s === open.payment.status}>{s}</option>)}</select></label>
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

/* Заявки – как доска EV SIBIR (server/admin.py: board_page, list_page, export_csv, DND_JS): этап меняется
   перетаскиванием карточки в колонку, вид «Доска / Списком», выгрузка CSV (UTF-8 с BOM, «;») */
const STAGE_TITLE: Record<Lead['stage'], string> = { 'новая': 'Новые', 'в работе': 'В работе', 'выполнена': 'Выполнена', 'отказ': 'Отказ' };
const leadsCsv = (rows: Lead[]) => {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['номер', 'дата', 'имя', 'телефон', 'форма', 'страница', 'этап', 'источник', 'сообщение'];
  const body = rows.map((l) => [l.id, dt(l.createdAt), l.name, l.phone, l.form, l.page, STAGE_TITLE[l.stage], l.source, l.message ?? ''].map(q).join(';'));
  return 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + [head.join(';'), ...body].join('\r\n'));
};

function LeadsView({ leads, example }: { leads: Lead[]; example: boolean }) {
  const [list, setList] = useState(leads);
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const shown = list.filter((l) => (!src || l.source === src) && (!needle || [l.id, l.name, l.phone].join(' ').toLowerCase().includes(needle)));
  const sources = [...new Set(list.map((l) => l.source))];
  const drop = (stg: Lead['stage']) => { if (drag) setList(list.map((x) => (x.id === drag ? { ...x, stage: stg } : x))); setDrag(null); setOver(null); };
  return (
    <>
      <div class="tools">
        <h1>Заявки {example && <span class="chip">пример</span>}</h1>
        <span class="seg">
          <button class={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Доска</button>
          <button class={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Списком</button>
        </span>
        <input type="search" placeholder="Номер, имя, телефон" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select value={src} onChange={(e) => setSrc((e.target as HTMLSelectElement).value)}><option value="">Все источники</option>{sources.map((s) => <option>{s}</option>)}</select>
        <a class="btn" href={leadsCsv(shown)} download="leads.csv">⇩ CSV</a>
      </div>
      {view === 'board' ? (
        <div class="kb">
          {STAGES.map((stg) => (
            <section class={`kb__col${over === stg ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(stg); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(stg); }}>
              <h2>{STAGE_TITLE[stg]} <span>{shown.filter((l) => l.stage === stg).length}</span></h2>
              {shown.filter((l) => l.stage === stg).map((l) => (
                <article class={`kb__card${drag === l.id ? ' is-drag' : ''}`} draggable onDragStart={(e) => { e.dataTransfer?.setData('text/plain', l.id); setDrag(l.id); }} onDragEnd={() => setDrag(null)}>
                  <p class="kb__top"><b>№ {l.id}</b><span class="chip">{l.form}</span></p>
                  <p class="kb__who">{l.name} · {l.phone}</p>
                  {l.message && <p>{l.message}</p>}
                  <p class="kb__meta"><span>{dt(l.createdAt)}</span><span class="muted">{l.source}</span></p>
                </article>
              ))}
              {shown.filter((l) => l.stage === stg).length === 0 && <p class="muted" style="font-size:12.5px;text-align:center;padding:16px 0">Пусто</p>}
            </section>
          ))}
        </div>
      ) : (
        <div class="tw">
          <table class="vt" style="width:100%">
            <thead><tr><th>Когда</th><th>Имя</th><th>Телефон</th><th>Источник</th><th>Этап</th></tr></thead>
            <tbody>
              {shown.map((l) => <tr><td>{dt(l.createdAt)}</td><td>{l.name}</td><td>{l.phone}</td><td class="muted">{l.source}</td><td><span class="chip">{STAGE_TITLE[l.stage]}</span></td></tr>)}
              {!shown.length && <tr><td colSpan={5} class="muted" style="text-align:center;padding:20px">Заявок пока нет</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Orders({ mode, orders, leads, sampleOrders, sampleLeads }: { mode: 'sales' | 'leads'; orders: Order[]; leads: Lead[]; sampleOrders: Order[]; sampleLeads: Lead[] }) {
  const empty = mode === 'sales' ? !orders.length : !leads.length;
  // как у эталона Elite Rose: пока своих данных нет – сразу пример с пометкой
  const [example, setExample] = useState(empty);
  return (
    <div>
      {empty && (
        <p class="demo-note">
          {mode === 'sales'
            ? (example ? 'Пример. ' : '') + 'Своего приёмника заказов у сайта пока нет: заказ с сайта уходит менеджеру в WhatsApp, прежние заказы – в кабинете Тильды. Сюда заказы начнут падать, когда подключим приём.'
            : (example ? 'Пример доски. ' : '') + 'Сейчас заказы с сайта уходят сообщением в WhatsApp – сюда заявки начнут падать, когда подключим приёмник заявок.'}
          <button class="btn" style="margin-left:auto" onClick={() => setExample(!example)}>{example ? 'Скрыть пример' : 'Показать пример'}</button>
        </p>
      )}
      {mode === 'sales' ? <SalesView key={String(example)} orders={example ? sampleOrders : orders} example={example} /> : <LeadsView key={String(example)} leads={example ? sampleLeads : leads} example={example} />}
    </div>
  );
}
