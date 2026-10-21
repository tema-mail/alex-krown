import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DataError, getShop, pointsWord, PROGRAM, resetCabinet, v1url as v1 } from '../loyalty';
import { fmt } from '../store';
import type { Account, ShopApi } from '../../vendor/shop-engine/shop-engine.js';

// Личный кабинет покупателя ALEX KROWN (docs/ПЛАН-ЛК.md, решение 5) – перенос milovini-samara/src/islands/LkHome.tsx:
// оболочка (вкладки, плашка «демо», вход), вход по коду и главная – баланс, статус с прогрессом, последние заказы.
// Страницы /v1/lk/* – только в браузере (client:only): данных кабинета в HTML нет. Путь А – демо, сервера нет.

export type LkTab = 'home' | 'points' | 'orders' | 'profile';
const TABS: [LkTab, string, string][] = [
  ['home', 'lk', 'Кабинет'],
  ['points', 'lk/bally', 'Баллы'],
  ['orders', 'lk/zakazy', 'Заказы'],
  ['profile', 'lk/profil', 'Профиль'],
];

/** Значок баллов – корона, знак бренда. Цвет – currentColor. */
export const IconCrown = ({ size = 18 }: { size?: number }) => (
  <svg class="crown" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2.5 7.5 7.5 12 12 4l4.5 8 5-4.5L19.5 18h-15z" />
    <rect x="4.5" y="19.3" width="15" height="1.9" rx=".4" />
  </svg>
);

export const pts = (n: number) => `${n.toLocaleString('ru-RU')} ${pointsWord(n)}`;
export const dateRu = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function Demo() {
  return (
    <p class="lk-demo">
      <b>Демо-кабинет.</b> Данные хранятся только в этом браузере, письмо с кодом не отправляется – код покажем на экране.
      Кнопки «прошли сутки» перематывают время кабинета вперёд – даты сдвигаются.
    </p>
  );
}

/** Вход: почта → код (в демо – на экране) → кабинет. */
function Login({ shop }: { shop: ShopApi }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), [sent]);

  const run = (fn: (form: HTMLFormElement) => Promise<void>) => async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    setBusy(true);
    setError('');
    try {
      await fn(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  };
  const field = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();

  return (
    <div class="lk-login">
      <span class="lk-login__icon"><IconCrown size={40} /></span>
      <h2 class="lk-h2">Вход в кабинет</h2>
      <p class="lk-muted">
        Копите баллы с каждой покупки: 1 балл = 1 ₽ на следующий заказ. За регистрацию – {PROGRAM.signupBonus} баллов.
      </p>
      {error && <p class="field__err" role="alert">{error}</p>}
      {sent === null ? (
        <form class="lk-form" onSubmit={run(async () => {
          const r = await shop.requestCode(email);
          setDemoCode(r.demoCode ?? '');
          setSent(email);
        })}>
          <label class="field">Почта
            <input ref={first} type="email" autoComplete="email" required maxLength={254} value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></label>
          <button type="submit" class="btn btn--solid" disabled={busy}>Получить код</button>
        </form>
      ) : (
        <form class="lk-form" onSubmit={run(async (form) => {
          await shop.verify(sent, field(form, 'code'));
        })}>
          {demoCode && <p class="lk-code">Демо: письмо не отправляется. Код для входа – <b>{demoCode}</b></p>}
          <label class="field">Код из письма для {sent}
            <input ref={first} name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={8} /></label>
          <button type="submit" class="btn btn--solid" disabled={busy}>Войти</button>
          <button type="button" class="lk-link" onClick={() => { setSent(null); setDemoCode(''); }}>Другая почта</button>
        </form>
      )}
    </div>
  );
}

/** Оболочка страниц кабинета: движок, вход, вкладки, плашка «демо». */
export function LkShell({ active, children }: { active: LkTab; children: (a: Account, shop: ShopApi) => ComponentChildren }) {
  const [shop, setShop] = useState<ShopApi | null>(null);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [canReset, setCanReset] = useState(false);
  const off = useRef<(() => void) | null>(null);

  const open = () => {
    setError('');
    off.current?.();
    getShop()
      .then(async (s) => {
        setShop(s);
        const load = () => s.account().then(setAccount).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Кабинет не ответил'));
        await load();
        off.current = s.subscribe(() => void load());
      })
      .catch((e: unknown) => {
        setCanReset(e instanceof DataError);
        setError(e instanceof Error ? e.message : 'Кабинет не открылся');
      });
  };
  useEffect(() => {
    open();
    return () => off.current?.();
  }, []);

  if (error) {
    return (
      <div class="lk-login">
        <p class="field__err" role="alert">{error}</p>
        <button type="button" class="btn" onClick={open}>Повторить</button>
        {canReset && <button type="button" class="lk-link" onClick={() => { resetCabinet(); location.reload(); }}>Сбросить данные кабинета в этом браузере</button>}
      </div>
    );
  }
  if (!shop || account === undefined) return <p class="lk-muted">Открываем кабинет…</p>;
  if (account === null) return (<div class="lk"><Login shop={shop} /><Demo /></div>);
  return (
    <div class="lk">
      <nav class="lk-nav" aria-label="Разделы кабинета">
        {TABS.map(([id, path, label]) => (
          <a href={v1(path)} class={`chip${id === active ? ' is-on' : ''}`} aria-current={id === active ? 'page' : undefined}>{label}</a>
        ))}
        <button type="button" class="lk-nav__out" onClick={() => void shop.logout()}>Выйти</button>
      </nav>
      {children(account, shop)}
      <Demo />
      <button type="button" class="lk-link lk-reset" onClick={() => {
        if (confirm('Стереть баллы, заказы и профиль демо-кабинета в этом браузере? Корзина и избранное останутся.')) { resetCabinet(); location.reload(); }
      }}>Сбросить демо-кабинет</button>
    </div>
  );
}

/** Статус: текущий уровень, полоса до следующего, все уровни. */
export function Tier({ a }: { a: Account }) {
  const cur = a.levels.find((l) => l.title === a.level.title) ?? a.levels[0]!;
  const next = a.next ? a.levels.find((l) => l.title === a.next!.title) : null;
  const progress = next ? Math.min(100, Math.max(0, ((a.spentRub - cur.fromRub) / (next.fromRub - cur.fromRub)) * 100)) : 100;
  return (
    <section class="lk-card lk-tier">
      <p class="label">Ваш статус</p>
      <p class="lk-tier__now"><b>{a.level.title}</b> · {a.level.percent}% баллами с каждого заказа</p>
      <div class="lk-bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
      <p class="lk-muted">{a.next ? <>До {a.next.title} ({a.next.percent}%) осталось {fmt(a.next.leftRub)} покупок</> : 'Самый высокий статус – спасибо, что вы с нами'}</p>
      <ol class="lk-levels">
        {a.levels.map((l) => (
          <li class={l.title === a.level.title ? 'is-on' : ''}><b>{l.title}</b><span>{l.percent}%</span><small>{l.fromRub ? `от ${fmt(l.fromRub)}` : 'с первого заказа'}</small></li>
        ))}
      </ol>
    </section>
  );
}

export default function LkHome() {
  return (
    <LkShell active="home">
      {(a) => (
        <div class="lk-grid">
          <section class="lk-card lk-hero">
            <p class="label">{a.profile.name ? `Здравствуйте, ${a.profile.name}` : a.profile.email}</p>
            <p class="lk-bal"><IconCrown size={34} /><b>{a.balance.available.toLocaleString('ru-RU')}</b><span>{pointsWord(a.balance.available)}</span></p>
            <p class="lk-hero__sub">1 балл = 1 ₽ · можно оплатить до {PROGRAM.maxRedeemPercent}% заказа</p>
            {(a.balance.pending > 0 || a.balance.held > 0) && (
              <ul class="lk-hero__more">
                {a.balance.pending > 0 && <li>ждут доставки: <b>{pts(a.balance.pending)}</b></li>}
                {a.balance.held > 0 && <li>отложены на заказ: <b>{pts(a.balance.held)}</b></li>}
              </ul>
            )}
            <a class="btn btn--solid" href={v1('catalog')}>В каталог</a>
          </section>
          <Tier a={a} />
          <section class="lk-card lk-last">
            <div class="lk-card__head"><h2 class="lk-h3">Последние заказы</h2><a href={v1('lk/zakazy')}>Все заказы</a></div>
            {a.orders.length === 0 ? (
              <p class="lk-muted">Заказов пока нет. Оформите первый – баллы начислим после доставки.</p>
            ) : (
              <ul class="lk-mini">
                {a.orders.slice(0, 3).map((o) => (
                  <li><span>№ {o.externalNum ?? o.id} · {dateRu(o.placedAt)}</span><b>{fmt(o.totalRub)}</b><em class={`lk-st lk-st--${o.status}`}>{o.statusTitle}</em></li>
                ))}
              </ul>
            )}
          </section>
          <section class="lk-card lk-how">
            <h2 class="lk-h3">Как копить и тратить</h2>
            <ul>
              <li>Баллы начисляются с суммы, оплаченной деньгами, – через сутки после доставки.</li>
              <li>Баллами можно оплатить до {PROGRAM.maxRedeemPercent}% следующего заказа.</li>
              <li>Чем больше покупок, тем выше статус и процент.</li>
            </ul>
            <a href={v1('bonusnaya-programma')}>Правила бонусной программы</a>
          </section>
        </div>
      )}
    </LkShell>
  );
}
