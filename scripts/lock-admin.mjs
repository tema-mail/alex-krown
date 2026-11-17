// Замок на весь личный кабинет: каждая страница админки (dist/v1/admin/**/*.html) шифруется целиком –
// шапка, вкладки, товары, заявки. Вместо неё отдаётся форма входа «Логин / Пароль» (вид – как вход в
// админку EV SIBIR, server/admin.py login_page). После входа браузер расшифровывает страницу у себя;
// вход помнится до закрытия вкладки (sessionStorage), с галочкой «Оставаться в системе» – и после (localStorage,
// правило владельца 17.10.2026 для всех кабинетов, образец – TEYES). «Выйти» в шапке сбрасывает оба.
// Владелец 16.10.2026: «любой ЛК закрыт по логину и паролю… не конкретный внутренний, а весь».
// Запуск – в GitHub Actions после сборки (секреты ADMIN_LOGIN, ADMIN_PASS); без них сборка падает,
// чтобы админка не ушла в публикацию открытой. Второй вход – СВЕРХ админ (SVERH_LOGIN, SVERH_PASS): страница
// под случайным ключом, его копии – под каждым входом (admin-crypto.mjs makeRing); без СВЕРХ – один вход и предупреждение.
// LOCK_DIST – другая папка сборки (для теста), по умолчанию dist.
import fs from 'node:fs';
import path from 'node:path';
import { makeRing, sealRing, secrets } from './admin-crypto.mjs';
import { openBox } from './admin-open.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = process.env.LOCK_DIST || path.join(ROOT, 'dist');
// кабинет живёт в /v1/admin; общий тест замка (admin-lock.test.mjs, одинаков во всех проектах) кладёт страницы в /admin
const DIR = fs.existsSync(path.join(BASE, 'v1', 'admin')) ? path.join(BASE, 'v1', 'admin') : path.join(BASE, 'admin');

const GATE_CSS = `.login{max-width:380px;margin:12vh auto;background:#fff;border:1px solid #d9dedc;border-radius:16px;padding:28px}
.login h1{margin:0 0 6px;font-size:22px;font-weight:600;letter-spacing:.04em}.login p{margin:0 0 20px;font-size:14px;color:#6b7472}
.login input{display:block;width:100%;height:46px;padding:0 14px;border:1px solid #d9dedc;border-radius:8px;font:inherit;margin-bottom:12px;box-sizing:border-box}
.login button{width:100%;height:46px;border:none;border-radius:8px;background:#1c201f;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.login .err{min-height:1.4em;margin:12px 0 0;color:#b3261e;font-size:13px}
.login .keep{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:14px;color:#1e1e1e;cursor:pointer}
.login .keep input{width:18px;height:18px;margin:0}`;

// Расшифровка в браузере: openBox из admin-open.mjs (пара пробуется по всем входам); скрипты страницы запускаются заново,
// потому что разметка, вставленная через innerHTML, свои <script> не выполняет
const GATE_JS = `(function(){
var K='ak_admin_auth',L='ak_admin_keep',box=JSON.parse(document.getElementById('lock-data').textContent),f=document.getElementById('lock-form'),err=f.querySelector('.err');
var openBox=${openBox.toString()};
async function open(login,pass,quiet,keep){
  try{
    var html=await openBox(box,login,pass);
  }catch(e){try{sessionStorage.removeItem(K);if(quiet)localStorage.removeItem(L)}catch(_){} if(!quiet)err.textContent='Неверный логин или пароль';return}
  var a=JSON.stringify({login:login,pass:pass});
  try{sessionStorage.setItem(K,a);if(keep)localStorage.setItem(L,a)}catch(_){}
  document.body.innerHTML=html;
  document.body.querySelectorAll('script').forEach(function(o){var s=document.createElement('script');for(var i=0;i<o.attributes.length;i++)s.setAttribute(o.attributes[i].name,o.attributes[i].value);s.textContent=o.textContent;o.replaceWith(s)});
}
f.addEventListener('submit',function(e){e.preventDefault();err.textContent='Проверяю…';open(f.login.value.trim(),f.pass.value,false,f.keep.checked)});
try{var a=JSON.parse(sessionStorage.getItem(K)||localStorage.getItem(L)||'null');if(a)open(a.login,a.pass,true,false)}catch(_){}
})();`;

const gate = (data) => `<body class="adm"><style>${GATE_CSS}</style>
<form class="login" id="lock-form" autocomplete="on"><h1>ALEX KROWN</h1><p>Личный кабинет магазина</p>
<input name="login" placeholder="Логин" autocomplete="username" required autofocus>
<input name="pass" type="password" placeholder="Пароль" autocomplete="current-password" required>
<label class="keep"><input type="checkbox" name="keep" checked> Оставаться в системе</label>
<button type="submit">Войти</button><p class="err" role="status"></p></form>
<script type="application/json" id="lock-data">${JSON.stringify(data)}</script>
<script>${GATE_JS}</script></body>`;

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const ring = makeRing(secrets());
const pages = fs.existsSync(DIR) ? walk(DIR).filter((f) => f.endsWith('.html')) : [];
if (!pages.length) throw new Error('в dist нет страниц админки – сначала сборка');
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const h = html.indexOf('</head>');
  const b0 = html.indexOf('<body');
  const b1 = html.lastIndexOf('</body>');
  if (h < 0 || b0 < 0 || b1 < 0) throw new Error(`не разобрать страницу ${file}`);
  // скрипты из <head> работают с разметкой страницы – переносим их в зашифрованную часть, в конец
  const headScripts = [];
  const head = html.slice(0, h).replace(/<script\b[\s\S]*?<\/script>/g, (m) => (headScripts.push(m), ''));
  const inner = html.slice(html.indexOf('>', b0) + 1, b1) + headScripts.join('');
  fs.writeFileSync(file, head + '</head>' + gate(sealRing(inner, ring)) + html.slice(b1 + '</body>'.length));
}
console.log(`Админка закрыта логином и паролем: ${pages.length} стр., входов: ${ring.keys.length}`);
