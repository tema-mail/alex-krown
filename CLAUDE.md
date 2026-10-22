# ALEX KROWN (alex-krown.com) – перенос с Тильды на Astro + концепты главной

Бренд дизайнерской одежды ALEX KROWN (мужское, женское, обувь, парфюм). Сайт на Тильде сделан студией Deford.
Задача владельца 15.10.2026: перенести сайт с Тильды на код «от и до» и сделать 4 концепта главного экрана
(в двух – видео бренда). Решения – `docs/РЕШЕНИЯ.md`, долги – `docs/ТЕХДОЛГ.md`.

## Как устроено
- Подход «как экспорт Тильды» (по образцу ~/Sites/balance-fit): исходный HTML страниц + рантайм Тильды,
  CSS, шрифты и картинки локально в `public/_t/`. Маршрут `src/pages/[...slug].astro` собирает страницу из JSON.
- `node scripts/tilda-port.mjs` – обход (sitemap.xml + sitemap-store-*.xml + ссылки) → `src/data/pages/*.json`,
  ресурсы → `public/_t/`. Кэш – `node_modules/.cache/tilda-port`. Сайт отдаёт 403 без браузерного User-Agent.
- `node scripts/store-snapshot.mjs` – снимок API магазина (store.tildaapi.com отвечает только своему домену):
  Playwright открывает живые каталоги и карточки, ответы → `src/data/store/`. Маршрут `src/pages/t-store/[name].ts`
  отдаёт их и вставку `snapshot.js`, которая подменяет адрес запроса каталога на снимок.
- `node scripts/shrink-images.mjs` – пережать JPEG/PNG в `public/_t/` под лимит Pages (1 ГБ); имена не меняются.
- Порядок пересборки: tilda-port → store-snapshot → shrink-images → `npm run build`.
- Концепты главного экрана – `src/pages/concepts/` (каркас `src/components/ConceptLayout.astro`), картинки
  и видео – `public/concepts/`. Анимации – CSS и короткие скрипты без библиотек.
- Подпапка Pages (`/alex-krown`) задаётся `PUBLIC_BASE` при сборке, пути в данных корневые.
- Публикация: push в main → Actions → https://tema-mail.github.io/alex-krown/ (закрыто от индексации).
  Публичная сборка – `TILDA_COPY=0`: копия Тильды (маршрут `[...slug]`, `t-store`, `public/_t`) не публикуется.

## Магазин «Вариант 1» (`/v1/`) – из него делаются следующие версии
- Данные: `node scripts/v1-data.mjs` → `src/data/v1/{products,sections,pages}.json` + фото `public/v1/img/`
  (товары и описания – из снимка магазина и страниц товаров копии; разделы – как на оригинале).
- Код: `src/v1/` (site.ts – данные и адреса, store.ts – корзина/избранное, client.ts – общий скрипт страниц,
  feeds.ts – фиды и sitemap, views/ – шаблоны, islands/ – Preact: Sheets, ProductBuy, Order, FavPage),
  каркас `src/layouts/V1.astro`, страницы `src/pages/v1/`, стили home.css + home-blocks.css + v1.css.
- Адреса страниц – как на alex-krown.com под `/v1/`; фиды `/v1/feeds/google.xml`, `/v1/feeds/yandex.xml`, `/v1/sitemap.xml`.
- Заказ покупатель отправляет менеджеру в Telegram или MAX (`ORDER_CHANNELS` в islands/Order.tsx, ссылки тестовые до боя). Индексация – только с `PUBLIC_INDEX=1`.
- Видео в карточках – `docs/ВИДЕО-В-КАРТОЧКАХ.md`.

## Правила работы
- Тире только короткое «–».
- Файл больше 800 строк не дописывать – выносить модуль. Шаг – не больше 3 файлов кода, после шага коммит.
- Правки контента – в генераторе или в JSON страниц после него; руками в `public/_t/` не править.
- Счётчики (Метрика, tilda-stat, пиксели) на копию не ставим. Заказы и заявки с копии не уходят (`public/no-leads.js`).
- В Тильду ничего не писать без явного «да» владельца.
- Чего не знаешь – спросить, а не выдумать. После задачи – строка в `docs/РЕШЕНИЯ.md`.
