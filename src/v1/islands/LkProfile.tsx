import { useState } from 'preact/hooks';
import type { Account, ShopApi } from '../../vendor/shop-engine/shop-engine.js';
import { LkShell } from './LkHome';

// Кабинет: профиль (docs/ПЛАН-ЛК.md, решение 5) – перенос milovini-samara/src/islands/LkProfile.tsx. Почта – вход,
// её не меняют; согласие на рассылку – отметка (рассылки пока нет).

/** Маска телефона +7 (XXX) XXX-XX-XX – как milovini-samara/src/lib/phone.ts (своего модуля телефона у сайта нет). */
function maskPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const p = d.slice(1);
  let out = '+7';
  if (p.length) out += ' (' + p.slice(0, 3);
  if (p.length >= 3) out += ')';
  if (p.length > 3) out += ' ' + p.slice(3, 6);
  if (p.length > 6) out += '-' + p.slice(6, 8);
  if (p.length > 8) out += '-' + p.slice(8, 10);
  return out;
}

function ProfileForm({ a, shop }: { a: Account; shop: ShopApi }) {
  const [name, setName] = useState(a.profile.name);
  const [phone, setPhone] = useState(a.profile.phone);
  const [birthday, setBirthday] = useState(a.profile.birthday);
  const [news, setNews] = useState(a.profile.newsConsent);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await shop.updateProfile({ name, phone, birthday, newsConsent: news });
      setMsg({ ok: true, text: 'Сохранено' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Не получилось сохранить' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="lk-card lk-profile" onSubmit={save}>
      <label class="field">Почта – для входа
        <input value={a.profile.email} disabled /></label>
      <label class="field">Имя
        <input autoComplete="name" maxLength={100} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <label class="field">Телефон
        <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (___) ___-__-__" value={phone} onInput={(e) => setPhone(maskPhone((e.target as HTMLInputElement).value))} /></label>
      <label class="field">Дата рождения
        <input type="date" autoComplete="bday" value={birthday} onInput={(e) => setBirthday((e.target as HTMLInputElement).value)} /></label>
      <label class="lk-check"><input type="checkbox" checked={news} onChange={(e) => setNews((e.target as HTMLInputElement).checked)} />
        <span>Присылать новости и акции на почту <small class="lk-muted">(рассылки пока нет)</small></span></label>
      {msg && <p class={msg.ok ? 'lk-ok' : 'field__err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <button type="submit" class="btn btn--solid" disabled={busy}>Сохранить</button>
    </form>
  );
}

export default function LkProfile() {
  return <LkShell active="profile">{(a, shop) => <ProfileForm a={a} shop={shop} />}</LkShell>;
}
