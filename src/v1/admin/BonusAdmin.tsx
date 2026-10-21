import { useEffect, useState } from 'preact/hooks';
import GhConnect from './GhConnect';
import { buildOf, commit, getToken, humanError, readJson } from './gh';

/* Админка → «Бонусы»: правила программы лояльности (src/data/v1/loyalty.json) – поля и подписи как на экране настроек
   демо-стенда shop-modules (apps/demo/src/components/Settings.tsx: «Статусы», «Бонусы», «Заказы»). Проверки – те же,
   что делает движок (modules/tiers/rules.ts checkTiersConfig, apps/demo/src/engine/shop.ts checkShopSettings): неверное
   значение не сохраняется, иначе кабинет у покупателей не откроется. Сохранение – коммитом, как у товаров. */

export interface Level { id: string; title: string; fromRub: number; percent: number }
export interface Program { signupBonus: number; maxRedeemPercent: number; levels: Level[]; paymentDays: number; returnDays: number }
type Status = { kind: 'idle' | 'saving' | 'building' | 'done' | 'error'; text: string; url?: string; sha?: string };

const PATH = 'src/data/v1/loyalty.json';
const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.').replace(/\s/g, '')));
const pctOk = (x: number) => Number.isFinite(x) && x >= 0 && x <= 100;

/** то же, что проверяет движок, – словами для владельца */
export function problems(p: Program): string[] {
  const out: string[] = [];
  if (!pctOk(p.maxRedeemPercent)) out.push('Доля оплаты баллами – от 0 до 100%');
  if (!Number.isInteger(p.signupBonus) || p.signupBonus < 0) out.push('Баллы за регистрацию – целое число от 0');
  if (!p.levels.length) out.push('Нужен хотя бы один статус');
  if (p.levels[0] && p.levels[0].fromRub !== 0) out.push('Первый статус должен начинаться с 0 ₽');
  p.levels.forEach((l, i) => {
    if (!l.title.trim()) out.push(`Статус ${i + 1}: нет названия`);
    if (!pctOk(l.percent)) out.push(`«${l.title || i + 1}»: процент вне 0–100%`);
    if (!Number.isFinite(l.fromRub) || l.fromRub < 0) out.push(`«${l.title || i + 1}»: неверный порог`);
    const prev = p.levels[i - 1];
    if (prev && !(l.fromRub > prev.fromRub)) out.push(`«${l.title || i + 1}»: порог должен быть больше, чем у «${prev.title}»`);
  });
  if (!Number.isInteger(p.paymentDays) || p.paymentDays < 1 || p.paymentDays > 7) out.push('Срок оплаты – от 1 до 7 дней');
  if (!Number.isInteger(p.returnDays) || p.returnDays < 0 || p.returnDays > 365) out.push('Баллы после доставки – через 0–365 дней');
  return out;
}

export default function BonusAdmin({ initial }: { initial: Program }) {
  const [p, setP] = useState<Program>(initial);
  const [saved, setSaved] = useState<Program>(initial);
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });

  /* с ключом – свежие правила прямо из репозитория: собранный сайт отстаёт на время сборки */
  const reload = async () => {
    const fresh = await readJson<Program>(PATH);
    setP(fresh);
    setSaved(fresh);
  };
  useEffect(() => {
    if (getToken()) {
      setConnected(true);
      reload().catch(() => setStatus({ kind: 'error', text: 'Не удалось загрузить правила из GitHub – проверьте ключ' }));
    }
  }, []);

  /* следим за сборкой, которую запустил наш коммит (как во вкладке «Товары») */
  useEffect(() => {
    if (status.kind !== 'building' || !status.sha) return;
    const sha = status.sha;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const b = await buildOf(sha);
        if (b && b.status === 'completed') {
          setStatus(b.conclusion === 'success' ? { kind: 'done', text: 'Сайт обновлён – новые правила уже в кабинете и на сайте', url: b.url } : { kind: 'error', text: 'Сборка сайта упала – откройте журнал', url: b.url });
          return;
        }
        if (b) setStatus((s) => ({ ...s, url: b.url }));
      } catch {
        /* сеть моргнула – следующая попытка */
      }
      setTimeout(tick, 8000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [status.kind, status.sha]);

  const errs = problems(p);
  const changed = JSON.stringify(p) !== JSON.stringify(saved);
  const setLevel = (i: number, patch: Partial<Level>) => setP({ ...p, levels: p.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const save = async () => {
    if (errs.length) return;
    if (!connected) return setStatus({ kind: 'error', text: 'Подключите сохранение, чтобы правила попали на сайт' });
    setStatus({ kind: 'saving', text: 'Сохраняем…' });
    try {
      const sha = await commit([{ path: PATH, text: JSON.stringify(p, null, 2) + '\n' }], `Админка: правила бонусной программы – баллами до ${p.maxRedeemPercent}%, статусы ${p.levels.map((l) => `${l.title} ${l.percent}%`).join(' / ')}`);
      setSaved(p);
      setStatus({ kind: 'building', text: 'Сохранено. Сайт обновляется – обычно 1–2 минуты', sha });
    } catch (e: any) {
      setStatus({ kind: 'error', text: `Не сохранилось: ${humanError(e)}` });
    }
  };

  return (
    <div>
      <div class={`sync sync--${connected ? 'on' : 'off'}`}>
        <span class="sync__dot" />
        <span>{connected ? 'Сохранение подключено – изменения попадают на сайт' : 'Режим просмотра: изменения не сохраняются.'}</span>
        {status.kind !== 'idle' && <span class={`sync__st sync__st--${status.kind}`}>{status.text}{status.url && <> · <a href={status.url} target="_blank" rel="noopener">журнал сборки</a></>}</span>}
        <button class={connected ? 'btn ghost' : 'btn primary'} onClick={() => setShowConnect(true)}>{connected ? 'Ключ' : 'Подключить сохранение'}</button>
      </div>

      <div class="tools">
        <h1>Бонусная программа</h1>
        <button class="btn" disabled={!changed} onClick={() => setP(saved)}>Отменить изменения</button>
        <button class="btn primary" disabled={!changed || errs.length > 0 || status.kind === 'saving'} onClick={save}>Сохранить</button>
      </div>
      <p class="demo-note">Кабинет покупателя сейчас демо: баллы хранятся в браузере покупателя. Новые правила действуют на новые заказы; уже оформленные считаются по правилам на момент заказа.</p>
      {errs.length > 0 && <div class="demo-note" role="alert" style="border-color:#e6b4b4;background:#fdf2f2;color:#8c1c2c;display:block">{errs.map((x) => <div>{x}</div>)}</div>}

      <div class="panel">
        <h2>Бонусы</h2>
        <div class="fgrid">
          <label class="f"><span>Сколько процентов заказа можно оплатить баллами</span><input inputMode="decimal" value={String(p.maxRedeemPercent)} onInput={(e) => setP({ ...p, maxRedeemPercent: num((e.target as HTMLInputElement).value) })} /></label>
          <label class="f"><span>Баллы за регистрацию</span><input inputMode="numeric" value={String(p.signupBonus)} onInput={(e) => setP({ ...p, signupBonus: num((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <p class="muted" style="margin:10px 0 0">1 балл = 1 ₽. Покупатель сам вводит, сколько баллов списать, но не больше этой доли суммы заказа и не больше своего баланса.</p>
      </div>

      <div class="panel">
        <h2>Статусы</h2>
        <p class="muted" style="margin:-4px 0 12px">Процент баллов с каждого заказа растёт с суммой покупок за всё время. Первый статус – с первого заказа (порог 0 ₽).</p>
        <table class="vt" style="width:100%">
          <thead><tr><th>Название</th><th>Порог покупок, ₽</th><th>Баллы с заказа, %</th><th></th></tr></thead>
          <tbody>
            {p.levels.map((l, i) => (
              <tr>
                <td><input aria-label="Название" value={l.title} onInput={(e) => setLevel(i, { title: (e.target as HTMLInputElement).value })} /></td>
                <td><input aria-label="Порог, ₽" inputMode="numeric" value={String(l.fromRub)} disabled={i === 0} onInput={(e) => setLevel(i, { fromRub: num((e.target as HTMLInputElement).value) })} /></td>
                <td><input aria-label="Процент" inputMode="decimal" value={String(l.percent)} onInput={(e) => setLevel(i, { percent: num((e.target as HTMLInputElement).value) })} /></td>
                <td>{i > 0 && <button class="btn ghost" title="Убрать статус" onClick={() => setP({ ...p, levels: p.levels.filter((_, j) => j !== i) })}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button class="btn" style="margin-top:10px" onClick={() => {
          const last = p.levels[p.levels.length - 1]!;
          setP({ ...p, levels: [...p.levels, { id: `level-${Date.now().toString(36)}`, title: 'Новый статус', fromRub: last.fromRub + 50_000, percent: last.percent + 1 }] });
        }}>+ Добавить статус</button>
      </div>

      <div class="panel">
        <h2>Заказы</h2>
        <div class="fgrid">
          <label class="f"><span>Сколько ждать оплату, дней <em>заказ без оплаты потом отменится, баллы вернутся</em></span><input inputMode="numeric" value={String(p.paymentDays)} onInput={(e) => setP({ ...p, paymentDays: num((e.target as HTMLInputElement).value) })} /></label>
          <label class="f"><span>Баллы за заказ – через сколько дней после доставки</span><input inputMode="numeric" value={String(p.returnDays)} onInput={(e) => setP({ ...p, returnDays: num((e.target as HTMLInputElement).value) })} /></label>
        </div>
      </div>

      {showConnect && <GhConnect onClose={() => setShowConnect(false)} onConnected={(ok) => { setConnected(ok); setShowConnect(false); if (ok) reload(); }} />}
    </div>
  );
}
