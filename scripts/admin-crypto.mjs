// Общее для замка админки (lock-admin.mjs) и шифрования данных аналитики (seal-admin.mjs).
// Ключ – из логина и пароля владельца: PBKDF2-SHA256 → AES-256-GCM; браузер расшифровывает тем же
// способом (замок – в lock-admin.mjs, данные – src/v1/admin/Vault.astro). Секрет – строка «логин\nпароль».
// Логин и пароль: переменные ADMIN_LOGIN / ADMIN_PASS (секреты GitHub Actions) или файлы
// ~/.config/alex-krown/admin-login и admin-pass (600) на маке владельца.
// Второй вход – СВЕРХ админ Артёма (один на все наши админки): SVERH_LOGIN / SVERH_PASS (секреты Actions) или
// ~/.config/sverh-admin/dostup.txt (строки «логин: …», «пароль: …»). Нет его – замок на одном входе владельца.
// Несколько входов: makeRing() – случайный ключ + его копии под ключом каждого входа, sealRing() – коробка v3,
// открывает её scripts/admin-open.mjs. Схема – ~/Sites/sverh-admin/docs/zamok-dva-vhoda.md.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ITER = 310000;
const DIR = path.join(os.homedir(), '.config', 'alex-krown');

export function credentials() {
  const file = (n) => {
    const f = path.join(DIR, n);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
  };
  const login = (process.env.ADMIN_LOGIN || file('admin-login')).trim();
  const pass = (process.env.ADMIN_PASS || file('admin-pass')).trim();
  if (!login || pass.length < 12) throw new Error('нет логина или пароль короче 12 знаков (ADMIN_LOGIN / ADMIN_PASS или ~/.config/alex-krown/admin-login, admin-pass)');
  return { login, pass };
}

// СВЕРХ админ: пара или null (без него сборка идёт как раньше, с предупреждением)
export function sverhCredentials() {
  let login = (process.env.SVERH_LOGIN || '').trim();
  let pass = (process.env.SVERH_PASS || '').trim();
  const f = path.join(os.homedir(), '.config', 'sverh-admin', 'dostup.txt');
  if ((!login || !pass) && fs.existsSync(f)) {
    const t = fs.readFileSync(f, 'utf8');
    const line = (k) => ((t.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm')) || [])[1] || '').trim();
    login = line('логин');
    pass = line('пароль');
  }
  if (!login || pass.length < 12) {
    console.warn('ПРЕДУПРЕЖДЕНИЕ: нет входа СВЕРХ админа (SVERH_LOGIN / SVERH_PASS или ~/.config/sverh-admin/dostup.txt) – админка закрыта одним входом владельца');
    return null;
  }
  return { login, pass };
}

export const secretOf = ({ login, pass }) => `${login}\n${pass}`;

// Ключи всех входов: владелец первым (его вход проверяется первым и не медленнее прежнего), СВЕРХ – рядом
export function secrets() {
  const list = [secretOf(credentials())];
  const sverh = sverhCredentials();
  if (sverh && !list.includes(secretOf(sverh))) list.push(secretOf(sverh));
  return list;
}

const b64 = (x) => x.toString('base64');
const gcm = (key, iv, buf) => {
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([c.update(buf), c.final(), c.getAuthTag()]); // WebCrypto ждёт тег в конце
};

// Связка ключей: случайный ключ данных + его копия под ключом каждого входа (PBKDF2 считается один раз на сборку)
export function makeRing(list) {
  if (!list.length) throw new Error('нет ни одного входа');
  const key = crypto.randomBytes(32);
  const keys = list.map((secret) => {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    return { salt: b64(salt), iv: b64(iv), key: b64(gcm(crypto.pbkdf2Sync(secret, salt, ITER, 32, 'sha256'), iv, key)) };
  });
  return { key, keys };
}

// Коробка v3: данные под ключом связки (свой iv на каждую коробку), копии ключа – для каждого входа
export function sealRing(text, ring) {
  const iv = crypto.randomBytes(12);
  return { v: 3, iter: ITER, iv: b64(iv), data: b64(gcm(ring.key, iv, Buffer.from(text, 'utf8'))), keys: ring.keys, sealedAt: new Date().toISOString() };
}

export function seal(text, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(secret, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final(), c.getAuthTag()]); // WebCrypto ждёт тег в конце
  const b = (x) => x.toString('base64');
  return { v: 2, iter: ITER, salt: b(salt), iv: b(iv), data: b(data), sealedAt: new Date().toISOString() };
}
