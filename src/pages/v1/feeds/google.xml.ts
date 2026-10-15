/** Фид товаров для рекламы (google) – собирается при сборке из данных магазина (src/v1/feeds.ts). */
import type { APIRoute } from 'astro';
import { googleFeed } from '../../../v1/feeds';

export const GET: APIRoute = ({ site }) => new Response(googleFeed(site!), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
