"""Раздел «SEO-аналитика» ALEX KROWN – кодом эталона EV SIBIR, без переписывания.

Владелец 16.10.2026: «не придумывай, бери с готовых кабинетов». Экран и сборка реестра – модули
~/Documents/ev-sibir/server (seo_map, page_seo, metrika) как есть, тот же порядок, что в маршруте
/admin/seo админки EV: build_registry_from_site → enrich_with_real_queries → enrich_with_google →
enrich_with_xmlriver → render_body. Здесь только подстановка под ALEX KROWN:
– страницы – собранный сайт v1 (dist/v1/**/index.html);
– meta keywords у страниц v1 нет (реестр EV из них пуст), поэтому реестр – фразы, по которым люди
  реально пришли из поиска (Метрика), со страницей входа там, где Метрика её отдаёт; ключи не выдумываем;
– Вебмастер и Search Console недоступны (причина – из выгрузки scripts/metrika-ev.py), XMLRiver платный
  и не запрашивается: статусы unavailable / not_collected, не ноль.

Запуск (после сборки сайта): SSL_CERT_FILE=$(python3 -c "import certifi;print(certifi.where())") python3 scripts/seo-ev.py
--cached – только перерисовать из прошлой выгрузки, без запросов к Метрике.
Пишет src/data/v1/analytics/seo-ev.json (папка в .gitignore – данные коммерческие).
"""

from __future__ import annotations

import datetime as dt
import html
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "v1" / "analytics"
DATA = ROOT / "src" / "data" / "v1"
SITE_ROOT = pathlib.Path(os.environ.get("SEO_SITE_ROOT", ROOT / "dist" / "v1"))
EV = pathlib.Path(os.environ.get("EV_SERVER", "~/Documents/ev-sibir/server")).expanduser()
COUNTER = 112281637
CACHE = OUT / "seo-ev-cache.json"

sys.path.insert(0, str(EV))

import metrika  # noqa: E402
import page_seo  # noqa: E402
import seo_map  # noqa: E402

metrika.COUNTER = COUNTER

# Служебные и юридические страницы вне семантики – как EXCLUDE_* в seo_map
seo_map.EXCLUDE_PREFIXES = ("/admin/", "/feeds/", "/img/")
seo_map.EXCLUDE_ROUTES = ("/order/", "/favorites/", "/privatepolicy/",
                          "/processing_of_personal_data/", "/offer_agreement/")

# Брендовая фраза – правило из src/v1/admin/demand.ts (brandShare) плюс опечатки, которые реально есть в выгрузке
BRAND = re.compile(r"(alex|алекс?|александр)[\s\-]*(krown|crown|краун|кроун|крон|кроу|ераун)", re.I)
# в фразах бывают русские буквы вперемешку с латиницей («Аlex» с русской А) – проверяем и латинскую запись
_LAT = str.maketrans("аеорсхкмтвну", "aeopcxkmtbhy")


def is_brand(phrase: str) -> bool:
    return bool(BRAND.search(phrase) or BRAND.search(phrase.lower().translate(_LAT)))


CL_BRAND = "Бренд: ищут по названию"
CL_OTHER = "Без бренда: товары, категории"


def _names() -> dict:
    """Адрес v1 → что это за страница (из данных v1, не угадываем)."""
    out = {}
    for f, key in (("sections.json", "h1"), ("pages.json", "h1"), ("products.json", "title")):
        for x in json.loads((DATA / f).read_text(encoding="utf-8")):
            out["/" + x["path"].strip("/") + "/"] = (x.get(key) or x.get("title") or "").replace(" ALEX KROWN", "")
    return out


NAMES = _names()


def cluster_of(route: str) -> str:
    """Кластер страницы – по разделу адреса, как page_seo.cluster_of у EV."""
    if route == "/":
        return "Главная: бренд ALEX KROWN"
    if route in seo_map.EXCLUDE_ROUTES or route.startswith(seo_map.EXCLUDE_PREFIXES):
        return "Служебная или юридическая страница – вне поискового продвижения"
    if "/tproduct/" in route:
        return "Карточка товара"
    if route.startswith("/catalog/") or route in ("/accessories/", "/hats/", "/menshoes/", "/womenshoes/",
                                                   "/perfume/", "/socks/", "/sale/"):
        return "Каталог: " + (NAMES.get(route) or route)
    return "Страница бренда: " + (NAMES.get(route) or route)


page_seo.cluster_of = cluster_of


def routes() -> list[str]:
    """Как scan_pages() у EV: список страниц – из самих файлов сборки."""
    out = []
    for f in sorted(SITE_ROOT.rglob("index.html")):
        rel = f.parent.relative_to(SITE_ROOT).as_posix()
        out.append("/" if rel == "." else f"/{rel}/")
    return out


def route_of(path: str) -> str:
    """Страница входа Метрики (/catalog/man#popup:infoblock) → адрес v1 (/catalog/man/)."""
    p = path.split("#", 1)[0].split("?", 1)[0].rstrip("/")
    return p + "/" if p else "/"


def collect() -> dict:
    """Метрика: фразы из поиска, связка фраза → страница входа, страницы входа из поиска. Без токенов в выводе."""
    d2 = dt.date.today() - dt.timedelta(days=1)
    d1 = d2 - dt.timedelta(days=364)
    a, b = d1.isoformat(), d2.isoformat()

    def rows(dims, flt=None, humans=True):
        if humans:
            data = metrika.stat(a, b, ["ym:s:visits"], dims, sort="-ym:s:visits", limit=1000, filters=flt)
        else:  # с фильтром роботов Метрика скрывает редкие строки страниц входа (проверено 16.10: 1 строка против 50)
            data = metrika.api("/stat/v1/data", {"ids": COUNTER, "date1": a, "date2": b, "metrics": "ym:s:visits",
                                                 "dimensions": ",".join(dims), "sort": "-ym:s:visits", "limit": 1000,
                                                 "accuracy": "full", "lang": "ru", "filters": flt})
        return [([x.get("name") or "" for x in ds], int(m[0])) for ds, m in metrika._rows(data)]

    cache = {"fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
             "date_from": a, "date_to": b, "errors": []}
    try:
        cache["phrases"] = rows(["ym:s:searchPhrase"])
        cache["pairs"] = rows(["ym:s:searchPhrase", "ym:s:startURLPathFull"])
        cache["landing"] = rows(["ym:s:startURLPathFull"], "ym:s:trafficSource=='organic'", humans=False)
    except metrika.MetrikaError as e:
        cache["errors"].append(f"Метрика: {e}")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return cache


def source_reasons() -> tuple[str, str]:
    """Почему нет Вебмастера и Search Console – из последней выгрузки EV-модулей ywm/gsc (scripts/metrika-ev.py)."""
    ywm = "API Вебмастера не отвечает из этой сети (соединение TLS зависает)"
    gsc = ("Search Console ответил 403: у сервисного аккаунта teyes-seo-admin@teyes-seo-admin.iam.gserviceaccount.com "
           "нет доступа к alex-krown.com")
    f = OUT / "metrika_report.json"
    if f.is_file():
        rep = json.loads(f.read_text(encoding="utf-8"))
        if rep.get("ywm_error"):
            ywm = f'{rep["ywm_error"]} (выгрузка {(rep.get("fetched_at") or "")[:10]}): TCP соединяется, TLS-рукопожатие зависает'
        hit = next((e.split(": ", 1)[1] for e in rep.get("errors") or [] if e.startswith("Search Console")), "")
        if hit:
            gsc = (f'{hit} (выгрузка {(rep.get("fetched_at") or "")[:10]}): аккаунт '
                   "teyes-seo-admin@teyes-seo-admin.iam.gserviceaccount.com, ресурс sc-domain:alex-krown.com")
    return ywm, gsc


def registry_from_phrases(cache: dict, ywm: str, gsc: str) -> list[dict]:
    """Строки в форме реестра EV: одна фраза – одна строка, страницы – где Метрика отдала страницу входа."""
    pages = {}
    for (phrase, start), _ in cache.get("pairs") or []:
        pages.setdefault(phrase.lower(), []).append(route_of(start))
    rows = []
    for (phrase,), visits in cache.get("phrases") or []:
        rows.append({
            "phrase": phrase, "visits": visits,
            "pages": sorted(set(pages.get(phrase.lower(), []))),
            "cluster": CL_BRAND if is_brand(phrase) else CL_OTHER,
            "demand_nsk": dict(seo_map.NOT_COLLECTED), "demand_rf": dict(seo_map.NOT_COLLECTED),
            "yandex_impressions": {"status": "unavailable", "reason": ywm},
            "google_impressions": {"status": "unavailable", "reason": gsc},
            "yandex_position": dict(seo_map.NOT_COLLECTED), "google_position": dict(seo_map.NOT_COLLECTED),
            "real_query_match": False,
        })
    return rows


ST = {"measured": "собрано", "unavailable": "недоступно", "not_collected": "не собрано"}


def sources_panel(cache: dict, kw_pages: int, n_pages: int, ywm: str, gsc: str) -> str:
    met = "measured" if cache.get("phrases") is not None else "unavailable"
    items = [
        ("Ключевые слова страниц (meta keywords)", "measured",
         f"заданы у {kw_pages} из {n_pages} страниц v1 – реестр EV строится из них, поэтому здесь он из фраз Метрики"),
        ("Яндекс Метрика: фразы и страницы входа", met,
         f"{cache.get('date_from', '')} – {cache.get('date_to', '')}, только люди (без роботов)"
         + ("" if met == "measured" else "; " + "; ".join(cache.get("errors") or []))),
        ("Яндекс Вебмастер: показы в Яндексе", "unavailable", ywm),
        ("Google Search Console: показы в Google", "unavailable", gsc),
        ("XMLRiver: спрос Wordstat и позиции в выдаче", "not_collected", "сервис платный – запросов не делали"),
    ]
    trs = "".join(f'<tr><td class="phrase">{html.escape(n)}</td><td><span class="{"yes" if s == "measured" else "nc"}">'
                  f'{ST[s]}</span> <span class="pg">{s}</span></td><td>{html.escape(why)}</td></tr>' for n, s, why in items)
    return (f'<div class="panel"><h2>Источники данных</h2><div style="overflow-x:auto"><table class="smt">'
            f'<tr><th>Источник</th><th>Статус</th><th>Что это значит</th></tr>{trs}</table></div>'
            f'<div class="note">Ноль и «не собрано» – разное: «недоступно» – источник спросили и он не ответил, '
            f'«не собрано» – не спрашивали.</div></div>')


def landing_panel(cache: dict, have: set) -> str:
    agg = {}
    for (start,), visits in cache.get("landing") or []:
        r = route_of(start)
        agg[r] = agg.get(r, 0) + visits
    if not agg:
        return ""
    total = sum(agg.values())
    trs = "".join(
        f'<tr><td><span class="pg">{html.escape(r)}</span><br><span style="font-size:12px;color:#77817e">'
        f'{html.escape(NAMES.get(r, ""))}</span></td><td>{html.escape(cluster_of(r))}</td><td>{v}</td>'
        f'<td>{"<span class=yes>да</span>" if r in have else "<span class=nc>нет в v1</span>"}</td></tr>'
        for r, v in sorted(agg.items(), key=lambda kv: -kv[1]))
    return (f'<div class="panel"><h2>Страницы входа из поиска ({len(agg)})</h2>'
            f'<p style="margin:0 0 12px;font-size:13px;color:#55605d">Метрика, визиты из поисковых систем за '
            f'{cache.get("date_from", "")} – {cache.get("date_to", "")}: всего {total} (без фильтра роботов – с ним Метрика '
            f'прячет редкие страницы). Адрес – как на alex-krown.com, '
            f'в v1 тот же путь под /v1/.</p><div style="overflow-x:auto"><table class="smt">'
            f'<tr><th>Страница входа</th><th>Кластер</th><th>Визиты из поиска</th><th>Есть в v1</th></tr>{trs}'
            f'</table></div></div>')


# Тексты эталона, которые у ALEX KROWN неверны (EV, Новосибирск, Вебмастер как источник списка запросов)
FIXES = [
    ("Карта поискового спроса</h1>", "SEO-аналитика</h1>"),
    ("Архитектура и дисциплина — по технологии, собранной для TEYES; масштаб — под наш сайт.",
     "Ключевых слов в meta keywords у страниц нет, поэтому реестр – фразы, по которым люди реально пришли из "
     "поиска (Яндекс Метрика), со страницей входа там, где Метрика её отдаёт. Ключи не выдумываются."),
    ("ключевых слов в реестре", "поисковых фраз в реестре"),
    ("подтверждены реальным запросом", "с визитами из поиска (Метрика)"),
    ("Кластеры по числу ключевых слов", "Кластеры по числу фраз"),
    ("— считается по разделу страницы (марка, модель, документ), не угадывается отдельно для каждого слова.",
     "– по смыслу фразы: брендовая (ищут ALEX KROWN по названию, правило как в «Метрике») или по товарам и "
     "категориям. У страниц входа – по разделу адреса (главная, каталог, карточка товара)."),
    ("На каких страницах сайта эта фраза реально стоит в keywords — можно пересекаться, одна фраза бывает нужна "
     "двум страницам.", "На какую страницу человек вошёл по этой фразе. Метрика отдаёт связку «фраза – страница» "
     "только при достаточном числе визитов (защита данных), у редких фраз поле пустое – это не ошибка."),
    ("Отмечено «да», если похожая формулировка реально встретилась в выгрузке Яндекс.Вебмастера — то есть кто-то "
     "так и искал, а не только мы так думаем.", "«Да» – по фразе был хотя бы один визит из поиска (Метрика): "
     "кто-то так и искал. Сверка с Вебмастером недоступна – его API не отвечает."),
    ("Широкая частотность Wordstat по Новосибирску и по России отдельно — не складывать. Пока не собрано: нужен "
     "доступ к XMLRiver или Яндекс.Директ.", "Широкая частотность Wordstat по Новосибирску (город бренда) и по "
     "России отдельно – не складывать. Не собрано: XMLRiver платный, запросов не делали."),
    ("по данным Вебмастера и Search Console.", "по данным Вебмастера и Search Console. Сейчас оба недоступны – "
     "причины в «Источниках данных»."),
    ("Список реальных запросов — выгрузка Яндекс.Вебмастера за", "Список реальных запросов – выгрузка Яндекс Метрики за"),
    ("Реальные запросы, которых нет ни в одной странице", "Реальные запросы вне реестра"),
]


def main() -> None:
    if not SITE_ROOT.is_dir():
        sys.exit(f"Нет сборки сайта {SITE_ROOT}: сначала PUBLIC_BASE=/alex-krown TILDA_COPY=0 npm run build")
    if "--cached" in sys.argv and CACHE.is_file():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    else:
        cache = collect()
    ywm, gsc = source_reasons()

    # Порядок маршрута /admin/seo админки EV
    pages_for_map = routes()
    registry = seo_map.build_registry_from_site(str(SITE_ROOT), pages_for_map)
    content = [r for r in pages_for_map if r not in seo_map.EXCLUDE_ROUTES and not r.startswith(seo_map.EXCLUDE_PREFIXES)]
    kw_pages = sum(1 for r in content if (page_seo.read_page(str(SITE_ROOT), r) or {}).get("keywords"))
    if not registry:  # ключей у страниц нет – реестр из фраз, по которым реально приходили
        registry = registry_from_phrases(cache, ywm, gsc)
    phrases = [p for (p,), _ in cache.get("phrases") or []]
    snapshot = {"queries": phrases, "date_from": cache.get("date_from", ""), "date_to": cache.get("date_to", ""),
                "collected_at": (cache.get("fetched_at") or "")[:10],
                "note": f"Фраз: {len(phrases)}, визитов по ним: {sum(v for _, v in cache.get('phrases') or [])}. "
                        "Google почти все фразы скрывает, поэтому они в основном из Яндекса."} if phrases else None
    registry, extra_queries, snapshot = seo_map.enrich_with_real_queries(registry, snapshot)
    registry = seo_map.enrich_with_google(registry, None)      # Search Console: 403 – снапшота нет
    registry = seo_map.enrich_with_xmlriver(registry, None)    # XMLRiver платный – не собирали
    body = seo_map.render_body(registry, extra_queries, snapshot, len(content), None, None)

    body = body.replace("<main>", "", 1).replace("</main>", "", 1)
    body = body.replace("Реестр ключевых слов сайта EV Sibir (", "Реестр поисковых фраз магазина ALEX KROWN (", 1)
    body = body.replace(" страниц), сверенный с реальными поисковыми запросами.", " страниц v1).", 1)
    for a, b in FIXES:
        body = body.replace(a, b)
    have = set(pages_for_map)
    anchor = '<div class="panel">\n  <h2>Кластеры'
    body = body.replace(anchor, sources_panel(cache, kw_pages, len(content), ywm, gsc) + "\n" + anchor, 1)
    end = body.rfind("</div>")  # конец обёртки .sm – страницы входа последним блоком
    body = body[:end] + landing_panel(cache, have) + body[end:]
    body = body.replace("—", "–")  # только короткое тире
    css = seo_map.CSS + ".sm .smt .pg,.sm .smt .nc{white-space:nowrap}.sm table.smt td:nth-child(2){min-width:150px}@media(max-width:700px){.sm .cl-row{grid-template-columns:1fr 70px 30px}}"
    out = {"fetched_at": cache.get("fetched_at"), "errors": cache.get("errors") or [],
           "html": f"<style>{css}</style>{body}"}
    (OUT / "seo-ev.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"обновлено {cache.get('fetched_at')}; страниц v1 {len(content)}, с keywords {kw_pages}; фраз {len(registry)}, "
          f"с известной страницей входа {sum(1 for r in registry if r['pages'])}, вне реестра {len(extra_queries)}")
    for e in out["errors"]:
        print("  ошибка:", e)


if __name__ == "__main__":
    main()
