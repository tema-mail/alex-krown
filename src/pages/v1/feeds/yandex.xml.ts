/** Фид товаров для рекламы (yandex) – собирается при сборке из данных магазина (src/v1/feeds.ts). */
import type { APIRoute } from 'astro';
import { yandexFeed } from '../../../v1/feeds';

export const GET: APIRoute = ({ site }) => new Response(yandexFeed(site!), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
