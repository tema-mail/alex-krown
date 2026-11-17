// Замок админки на несколько входов: владелец и СВЕРХ админ открывают, неверная пара – нет, без СВЕРХ – как раньше.
// Запуск: npm test (node --test). Пары здесь выдуманные, настоящие не читаются (HOME подменён).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { makeRing, seal, sealRing } from './admin-crypto.mjs';
import { openBox } from './admin-open.mjs';

const OWNER = { login: 'owner-test', pass: 'owner-test-pass-0001' };
const SVERH = { login: 'sverh-test', pass: 'sverh-test-pass-0002' };
const sec = (p) => `${p.login}\n${p.pass}`;
const LOCK = path.join(path.dirname(new URL(import.meta.url).pathname), 'lock-admin.mjs');

test('коробка v3: обе пары открывают, неверная – нет', async () => {
  const box = sealRing('<p>кабинет</p>', makeRing([sec(OWNER), sec(SVERH)]));
  assert.equal(box.keys.length, 2);
  assert.equal(await openBox(box, OWNER.login, OWNER.pass), '<p>кабинет</p>');
  assert.equal(await openBox(box, SVERH.login, SVERH.pass), '<p>кабинет</p>');
  await assert.rejects(openBox(box, OWNER.login, SVERH.pass));
  await assert.rejects(openBox(box, 'кто-то', 'чужой-пароль-123'));
});

test('старая коробка v2 (один вход) открывается тем же кодом', async () => {
  const box = seal('старые данные', sec(OWNER));
  assert.equal(await openBox(box, OWNER.login, OWNER.pass), 'старые данные');
  await assert.rejects(openBox(box, SVERH.login, SVERH.pass));
});

function lockFixture(env) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zamok-'));
  fs.mkdirSync(path.join(home, 'dist', 'admin', 'orders'), { recursive: true });
  const page = '<html><head><title>a</title><script>window.x=1</script></head><body><h1>Заявки</h1></body></html>';
  fs.writeFileSync(path.join(home, 'dist', 'admin', 'index.html'), page);
  fs.writeFileSync(path.join(home, 'dist', 'admin', 'orders', 'index.html'), page);
  const out = execFileSync(process.execPath, [LOCK], {
    env: { PATH: process.env.PATH, HOME: home, LOCK_DIST: path.join(home, 'dist'), ADMIN_LOGIN: OWNER.login, ADMIN_PASS: OWNER.pass, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const html = fs.readFileSync(path.join(home, 'dist', 'admin', 'orders', 'index.html'), 'utf8');
  fs.rmSync(home, { recursive: true, force: true });
  const box = JSON.parse(html.match(/<script type="application\/json" id="lock-data">([\s\S]*?)<\/script>/)[1]);
  return { out, html, box };
}

test('lock-admin с СВЕРХ: страница закрыта, открывают владелец и СВЕРХ', async () => {
  const { out, html, box } = lockFixture({ SVERH_LOGIN: SVERH.login, SVERH_PASS: SVERH.pass });
  assert.match(out, /входов: 2/);
  assert.doesNotMatch(html, /<h1>Заявки/);
  assert.match(html, /var openBox=async function openBox/);
  assert.match(await openBox(box, OWNER.login, OWNER.pass), /<h1>Заявки<\/h1><script>window\.x=1<\/script>/);
  assert.match(await openBox(box, SVERH.login, SVERH.pass), /<h1>Заявки/);
  await assert.rejects(openBox(box, SVERH.login, 'неверный-пароль-12'));
});

test('lock-admin без СВЕРХ: один вход владельца, сборка не падает', async () => {
  const { out, box } = lockFixture({});
  assert.match(out, /входов: 1/);
  assert.equal(box.keys.length, 1);
  assert.match(await openBox(box, OWNER.login, OWNER.pass), /<h1>Заявки/);
  await assert.rejects(openBox(box, SVERH.login, SVERH.pass));
});

test('без пары владельца lock-admin падает – открытая админка не уходит', () => {
  assert.throws(() => lockFixture({ ADMIN_LOGIN: '', ADMIN_PASS: '' }));
});
