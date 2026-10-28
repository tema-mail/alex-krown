import { useState } from 'preact/hooks';
import { fmt } from '../store';
import { API_MODE, pointsWord, PROGRAM } from '../loyalty';
import type { Account, OrderView, ShopApi } from '../../vendor/shop-engine/shop-engine.js';
import { IconCrown, LkShell, Tier, dateRu, pts } from './LkHome';

// Кабинет: «Мои баллы» (баланс и история) и «Мои заказы» (docs/ПЛАН-ЛК.md, решение 5) – перенос
// milovini-samara/src/islands/LkOrders.tsx. Демо-кнопки делают то, что в бою делает магазин: подтверждает оплату,
// отмечает доставку; «прошли сутки» – перемотка времени кабинета. Только в демо: на сервере это делает админка магазина.

function PointsView({ a }: { a: Account }) {
  const num = new Map(a.orders.map((o) => [o.id, o.externalNum ?? o.id]));
  return (
    <div class="lk-grid">
      <section class="lk-card lk-hero">
        <p class="label">Можно потратить</p>
        <p class="lk-bal"><IconCrown size={34} /><b>{a.balance.available.toLocaleString('ru-RU')}</b><span>{pointsWord(a.balance.available)}</span></p>
        <ul class="lk-hero__more">
          <li>ждут доставки: <b>{pts(a.balance.pending)}</b></li>
          <li>отложены на неоплаченные заказы: <b>{pts(a.balance.held)}</b></li>
        </ul>
      </section>
      <Tier a={a} />
      <section class="lk-card lk-wide">
        <h2 class="lk-h3">История</h2>
        {a.history.length === 0 ? (
          <p class="lk-muted">Пока пусто.</p>
        ) : (
          <ul class="lk-hist">
            {a.history.map((h) => (
              <li>
                <span class="lk-hist__when">{dateRu(h.at)}</span>
                <span class="lk-hist__what">{h.text}{h.orderId ? ` · заказ № ${num.get(h.orderId) ?? h.orderId}` : ''}</span>
                <b class={`lk-hist__pts${h.points > 0 ? ' is-plus' : h.points < 0 ? ' is-minus' : ''}`}>
                  {h.points > 0 ? `+${h.points.toLocaleString('ru-RU')}` : h.points < 0 ? `−${(-h.points).toLocaleString('ru-RU')}` : '–'}
                </b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderCard({ o, shop }: { o: OrderView; shop: ShopApi }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const act = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  const demo = API_MODE ? undefined : shop.demo;
  return (
    <article class="lk-card lk-order">
      <div class="lk-card__head">
        <h2 class="lk-h3">№ {o.externalNum ?? o.id}</h2>
        <em class={`lk-st lk-st--${o.status}`}>{o.statusTitle}</em>
      </div>
      <p class="lk-muted">{dateRu(o.placedAt)}</p>
      <ul class="lk-lines">
        {o.lines.map((l) => <li><span>{l.title} × {l.qty}</span><b>{fmt(l.amountRub)}</b></li>)}
      </ul>
      <dl class="lk-order__sum">
        {o.pointsSpent > 0 && <div><dt>Баллами</dt><dd>−{pts(o.pointsSpent)}</dd></div>}
        <div><dt>Товары к оплате</dt><dd>{fmt(o.totalRub)}</dd></div>
        {o.pointsEarn > 0 && <div><dt>Баллы за заказ</dt><dd>+{pts(o.pointsEarn)}{o.status === 'settled' ? '' : ' – после доставки'}</dd></div>}
      </dl>
      {error && <p class="field__err" role="alert">{error}</p>}
      <div class="lk-order__btns">
        {o.canCancel && <button type="button" class="btn" disabled={busy} onClick={act(() => shop.cancelOrder(o.id))}>Отменить заказ</button>}
        {demo && o.demo.canMarkPaid && <button type="button" class="btn btn--demo" disabled={busy} onClick={act(() => demo.markPaid(o.id))}>Демо: магазин подтвердил оплату</button>}
        {demo && o.demo.canMarkDelivered && <button type="button" class="btn btn--demo" disabled={busy} onClick={act(() => demo.markDelivered(o.id))}>Демо: заказ доставлен</button>}
        {demo && o.demo.canPassDay && <button type="button" class="btn btn--demo" disabled={busy} onClick={act(() => demo.passDays(1))}>Демо: прошли сутки</button>}
      </div>
    </article>
  );
}

export function LkPoints() {
  return <LkShell active="points">{(a) => <PointsView a={a} />}</LkShell>;
}

export function LkOrders() {
  return (
    <LkShell active="orders">
      {(a, shop) =>
        a.orders.length === 0 ? (
          <section class="lk-card"><p class="lk-muted">Заказов пока нет. Оформите первый – баллы начислим через {PROGRAM.returnDays === 1 ? 'сутки' : `${PROGRAM.returnDays} дн.`} после доставки.</p></section>
        ) : (
          <div class="lk-grid">{a.orders.map((o) => <OrderCard key={o.id} o={o} shop={shop} />)}</div>
        )
      }
    </LkShell>
  );
}
