// Общее для замка админки (lock-admin.mjs) и шифрования данных аналитики (seal-admin.mjs).
// Ключ – из логина и пароля владельца: PBKDF2-SHA256 → AES-256-GCM; браузер расшифровывает тем же
// способом (замок – в lock-admin.mjs, данные – src/v1/admin/Vault.astro). Секрет – строка «логин\nпароль».
// Логин и пароль: переменные ADMIN_LOGIN / ADMIN_PASS (секреты GitHub Actions) или файлы
// ~/.config/alex-krown/admin-login и admin-pass (600) на маке владельца.
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

export const secretOf = ({ login, pass }) => `${login}\n${pass}`;

export function seal(text, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(secret, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final(), c.getAuthTag()]); // WebCrypto ждёт тег в конце
  const b = (x) => x.toString('base64');
  return { v: 2, iter: ITER, salt: b(salt), iv: b(iv), data: b(data), sealedAt: new Date().toISOString() };
}
