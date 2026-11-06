#!/usr/bin/env python3
"""Убрать WhatsApp из копии страниц Тильды (решение владельца 07.11.2026: «WhatsApp нигде не надо вообще»).

Снятие с Тильды возвращает ссылки, поэтому скрипт запускается после каждого переноса. Повторный запуск ничего не меняет.

  python3 scripts/strip-whatsapp.py           убрать (src/data/pages/*.json, а если их нет – public/**/*.html)
  python3 scripts/strip-whatsapp.py --check   только проверить: код 1, если что-то осталось

Что делает:
- удаляет пункт <li class="t-sociallinks__item_whatsapp"> вместе с разделителем &nbsp;;
- удаляет элемент зеро-блока со ссылкой на WhatsApp целиком, у кнопки – и подпись со стрелкой поверх неё
  (в зеро это отдельные элементы), у кнопки-соседа они сдвигаются вместе с ней;
- если элемент стоял в середине ряда или замыкал ряд, прижатый к правому краю, сдвигает соседей на его место
  в той ширине экрана, где появилась дыра: и data-field-left, и правило left в стилях страницы;
- в автораскладке (две кнопки в ряд) ставит по центру кнопку, оставшуюся в ряду одна.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FOUND = re.compile(r"whats\s?app|wa\.me", re.I)
WA_HREF = r"""[^"']*(?:whatsapp\.com|wa\.me)[^"']*"""
LI = re.compile(r"""<li class="t-sociallinks__item t-sociallinks__item_whatsapp">.*?</li>""", re.S)
ELEM = re.compile(r"""<div class=['"]t396__elem\b[^>]*>""")
WA_ATOM = re.compile(r"""\s*<a\b[^>]*\bhref=["']""" + WA_HREF + r"""["']""")
ROW_HREF = re.compile(r"""\s*<a\b[^>]*\bhref=["'](?:tel:|mailto:|https?://(?:www\.)?(?:t\.me|vk\.(?:com|ru)|instagram\.com|(?:web\.)?max\.ru))""")
RES = ["", "-res-960", "-res-640", "-res-480", "-res-320"]
HALF = {"600": "", "480": "-res-960", "320": "-res-640", "240": "-res-480", "160": "-res-320"}
GRID = {"": 1200, "-res-960": 960, "-res-640": 640, "-res-480": 480, "-res-320": 320}
EDGE = 12  # элемент ближе этого к правому краю сетки – ряд прижат вправо
TOP_DELTA = 8  # разница top, при которой элементы ещё считаются одним рядом
ROW_REACH = 340  # дальше этого соседи уже не один ряд


def num(value):
    try:
        return float(str(value).replace("px", ""))
    except (TypeError, ValueError):
        return None


def fmt(value):
    return str(int(value)) if float(value).is_integer() else str(value)


def effective(tag, field):
    """Значение поля по ширинам экрана: у Тильды нижняя ширина наследует верхнюю."""
    attrs = dict(re.findall(r'data-field-([a-z0-9-]+?)-value="([^"]*)"', tag))
    out, cur = {}, None
    for res in RES:
        cur = attrs.get(field + res, cur)
        out[res] = num(cur)
    return out


def elem_end(text, start):
    depth, pos = 0, start
    for m in re.finditer(r"<div\b|</div>", text[start:]):
        depth += 1 if m.group() != "</div>" else -1
        pos = start + m.end()
        if depth == 0:
            return pos
    raise ValueError("незакрытый элемент")


def artboard_elems(text, pos):
    """Элементы того же зеро-блока, что и pos: (начало тега, тег, начало содержимого)."""
    start = text.rfind("t396__artboard", 0, pos)
    next_board = text.find("t396__artboard", pos)
    stop = next_board if next_board != -1 else len(text)
    return [m for m in ELEM.finditer(text, start, stop)]


def rec_id(text, pos):
    found = None
    for found in re.finditer(r"""\bid=["']rec(\d+)["']""", text[max(0, pos - 400000):pos]):
        pass
    return found.group(1) if found else None


def move(text, tag, rec, new_left, log):
    """Записать элементу новый left по ширинам: в data-field и в правила стилей."""
    elem_id = re.search(r"data-elem-id='(\d+)'", tag).group(1)
    new_tag, prev = tag, None
    for res in RES:
        value = fmt(new_left[res])
        name = f'data-field-left{res}-value="'
        if name in new_tag:
            new_tag = re.sub(re.escape(name) + r'[^"]*"', name + value + '"', new_tag)
        elif value != prev:
            new_tag = new_tag[:-1] + f' {name}{value}"' + new_tag[-1]
        prev = value
    text = text.replace(tag, new_tag, 1)
    rule = re.compile(
        r"(#rec" + str(rec) + r" \.tn-elem\[data-elem-id=\"" + elem_id + r"\"\]\{[^}]*?left:calc\(50% - )(\d+)(px \+ )(-?[\d.]+)(px\))"
    )
    changed = {"n": 0}

    def fix(m):
        res = HALF.get(m.group(2))
        if res is None:
            return m.group()
        changed["n"] += 1
        return m.group(1) + m.group(2) + m.group(3) + fmt(new_left[res]) + m.group(5)

    text = rule.sub(fix, text)
    if not changed["n"]:
        log.append(f"нет правила left для {elem_id}")
    return text


def on_button(text, tag):
    """Подпись и картинка, лежащие поверх кнопки: их середина внутри её границ (в основной ширине)."""
    if "data-elem-type='button'" not in tag:
        return []
    box = [effective(tag, f)[""] for f in ("left", "top", "width", "height")]
    if None in box:
        return []
    found = []
    for m in artboard_elems(text, text.index(tag)):
        other = m.group()
        if other == tag or not re.search(r"data-elem-type='(?:text|image)'", other):
            continue
        left, top, width, height = [effective(other, f)[""] for f in ("left", "top", "width", "height")]
        if None in (left, top, width, height):
            continue
        if box[0] <= left + width / 2 <= box[0] + box[2] and box[1] <= top + height / 2 <= box[1] + box[3]:
            found.append(other)
    return found


def close_gap(text, tag, log):
    """Элемент в середине ряда: соседи встают на его место в той ширине, где он был между ними."""
    pos = text.index(tag)
    if "t396__elem-flex" in tag:
        return text  # ряд с автораскладкой закрывается сам
    tops, lefts, widths = effective(tag, "top"), effective(tag, "left"), effective(tag, "width")
    if lefts[""] is None:
        return text
    siblings = []
    for m in artboard_elems(text, pos):
        if m.group() != tag and "t396__elem-flex" not in m.group() and ROW_HREF.match(text, m.end()):
            siblings.append(m.group())
    plan = {}
    for res in RES:
        row = []
        for sib in siblings:
            top, left = effective(sib, "top")[res], effective(sib, "left")[res]
            if None in (top, left, tops[res], lefts[res]):
                continue
            if abs(top - tops[res]) <= TOP_DELTA and abs(left - lefts[res]) <= ROW_REACH:
                row.append((left, sib))
        before = [r for r in row if r[0] < lefts[res]]
        after = [r for r in row if r[0] > lefts[res]]
        if not after:
            at_edge = widths[res] is not None and GRID[res] - EDGE <= lefts[res] + widths[res] <= GRID[res]
            if not (before and at_edge):
                continue
        if before and len(before) < len(after) or not after:
            delta = lefts[res] - max(r[0] for r in before)
            group = before
        else:
            delta = lefts[res] - min(r[0] for r in after)
            group = after
        for _, sib in group:
            plan.setdefault(sib, {})[res] = delta
    for sib in list(plan):
        for other in on_button(text, sib):
            plan[other] = plan[sib]
    rec = rec_id(text, pos)
    for sib, deltas in plan.items():
        cur = effective(sib, "left")
        text = move(text, sib, rec, {r: cur[r] + deltas.get(r, 0) for r in RES}, log)
        log.append("сдвинут " + re.search(r"data-elem-id='(\d+)'", sib).group(1))
    return text


def center_flex_neighbor(text, tag):
    """Автораскладка: кнопка перед убранной остаётся в ряду одна – по центру, а не с дырой справа."""
    if "t396__elem-flex" not in tag:
        return text
    start = text.index(tag)
    prev = [m for m in artboard_elems(text, start) if m.start() < start and "t396__elem-flex" in m.group()]
    if not prev or "style=" in prev[-1].group():
        return text
    old = prev[-1].group()
    return text.replace(old, old[:-1] + ' style="margin-left:auto;margin-right:auto">', 1)


def strip_zero(text, log):
    removed = 0
    while True:
        target = next((m for m in ELEM.finditer(text) if WA_ATOM.match(text, m.end())), None)
        if target is None:
            return text, removed
        tag = target.group()
        for other in on_button(text, tag):
            start = text.index(other)
            text = text[:start] + text[elem_end(text, start):]
            removed += 1
        text = center_flex_neighbor(text, tag)
        text = close_gap(text, tag, log)  # после стрелки: иначе она считается соседом по ряду
        start = text.index(tag)
        text = text[:start] + text[elem_end(text, start):]
        removed += 1


def strip_li(text):
    removed = 0
    while True:
        m = LI.search(text)
        if m is None:
            return text, removed
        s, e = m.span()
        if text[:s].endswith("&nbsp;"):
            s -= len("&nbsp;")
        elif text[e:].startswith("&nbsp;"):
            e += len("&nbsp;")
        text = text[:s] + text[e:]
        removed += 1


def strip(text, log):
    text, li = strip_li(text)
    text, zero = strip_zero(text, log)
    return text, li, zero


def files():
    pages = sorted((ROOT / "src/data/pages").glob("*.json"))
    return pages or sorted((ROOT / "public").rglob("*.html"))


def main():
    check = "--check" in sys.argv
    total_li = total_zero = changed = 0
    left = []
    for path in files():
        raw = path.read_text(encoding="utf-8")
        if not FOUND.search(raw):
            continue
        log = []
        is_json = path.suffix == ".json"
        data = json.loads(raw) if is_json else None
        body = data.get("body", "") if is_json else raw
        new, li, zero = (body, 0, 0) if check else strip(body, log)
        if li or zero:
            changed += 1
            total_li += li
            total_zero += zero
            if is_json:
                data["body"] = new
                new_raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            else:
                new_raw = new
            path.write_text(new_raw, encoding="utf-8")
            if log:
                print(path.relative_to(ROOT), "; ".join(log))
        else:
            new_raw = raw
        if FOUND.search(new_raw):
            left.append(str(path.relative_to(ROOT)))
    print(f"файлов изменено: {changed}, пунктов списка: {total_li}, элементов зеро: {total_zero}, осталось в файлах: {len(left)}")
    for name in left[:30]:
        print("  осталось:", name)
    return 1 if left else 0


if __name__ == "__main__":
    sys.exit(main())
