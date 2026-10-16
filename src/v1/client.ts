/* Общий скрипт страниц магазина «Вариант 1» (подключает layouts/V1.astro):
   шапка, меню, ленивые картинки, сердечки избранного на карточках, счётчики шапки, открытие шторок,
   видео первого экрана, видео в карточках по наведению и большие видео блоков, событие Метрики «просмотр товара».
   Обычный модуль, а не остров: карточек десятки, по острову на каждую – лишний JS. */
import { effect } from '@preact/signals';
import { cartCount, favs, sheet, toggleFav, type FavItem } from './store';
import { ecDetail } from './ecommerce';

/* ---------- Метрика: просмотр карточки товара (данные кладёт ProductPage.astro) ---------- */
const ecEl = document.getElementById('ec-detail');
if (ecEl) {
  try {
    ecDetail(JSON.parse(ecEl.textContent || ''));
  } catch {
    /* битые данные – без события */
  }
}

const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 1200));
const afterLoad = (fn: () => void) => (document.readyState === 'complete' ? idle(fn) : addEventListener('load', () => idle(fn), { once: true }));

/* ---------- шапка: на главной прозрачная над первым экраном ---------- */
const hd = document.querySelector<HTMLElement>('[data-hd]')!;
const hero = document.querySelector('[data-hero]');
if (hd.hasAttribute('data-hero-page') && hero)
  new IntersectionObserver(([e]) => hd.classList.toggle('is-solid', !e.isIntersecting), { rootMargin: '-80px 0px 0px' }).observe(hero);

/* ---------- меню ---------- */
const menu = document.querySelector<HTMLElement>('[data-menu]')!;
const openBtn = document.querySelector<HTMLElement>('[data-menu-open]')!;
const setMenu = (open: boolean) => {
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  openBtn.setAttribute('aria-expanded', String(open));
  document.documentElement.style.overflow = open ? 'hidden' : '';
  (open ? menu.querySelector<HTMLElement>('[data-menu-close]')! : openBtn).focus();
};
openBtn.addEventListener('click', () => setMenu(true));
menu.querySelector('[data-menu-close]')!.addEventListener('click', () => setMenu(false));
addEventListener('keydown', (e) => e.key === 'Escape' && menu.classList.contains('is-open') && setMenu(false));

/* ---------- картинки ниже первого экрана: адрес – за 600 px до появления ---------- */
const lio = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const im = e.target as HTMLImageElement;
      if (im.dataset.srcset) im.srcset = im.dataset.srcset;
      im.src = im.dataset.src!;
      lio.unobserve(im);
    }),
  { rootMargin: '600px 0px' },
);
$$<HTMLImageElement>('img[data-src]').forEach((im) => lio.observe(im));

/* второе фото карточки – при первом наведении мыши (на телефоне его не видно и оно не качается) */
if (matchMedia('(hover: hover)').matches)
  $$<HTMLImageElement>('img[data-hover-src]').forEach((im) =>
    im.closest('a')?.addEventListener(
      'pointerenter',
      () => {
        im.srcset = im.dataset.hoverSrcset!;
        im.src = im.dataset.hoverSrc!;
      },
      { once: true },
    ),
  );

/* ---------- избранное и корзина: счётчики шапки и сердечки карточек ---------- */
const favCount = $$('[data-fav-count]');
const cartCountEl = $$('[data-cart-count]');
const favBtns = $$<HTMLButtonElement>('[data-fav]');
effect(() => {
  const n = favs.value.length;
  const c = cartCount.value;
  favCount.forEach((el) => (el.textContent = String(n)));
  cartCountEl.forEach((el) => (el.textContent = String(c)));
  const on = new Set(favs.value.map((f) => f.uid));
  favBtns.forEach((b) => {
    const item = JSON.parse(b.dataset.fav!) as FavItem;
    const pressed = on.has(item.uid);
    b.setAttribute('aria-pressed', String(pressed));
    b.textContent = pressed ? '♥' : '♡';
  });
});
favBtns.forEach((b) => b.addEventListener('click', (e) => (e.preventDefault(), toggleFav(JSON.parse(b.dataset.fav!)))));
$$('[data-open-sheet]').forEach((b) => b.addEventListener('click', () => (sheet.value = b.dataset.openSheet as 'cart' | 'fav')));

/* ---------- видео первого экрана (главная): после загрузки, только видимые колонки ---------- */
const vio = new IntersectionObserver((es) =>
  es.forEach((e) => {
    const v = e.target as HTMLVideoElement;
    if (e.isIntersecting && v.offsetParent) v.play().catch(() => {});
    else v.pause();
  }),
);
if (!still && !saveData)
  afterLoad(() =>
    $$<HTMLVideoElement>('.reel video').forEach((v) => {
      if (!v.offsetParent) return;
      v.src = v.dataset.src!;
      v.addEventListener('playing', () => v.classList.add('is-on'), { once: true });
      vio.observe(v);
    }),
  );

/* ---------- видео в карточке (data-hover-video): мышь – при наведении, телефон – от 70 % на экране ---------- */
const cardVideo = (box: HTMLElement) => {
  let v = box.querySelector('video');
  if (!v) {
    v = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'auto' });
    v.setAttribute('aria-hidden', 'true');
    v.src = box.dataset.hoverVideo!;
    v.addEventListener('playing', () => v!.classList.add('is-on'));
    box.append(v);
  }
  return v;
};
const cards = $$('[data-hover-video]');
if (!still && !saveData && cards.length) {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches)
    cards.forEach((box) => {
      box.addEventListener('pointerenter', () => cardVideo(box).play().catch(() => {}));
      box.addEventListener('pointerleave', () => {
        const v = box.querySelector('video');
        if (v) (v.pause(), v.classList.remove('is-on'));
      });
    });
  else {
    const cio = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          const box = e.target as HTMLElement;
          /* порог 0.7 срабатывает и при входе, и при выходе – смотрим на долю на экране */
          if (e.isIntersecting && e.intersectionRatio >= 0.7) cardVideo(box).play().catch(() => {});
          else box.querySelector('video')?.pause();
        }),
      { threshold: 0.7 },
    );
    cards.forEach((box) => cio.observe(box));
  }
}

/* ---------- большие видео блоков (data-film): адрес за 200 px до экрана, играют только на экране ---------- */
const fplay = new IntersectionObserver((es) =>
  es.forEach((e) => {
    const v = e.target as HTMLVideoElement;
    if (e.isIntersecting) v.play().catch(() => {});
    else v.pause();
  }),
);
const fload = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const v = e.target as HTMLVideoElement;
      v.src = v.dataset.film!;
      v.addEventListener('playing', () => v.classList.add('is-on'), { once: true });
      fload.unobserve(v);
      fplay.observe(v);
    }),
  { rootMargin: '200px 0px' },
);
if (!still && !saveData) afterLoad(() => $$('[data-film]').forEach((v) => fload.observe(v)));

/* ---------- появление блоков при прокрутке ---------- */
const rio = new IntersectionObserver(
  (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('is-in'), rio.unobserve(e.target))),
  { rootMargin: '0px 0px -8% 0px' },
);
$$('[data-reveal]').forEach((el) => rio.observe(el));
