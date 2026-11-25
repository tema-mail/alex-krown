#!/usr/bin/env python3
"""Подготовка копии стенда к боевому домену: домен, noindex, robots.txt. Стенд не меняет.
   seo-cutover.py <dist стенда> <новая папка>   (папка не должна существовать)"""
import os, re, shutil, sys
src, dst = sys.argv[1:3]
OLD, NEW = 'https://crown.deford.ru', 'https://alex-krown.com'
CLOSED = ('admin', 'account', 'checkout', 'checkout-paid', 'favorites', 'karta', 'versions', 'concepts', 'soglasovanie', '404.html')
assert not os.path.exists(dst), 'папка уже есть'
shutil.copytree(src, dst)
opened = closed = 0
for d, dirs, files in os.walk(dst):
    for f in files:
        p = os.path.join(d, f); rel = os.path.relpath(p, dst)
        if not f.endswith(('.html', '.xml', '.txt', '.json', '.js', '.webmanifest')): continue
        s = open(p, encoding='utf8', newline='').read(); n = s.replace(OLD, NEW)
        if f.endswith('.html'):
            if rel.split('/')[0] in CLOSED or '/tproduct/' in rel: closed += 1
            else:
                n = re.sub(r'<meta name="robots" content="noindex, nofollow"\s*/?>', '', n); opened += 1
        if n != s: open(p, 'w', encoding='utf8', newline='').write(n)
open(os.path.join(dst, 'robots.txt'), 'w').write('User-agent: *\n' + ''.join(f'Disallow: /{x}/\n' for x in ('admin', 'account', 'checkout', 'checkout-paid', 'favorites', 'concepts', 'soglasovanie', 'karta', 'versions'))
    + f'\nSitemap: {NEW}/sitemap.xml\n')
locs = re.findall(r'<loc>' + NEW + r'([^<]*)', open(os.path.join(dst, 'sitemap.xml')).read())
bad = []
for l in locs:
    p = os.path.join(dst, l.strip('/'), 'index.html')
    if not os.path.exists(p): bad.append((l, 'нет файла')); continue
    s = open(p).read()
    if 'noindex' in s.split('</head>')[0]: bad.append((l, 'noindex'))
    if f'rel="canonical" href="{NEW}{l}"' not in s: bad.append((l, 'canonical'))
print('открыто', opened, 'закрыто', closed, 'в карте', len(locs), 'ошибок', len(bad), bad[:10])
