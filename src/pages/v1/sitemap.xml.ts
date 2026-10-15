/** Карта сайта магазина «Вариант 1»: главная, разделы, карточки, текстовые страницы. */
import type { APIRoute } from 'astro';
import { sitemap } from '../../v1/feeds';

export const GET: APIRoute = ({ site }) => new Response(sitemap(site!), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
