# ALEX KROWN – состояние работ

Ход работ по чатам. Решения – docs/РЕШЕНИЯ.md, долги – docs/ТЕХДОЛГ.md.

- 16.11.2026 – бесплатная доставка от 30 000 ₽ по сумме после списания баллов: v1 (Pages) и стенд; на Тильде не менялось.
- 16.11.2026 – стенд на crown.deford.ru (+ admin.crown.deford.ru), отдан Артёму для передачи Ире на ввод в бой. На Тильде порог 15 000 ₽ ждёт входа Артёма в кабинет Тильды.
- 16.11.2026 – админка admin.crown.deford.ru без пароля стенда (один вход: почта и пароль владельца); пароль владельца на сервере выровнен с ~/.config/shop-stand/alexkrown-owner, выкладка теперь проверяет вход им.
- 16.11.2026 – на стенде есть и админка сайта https://crown.deford.ru/v1/admin/ (замок lock-admin.mjs, логин и пароль – ~/.config/alex-krown/admin-login|admin-pass, как на Pages).
- 17.11.2026 – админка сайта /v1/admin/ (Pages и стенд crown.deford.ru): второй вход СВЕРХ админа Артёма рядом со входом владельца (схема – ~/Sites/sverh-admin/docs/zamok-dva-vhoda.md). Страницы под случайным ключом, его копии – под ключом владельца (~/.config/alex-krown, пароль не менялся) и СВЕРХ (секреты SVERH_LOGIN/SVERH_PASS, на маке ~/.config/sverh-admin/dostup.txt). Сейфы vault/metrika, seo, tochka-a перешифрованы v2 → v3 на оба входа, Vault.astro и форма открывают общей openBox (scripts/admin-open.mjs), seal-admin шифрует так же. Тест – `npm test` в pages.yml. На стенд выложены только файлы /v1/admin/ и новые /_astro/ (rsync, без deploy.sh – он перезагружает Caddy, 17.11 это запрещено).
- 17.11.2026 – доступ сотруднику (ключ «claude-code alex-krown repo», SHA256:MJhotMNs8pNXJWw5vAt93K145XDiQz7Gs8mYt9ziuP4) до 17.12.2026: ключ с записью в репо tema-mail/alex-krown (id 170174713, снимает cron мака ~/.claude/shablony/sroki/alex-krown-klyuch-170174713.sh) и root на FirstVDS 168.113.179.49 (стенд crown.deford.ru, expiry-time="20261217"). Аккаунт Deford2027 и так с записью в alex-krown и shop-modules.
