"""Раздел «Метрика и каналы» ALEX KROWN – кодом эталона EV SIBIR, без переписывания.

Владелец 16.10.2026: «не придумывай, бери с готовых кабинетов». Поэтому сбор, периоды
и экран – модули ~/Documents/ev-sibir/server (metrika, metrika_periods, metrika_report,
metrika_view, metrika_view_ind, gsc, ywm) как есть; здесь только подстановка: счётчик,
цели, домен, и выкладка всех вкладок в один JSON для админки.

Запуск: SSL_CERT_FILE=$(python3 -c "import certifi;print(certifi.where())") python3 scripts/metrika-ev.py
Пишет src/data/v1/analytics/metrika-ev.json (папка в .gitignore – цифры коммерческие).
"""

from __future__ import annotations

import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "v1" / "analytics"
EV = pathlib.Path(os.environ.get("EV_SERVER", "~/Documents/ev-sibir/server")).expanduser()
COUNTER = 112281637
SITE = "https://alex-krown.com"
# Цели счётчика ALEX KROWN (автоцели Метрики) → роли целей эталона
GOAL_IDS = {"lead": 608727090, "phone_click": 608727120, "messenger_click": 608727153}

OUT.mkdir(parents=True, exist_ok=True)
os.environ["LEAD_DB"] = str(OUT / "no-leads.db")  # своей базы заявок у сайта нет – блоки берут цели Метрики
os.environ["METRIKA_REPORT_CACHE"] = str(OUT / "metrika_report.json")
sys.path.insert(0, str(EV))

import gsc  # noqa: E402
import metrika  # noqa: E402
import metrika_periods  # noqa: E402
import metrika_report  # noqa: E402
import metrika_view  # noqa: E402
import ywm  # noqa: E402

metrika.COUNTER = COUNTER
gsc.SITE = "sc-domain:alex-krown.com"
ywm.SITE = "alex-krown.com"


def _counter_info() -> tuple[str, dict]:
    tz = metrika.api(f"/management/v1/counter/{COUNTER}").get("counter", {}).get("time_zone_name") or "Europe/Moscow"
    return tz, dict(GOAL_IDS)


metrika.counter_info = _counter_info

# Тексты эталона, которые у ALEX KROWN неверны: базы заявок нет, заказ уходит в WhatsApp
FIXES = [
    ("Заявки с форм – все, из базы сайта.", "Заявки с форм – цель Метрики «Формы» (своей базы заявок у сайта пока нет)."),
    ("Все заявки из базы сайта – форма записи и окно скидки. Источник известен, только если человек согласился на "
     "cookie, иначе «Неизвестно».", "Отправленные формы сайта (оформление заказа и формы) – автоцель Метрики «Формы»."),
    ("Мессенджеры (Telegram и MAX)", "Мессенджеры (WhatsApp, Telegram)"),
    ("Переход в Telegram или MAX по кнопкам сайта. Считает Метрика – только посетители с согласием на cookie.",
     "Переход в мессенджер по кнопкам сайта – автоцель Метрики «Меседжеры»."),
    # на alex-krown.com окна согласия нет (data-tilda-cookie="no") – Метрика видит всех
    ("Звонки и мессенджеры считает Метрика – она включается только после согласия на cookie и видит не всех. "
     "Визиты – Метрика, поэтому конверсия может быть завышена, пока счётчик новый.",
     "Звонки и мессенджеры – автоцели Метрики. Окна согласия на cookie у сайта нет, Метрика видит всех посетителей."),
    ("Считает Метрика – только посетители с согласием на cookie.", "Автоцель Метрики «Телефон»."),
    ("Звонки и переходы в мессенджеры считает Метрика – только после согласия на cookie.",
     "Звонки и переходы в мессенджеры – автоцели Метрики."),
]


def main() -> None:
    # --cached: только перерисовать из прошлой выгрузки, без запросов к API
    cache = metrika_report.load_cache() if "--cached" in sys.argv else metrika_report.refresh()
    views = {}
    for key, *_ in metrika_periods.PERIODS:
        views[f"ind:{key}"] = metrika_view.render(cache, {"v": "ind", "p": key}, SITE)
    for key, *_ in metrika_report.MODES:
        views[f"cmp:{key}"] = metrika_view.render(cache, {"v": "cmp", "c": key}, SITE)
    for k, html in views.items():
        # обёртка <main> и скрипт кнопки – страницы EV; у нас раздел живёт внутри каркаса админки
        html = html.replace(metrika_view.SCRIPT, "").replace("<main>", "", 1).replace("</main>", "", 1)
        for a, b in FIXES:
            html = html.replace(a, b)
        views[k] = html
    out = {"fetched_at": cache.get("fetched_at"), "errors": cache.get("errors") or [], "views": views}
    (OUT / "metrika-ev.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    p = (cache.get("periods") or {}).get("month") or {}
    s = p.get("summary") or {}
    print(f"обновлено {cache.get('fetched_at')}; месяц {p.get('date1')}…{p.get('date2')}: визиты {s.get('visits')}, "
          f"посетители {s.get('users')}, целевые {s.get('actions')}")
    for e in out["errors"]:
        print("  ошибка:", e)


if __name__ == "__main__":
    main()
