// Шифрует данные разделов Метрика, SEO-аналитика, Точка А логином и паролем владельца – теми же, что
// открывают весь кабинет (scripts/lock-admin.mjs); после входа браузер расшифровывает их сам.
// Репозиторий и показ публичные, сервера нет: сборка с выгрузкой аналитики рисует разделы целиком,
// этот скрипт вынимает их разметку из dist, шифрует (PBKDF2-SHA256 + AES-256-GCM, как расшифровывает
// src/v1/admin/Vault.astro) и кладёт в public/v1/admin/vault/<раздел>.json – его можно коммитить.
// Логин и пароль – scripts/admin-crypto.mjs (~/.config/alex-krown/admin-login, admin-pass). Открытые страницы
// разделов из dist удаляются.
//   node scripts/seal-admin.mjs            – собрать сайт и зашифровать
//   node scripts/seal-admin.mjs --no-build – взять уже собранный dist
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { credentials, secretOf, seal } from './admin-crypto.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NAMES = ['metrika', 'seo', 'tochka-a'];
const OUT = path.join(ROOT, 'public', 'v1', 'admin', 'vault');

if (!process.argv.includes('--no-build')) {
  execSync('npm run build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PUBLIC_BASE: '/alex-krown', PUBLIC_SITE_URL: 'https://tema-mail.github.io', TILDA_COPY: '0' },
  });
}

const secret = secretOf(credentials());
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
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(seal(m[1], secret)));
  fs.rmSync(path.dirname(file), { recursive: true, force: true }); // открытые цифры не оставлять в dist
  console.log(`  ${name}: ${(m[1].length / 1024).toFixed(0)} КБ разметки → public/v1/admin/vault/${name}.json`);
}
process.exitCode = failed === NAMES.length ? 1 : 0;
