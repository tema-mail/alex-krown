// Запуск: node --experimental-strip-types --test src/lib/attribution.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capture, classify, marksOf } from './attribution.ts';

const HOST = 'teyes-sibir.ru';
const c = (query: string, ref = '') => classify(marksOf(new URLSearchParams(query)), ref, HOST);

test('заявка со скрина: все метки Яндекс Бизнеса на месте', () => {
  const q = 'utm_referer=geoadv_search_yabs&utm_ya_campaign=114534400525&utm_source=geoadv_search_yabs&utm_candidate=61707609351&utm_content=17680979890&other=1';
  assert.deepEqual(marksOf(new URLSearchParams(q)), {
    utm_referer: 'geoadv_search_yabs', utm_ya_campaign: '114534400525', utm_source: 'geoadv_search_yabs',
    utm_candidate: '61707609351', utm_content: '17680979890',
  });
  assert.equal(c(q), 'Яндекс Бизнес (реклама)');
});

test('реклама', () => {
  assert.equal(c('yclid=123'), 'Яндекс реклама');
  assert.equal(c('utm_source=yandex&utm_medium=cpc'), 'Яндекс реклама');
  assert.equal(c('gclid=abc'), 'Google реклама');
  assert.equal(c('utm_source=google&utm_medium=cpc'), 'Google реклама');
  assert.equal(c('UTM_SOURCE=dzen'), 'Метка: dzen');
});

test('поиск и карты без меток', () => {
  assert.equal(c('', 'https://yandex.ru/search/?text=teyes'), 'Яндекс поиск');
  assert.equal(c('', 'https://ya.ru/'), 'Яндекс поиск');
  assert.equal(c('', 'https://yandex.ru/maps/65/'), 'Яндекс Карты');
  assert.equal(c('', 'https://www.google.com/'), 'Google поиск');
  assert.equal(c('', 'https://www.google.ru/'), 'Google поиск');
  assert.equal(c('utm_source=yandex&utm_medium=organic'), 'Яндекс поиск');
});

test('чужие адреса с похожим именем – не поисковик', () => {
  assert.equal(c('', 'https://notyandex.ru/'), 'Сайт: notyandex.ru');
  assert.equal(c('', 'https://google-ads.example.com/'), 'Сайт: google-ads.example.com');
});

test('прямой заход, свой сайт, соцсети', () => {
  assert.equal(c(''), 'Прямой заход');
  assert.equal(c('', 'https://www.teyes-sibir.ru/store'), 'Прямой заход');
  assert.equal(c('', 'https://vk.com/teyes'), 'Соцсети: vk.com');
});

test('ложные совпадения: не реклама Яндекса и не поиск', () => {
  assert.equal(c('utm_source=yamaha'), 'Метка: yamaha');
  assert.equal(c('utm_source=yaplakal'), 'Метка: yaplakal');
  assert.equal(c('utm_source=directmail&utm_medium=email'), 'Метка: directmail');
  assert.equal(c('utm_source=yandex&utm_medium=email'), 'Метка: yandex');
  assert.equal(c('', 'https://yandex.ru.evil.com/'), 'Сайт: yandex.ru.evil.com');
  assert.equal(c('', 'https://google.evil.com/'), 'Сайт: google.evil.com');
  assert.equal(c('', 'https://mail.yandex.ru/'), 'Сайт: mail.yandex.ru');
  assert.equal(c('', 'https://mail.google.com/'), 'Сайт: mail.google.com');
});

test('карты', () => {
  assert.equal(c('utm_source=yandex_maps&utm_medium=referral'), 'Яндекс Карты');
  assert.equal(c('utm_source=google_maps'), 'Google Карты');
  assert.equal(c('utm_source=googlemybusiness&utm_medium=organic'), 'Google Карты');
  assert.equal(c('', 'https://www.google.com/maps/place/x'), 'Google Карты');
  assert.equal(c('', 'https://maps.app.goo.gl/x'), 'Google Карты');
  assert.equal(c('', 'https://yandex.ru/search/?text=a/maps'), 'Яндекс поиск');
});

test('метки без utm_source не превращаются в прямой заход', () => {
  assert.equal(c('utm_medium=cpc&utm_campaign=x'), 'Реклама: источник не указан');
  assert.equal(c('utm_referer=geoadv_search_yabs'), 'Яндекс Бизнес (реклама)');
  assert.equal(c('utm_content=1'), 'Метка: 1');
});

function browser(start: Record<string, string> = {}) {
  const store = new Map(Object.entries(start));
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  return (search: string, referrer = '') => {
    (globalThis as any).location = { search, pathname: '/', hostname: HOST };
    (globalThis as any).document = { referrer };
    return capture();
  };
}

test('сохранённый источник: реклама не затирается чужой меткой', () => {
  const go = browser();
  assert.equal(go('?yclid=1').channel, 'Яндекс реклама');
  assert.equal(go('?utm_content=1').channel, 'Яндекс реклама');
  assert.equal(go('?utm_source=newsletter').channel, 'Яндекс реклама');
  assert.equal(go('', 'https://yandex.ru/').channel, 'Яндекс реклама');
  assert.equal(go('').marks.yclid, '1');
  assert.equal(go('?gclid=2').channel, 'Google реклама');
});

test('сохранённый источник: прямой заход заменяется, поиск – нет', () => {
  const go = browser();
  assert.equal(go('').channel, 'Прямой заход');
  assert.equal(go('', 'https://www.google.com/').channel, 'Google поиск');
  assert.equal(go('', 'https://yandex.ru/').channel, 'Google поиск');
  assert.equal(go('?utm_source=dzen').channel, 'Метка: dzen');
});
