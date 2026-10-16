"""Раздел «Точка А» ALEX KROWN – кодом эталона EV SIBIR, без переписывания.

Владелец 16.10.2026: «не придумывай, бери с готовых кабинетов». Сбор – ~/Documents/ev-sibir/scripts/collect_tochka_a.py,
экран – ~/Documents/ev-sibir/server/tochka_a.py (render_body по месяцам) как есть; здесь только подстановка:
счётчик, цели, сайт, источники, которых у ALEX KROWN нет, и тексты эталона про EV.

Как в EV, слепок – один месяц: прошедший целиком, текущий – с 1-го по вчера (период пишется в слепок и
на экран). Без аргументов собираются все месяцы с сентября 2026 по вчерашний; с аргументами
«2026-10-01 2026-10-15» – один период, как у сборщика EV.

Запуск: SSL_CERT_FILE=$(python3 -c "import certifi;print(certifi.where())") python3 scripts/tochka-a-ev.py
        … --cached – только перерисовать из собранных слепков, без запросов к API.
Пишет слепки src/data/v1/analytics/tochka-a/tochka-a-<месяц>.json и экран src/data/v1/analytics/tochka-a-ev.json
(папка в .gitignore – цифры коммерческие).
"""

from __future__ import annotations

import datetime
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "v1" / "analytics"
SNAPS = OUT / "tochka-a"
EV = pathlib.Path(os.environ.get("EV_ROOT", "~/Documents/ev-sibir")).expanduser()
COUNTER = 112281637
START = "2026-09"  # счётчик ALEX KROWN отдаёт данные с сентября 2026
# Цели счётчика ALEX KROWN → ключи эталона. Ключи tg и vk заняты мессенджерами и соцсетями целиком:
# у сайта по одной общей цели на группу, а не по цели на каждый мессенджер. buy – покупка (ecommerce).
GOALS = {
    "form": (608727090, "Формы"),
    "phone": (608727120, "Телефон"),
    "tg": (608727153, "Меседжеры"),
    "vk": (608727179, "Соц сети"),
    "buy": (612430893, "Ecommerce: покупка"),
}

SNAPS.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(EV / "server"))
sys.path.insert(0, str(EV / "scripts"))

import collect_tochka_a as collect  # noqa: E402
import metrika  # noqa: E402
import seo_map  # noqa: E402
import tochka_a  # noqa: E402

collect.COUNTER = COUNTER
collect.GOALS = GOALS
collect.OUT_DIR = SNAPS
collect.GSC_SITE = "sc-domain:alex-krown.com"
tochka_a.DATA_DIR = SNAPS
tochka_a.AI_PATH = SNAPS / "ai-visibility.json"  # не собран: замер AI-выдачи – платные запросы XMLRiver
seo_map.load_queries_snapshot = lambda: None  # у EV тут его выгрузка Вебмастера, у ALEX KROWN её нет
_ev_contacts = tochka_a._contacts
tochka_a._contacts = lambda goals: _ev_contacts({k: v for k, v in goals.items() if k != "buy"})  # покупка – не контакт


def _wm_host(snap):
    """Как tochka_a._wm_host, только хост ALEX KROWN вместо evolutioncarservice."""
    wm = snap.get("webmaster", {})
    if wm.get("status") != "measured":
        return None, wm.get("reason", "не собрано")
    hosts = [h for h in wm.get("hosts", []) if "alex-krown" in h["host_id"]]
    return (hosts[0] if hosts else None), "хост не найден в Вебмастере"


tochka_a._wm_host = _wm_host

_ev_webmaster = collect.webmaster


def _webmaster(d1, d2, token):
    """У EV номер пользователя Вебмастера зашит; у ALEX KROWN сначала спрашиваем его у API."""
    try:
        collect.WM_USER = collect.http_json("https://api.webmaster.yandex.net/v4/user",
                                            {"Authorization": f"OAuth {token}"}, timeout=20)["user_id"]
    except RuntimeError as e:
        stamp = datetime.date.today().strftime("%d.%m.%Y")
        return {"status": "unavailable", "error": str(e),
                "reason": f"API Вебмастера не отвечает из сети, где идёт сбор ({stamp}, TLS-таймаут) – пересобрать позже"}
    return _ev_webmaster(d1, d2, token)


def _google(d1, d2):
    # Сборщик EV ходит в Search Console OAuth-ключами Google владельца EV; у ALEX KROWN их нет,
    # а сервисный аккаунт TEYES (~/.config/gsc/teyes-sa.json) получает 403 по alex-krown.com.
    return {"status": "unavailable", "site": collect.GSC_SITE,
            "reason": "нет доступа к Search Console: сервисный аккаунт teyes-seo-admin@teyes-seo-admin.iam.gserviceaccount.com "
                      "не добавлен в ресурс alex-krown.com (ответ 403), OAuth-ключей Google, как у EV, нет"}


collect.webmaster = _webmaster
collect.google = _google

# Тексты эталона, которые у ALEX KROWN неверны (как FIXES в metrika-ev.py). Порядок важен.
FIXES = [
    ("<div class=\"ctx\">В сентябре на домене работал старый сайт на Tilda: одна посадочная страница и несколько служебных.\n"
     "Новый сайт с отдельными страницами марок, ТО и русификации запущен в октябре — поэтому почти весь трафик\n"
     "сентября приходится на главную, а запросов по маркам почти нет.</div>",
     "<div class=\"ctx\">Сейчас на alex-krown.com работает магазин на Tilda. Новый сайт ещё не запущен, поэтому этот слепок – "
     "точка отсчёта: после запуска сравниваем с ним каждый следующий месяц.</div>"),
    ("<div class=\"lbl\">звонков и переходов в мессенджеры\n", "<div class=\"lbl\">звонков, переходов в мессенджеры и соцсети\n"),
    (", TG ", ", мессенджеры "),
    (", WA 0, VK ", ", соцсети "),
    ("<div class=\"lbl\">заявок через форму</div>", "<div class=\"lbl\">отправленных форм (оформление заказа и формы)</div>"),
    ("Цели с привязкой к любой странице\n(lead, phone_click, messenger_click) работают с 10.10.2026 — за сентябрь их нет.",
     "Формы, телефон, мессенджеры и соцсети – цели Метрики ALEX KROWN."),
    ("Нет данных: Search Console подключён 10.10.2026, за сентябрь запросов не вернул.", "Нет данных: {google}."),
    ("Показы и клики по запросам за сентябрь: нет данных", "Показы и клики по запросам: нет данных"),
    ("\n<details class=\"xq\"><summary>Запросы, по которым сайт показывался в Яндексе за 01.07–10.10.2026 — 0 шт., без цифр</summary>\n"
     "<ol class=\"xq-list\"></ol></details>", ""),
    ("Срез не собран. Запуск: <code>python3 scripts/collect_ai_visibility.py</code>",
     "Срез не собран: замер AI-выдачи идёт платными запросами XMLRiver, для ALEX KROWN его не запускали."),
    ("Запуск: <code>python3 scripts/collect_tochka_a.py</code>", "Запуск: <code>python3 scripts/tochka-a-ev.py</code>"),
]


def _months(today: datetime.date) -> list[tuple[str, str]]:
    """Периоды как у EV: прошедший месяц целиком, текущий – с 1-го по вчера."""
    last = today - datetime.timedelta(days=1)
    y, m = map(int, START.split("-"))
    out = []
    while (y, m) <= (last.year, last.month):
        first = datetime.date(y, m, 1)
        nxt = datetime.date(y + (m == 12), m % 12 + 1, 1)
        out.append((first.isoformat(), min(nxt - datetime.timedelta(days=1), last).isoformat()))
        y, m = nxt.year, nxt.month
    return out


def collect_all(args: list[str]) -> None:
    os.environ["METRIKA_ENV"] = str(pathlib.Path.home() / ".config" / "yandex-metrika" / "metrika.env")
    token = metrika.token()  # значение не печатается – только передаётся сборщику через окружение процесса
    if not token:
        sys.exit("нет YANDEX_METRIKA_TOKEN в ~/.config/yandex-metrika/metrika.env")
    os.environ["YANDEX_OAUTH_TOKEN"] = token
    periods = [tuple(args[:2])] if len(args) >= 2 else _months(datetime.date.today())
    for d1, d2 in periods:
        print(f"– {d1} … {d2}")
        sys.argv = [sys.argv[0], d1, d2]
        collect.main()


def render() -> None:
    views, periods = {}, {}
    for month in tochka_a.available_months():
        snap = tochka_a.load(month)
        html = tochka_a.render_body(snap, month)
        # обёртка <main> – страницы EV; у нас раздел живёт внутри каркаса админки
        html = html.replace("<main>", "", 1).replace("</main>", "", 1)
        google = ((snap or {}).get("google") or {}).get("reason", "не собрано")
        for a, b in FIXES:
            html = html.replace(a, b.replace("{google}", google))
        if snap and snap.get("metrika", {}).get("status") == "measured":
            buy = snap["metrika"]["totals"]["goals"].get("buy", 0)
            # покупки: в экране EV нет своей карточки – пишем их в подпись карточки форм, как разбивку контактов
            html = html.replace("<div class=\"lbl\">отправленных форм (оформление заказа и формы)</div>",
                                f"<div class=\"lbl\">отправленных форм (оформление заказа и формы; покупок по ecommerce {buy})</div>")
            periods[month] = snap["period"]
        views[month] = html.replace("—", "–")  # длинное тире владелец запретил везде
    out = {"months": list(views), "periods": periods, "views": views}
    (OUT / "tochka-a-ev.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    for month in views:
        s = tochka_a.load(month) or {}
        t = (s.get("metrika") or {}).get("totals") or {}
        print(f"{month}: {s.get('period')} визиты {t.get('visits')}, посетители {t.get('users')}, цели {t.get('goals')}; "
              f"google {(s.get('google') or {}).get('status')}, вебмастер {(s.get('webmaster') or {}).get('status')}")


if __name__ == "__main__":
    if "--cached" not in sys.argv:
        collect_all([a for a in sys.argv[1:] if not a.startswith("--")])
    render()
