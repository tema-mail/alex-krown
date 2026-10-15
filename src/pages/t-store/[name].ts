/** Снимок API магазина Тильды (scripts/store-snapshot.mjs) и вставка snapshot.js (адрес /t-store/: папки с «_» Astro не строит),
    которая подменяет адрес запроса каталога на снимок. Ссылки на живой сайт
    в ответах переписываются на копию с подпапкой Pages (BASE_URL). */
import type { APIRoute } from 'astro';

const files = import.meta.glob<string>('../../data/store/*.json', { eager: true, query: '?raw', import: 'default' });
const byName = new Map(Object.entries(files).map(([p, body]) => [p.split('/').pop()!, body]));
const index = JSON.parse(byName.get('index.json') ?? '{}') as Record<string, string>;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/* те же правила ключа, что в scripts/store-snapshot.mjs (keyOf) */
const SHIM = `/* Снимок магазина Тильды для копии: запросы каталога отвечаются из /t-store/,
   остальные (фильтры и сортировка посетителя) уходят в Тильду как есть. */
(function(){var snap=${JSON.stringify(index)},dir=document.currentScript.src.replace(/[^/]*$/,''),
skip=['c','getparts','getoptions'],open=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,url){try{var u=new URL(url,location.href);
if(/^store\\d?\\.tilda(api|cdn)\\.[a-z]+$/.test(u.hostname)&&u.pathname.indexOf('/api/')===0){var p=[['_api',u.pathname]];
u.searchParams.forEach(function(v,k){if(skip.indexOf(k)<0)p.push([k,v])});
if(!p.some(function(x){return x[0]==='slice'}))p.push(['slice','1']);
p.sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:1});
var f=snap[JSON.stringify(p)];if(f)arguments[1]=dir+f+'.json'}}catch(e){}return open.apply(this,arguments)}})();
`;

export function getStaticPaths() {
  const names = Object.values(index).map((f) => ({ params: { name: f + '.json' } }));
  return [...names, { params: { name: 'snapshot.js' } }];
}

export const GET: APIRoute = ({ params }) => {
  if (params.name === 'snapshot.js') return new Response(SHIM, { headers: { 'Content-Type': 'text/javascript' } });
  const body = (byName.get(params.name!) ?? '{}').replace(
    /https?:(\\?\/)\1(?:www\.)?alex-krown\.com(?=\\?\/|")/g,
    (_m, sl) => (sl === '\\/' ? base.replace(/\//g, '\\/') : base),
  );
  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
};
