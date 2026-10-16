// Шифрует закрытые разделы админки (Метрика, SEO-аналитика, Точка А) паролем владельца.
// Репозиторий и показ публичные, сервера нет: сборка с выгрузкой аналитики рисует разделы целиком,
// этот скрипт вынимает их разметку из dist, шифрует (PBKDF2-SHA256 + AES-256-GCM, как расшифровывает
// src/v1/admin/Vault.astro) и кладёт в public/v1/admin/vault/<раздел>.json – его можно коммитить.
// Пароль – ~/.config/alex-krown/admin-pass (600; нет файла – создаётся). Открытые страницы из dist удаляются.
//   node scripts/seal-admin.mjs            – собрать сайт и зашифровать
//   node scripts/seal-admin.mjs --no-build – взять уже собранный dist
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NAMES = ['metrika', 'seo', 'tochka-a'];
const PASS_FILE = path.join(os.homedir(), '.config', 'alex-krown', 'admin-pass');
const ITER = 310000;
const OUT = path.join(ROOT, 'public', 'v1', 'admin', 'vault');

function password() {
  if (!fs.existsSync(PASS_FILE)) {
    fs.mkdirSync(path.dirname(PASS_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(PASS_FILE, crypto.randomBytes(15).toString('base64url') + '\n', { mode: 0o600 });
    console.log('Создан пароль админки:', PASS_FILE);
  }
  const pass = fs.readFileSync(PASS_FILE, 'utf8').trim();
  if (pass.length < 12) throw new Error(`пароль в ${PASS_FILE} короче 12 знаков`);
  return pass;
}

function seal(text, pass) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(pass, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final(), c.getAuthTag()]); // WebCrypto ждёт тег в конце
  const b = (x) => x.toString('base64');
  return { v: 1, iter: ITER, salt: b(salt), iv: b(iv), data: b(data), sealedAt: new Date().toISOString() };
}

if (!process.argv.includes('--no-build')) {
  execSync('npm run build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PUBLIC_BASE: '/alex-krown', PUBLIC_SITE_URL: 'https://tema-mail.github.io', TILDA_COPY: '0' },
  });
}

const pass = password();
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const name of NAMES) {
  const file = path.join(ROOT, 'dist', 'v1', 'admin', name, 'index.html');
  const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const m = html.match(new RegExp(`<div id="vault" data-vault="${name}"[^>]*>([\\s\\S]*)</div><div id="vault-end" hidden`));
  if (!m || !m[1].trim()) {
    console.log(`  ${name}: в сборке нет данных раздела – пропущен (нет выгрузки в src/data/v1/analytics?)`);
    failed++;
    continue;
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(seal(m[1], pass)));
  fs.rmSync(path.dirname(file), { recursive: true, force: true }); // открытые цифры не оставлять в dist
  console.log(`  ${name}: ${(m[1].length / 1024).toFixed(0)} КБ разметки → public/v1/admin/vault/${name}.json`);
}
process.exitCode = failed === NAMES.length ? 1 : 0;
