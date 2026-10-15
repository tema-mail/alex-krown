import { signal, computed, effect } from '@preact/signals';

/* Корзина и избранное магазина «Вариант 1» – общие для всех островов страницы и живут между
   страницами (localStorage). Позиция корзины – товар + размер: id = `${uid}:${size}`. */

export interface CartItem { id: string; uid: string; size: string; title: string; price: number; img: string; path: string; qty: number }
export interface FavItem { uid: string; title: string; price: number; priceOld: number | null; img: string; path: string }

const CART_KEY = 'ak_v1_cart';
const FAV_KEY = 'ak_v1_fav';
const isBrowser = typeof window !== 'undefined';

function load<T>(key: string, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    const v = JSON.parse(localStorage.getItem(key) || '');
    return (Array.isArray(fallback) && !Array.isArray(v) ? fallback : v) as T;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* приватный режим – живём без сохранения */
  }
}

export const cart = signal<CartItem[]>(load(CART_KEY, []));
export const favs = signal<FavItem[]>(load(FAV_KEY, []));
export const cartCount = computed(() => cart.value.reduce((s, i) => s + i.qty, 0));
export const cartTotal = computed(() => cart.value.reduce((s, i) => s + i.qty * i.price, 0));

/** Открытая шторка: одна на страницу */
export type Sheet = null | 'cart' | 'fav';
export const sheet = signal<Sheet>(null);
export const toast = signal<{ text: string; key: number } | null>(null);

if (isBrowser) {
  effect(() => save(CART_KEY, cart.value));
  effect(() => save(FAV_KEY, favs.value));
  /* другая вкладка поменяла корзину – подтягиваем */
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) cart.value = load(CART_KEY, []);
    if (e.key === FAV_KEY) favs.value = load(FAV_KEY, []);
  });
}

export const MAX_QTY = 10;

export function addToCart(p: Omit<CartItem, 'qty' | 'id'>, qty = 1) {
  const id = `${p.uid}:${p.size}`;
  const list = [...cart.value];
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = { ...list[i], qty: Math.min(MAX_QTY, list[i].qty + qty) };
  else list.push({ ...p, id, qty: Math.min(MAX_QTY, qty) });
  cart.value = list;
  toast.value = { text: `«${p.title}»${p.size ? `, ${p.size}` : ''} – в корзине`, key: Date.now() };
}
export function setQty(id: string, qty: number) {
  cart.value = cart.value.map((x) => (x.id === id ? { ...x, qty: Math.min(MAX_QTY, qty) } : x)).filter((x) => x.qty > 0);
}
export const removeFromCart = (id: string) => (cart.value = cart.value.filter((x) => x.id !== id));
export const clearCart = () => (cart.value = []);

export const isFav = (uid: string) => favs.value.some((x) => x.uid === uid);
export function toggleFav(p: FavItem) {
  favs.value = isFav(p.uid) ? favs.value.filter((x) => x.uid !== p.uid) : [...favs.value, p];
}

export const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
