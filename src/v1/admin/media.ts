// Видео товара в админке – перенесено из TEYES (~/Sites/teyes-sibir-kod/site/src/islands/admin/media.ts), 19.11.2026:
// проверка файла до загрузки (формат, вес, длительность, что браузер его проигрывает) с понятной ошибкой,
// превью – первый кадр или своё фото. Видео кладётся как есть – строгий потолок по весу (Pages ограничен 1 ГБ).
import { IMG_DIR, toWebp } from './gh';

export const VIDEO_DIR = 'public/v1/video/p';
export const VIDEO = { types: ['video/mp4', 'video/webm'], maxMb: 20, maxSec: 90, maxCount: 3 };
export const VIDEO_RULE = `Видео: MP4 (H.264) или WebM, до ${VIDEO.maxMb} МБ и ${VIDEO.maxSec} секунд, до ${VIDEO.maxCount} шт. На сайте запускается само и без звука; «Со звуком» – покупатель может включить звук. Превью – первый кадр или своё фото.`;

/** Видео в данных товара: файл в public/v1/video/p, превью – имя фото в public/v1/img (без .webp). */
export type Video = { file: string; poster: string; sound: boolean };
export type Ready = { name: string; base64: string; url: string };
export type Upload = { path: string; base64: string };

const mb = (b: number) => (b / 2 ** 20).toFixed(1).replace('.', ',');
const ext = (f: File) => (f.name.split('.').pop() || '').toLowerCase();

/** Видео: формат, вес, длительность и то, что браузер его реально проигрывает. Имя – по содержимому. */
export async function prepareVideo(f: File): Promise<Ready> {
  if (ext(f) === 'mov' || f.type === 'video/quicktime')
    throw new Error(`«${f.name}»: MOV (видео с iPhone) играет не во всех браузерах – сохраните как MP4 (H.264)`);
  if (!VIDEO.types.includes(f.type)) throw new Error(`«${f.name}»: не видео в MP4 или WebM`);
  if (f.size > VIDEO.maxMb * 2 ** 20) throw new Error(`«${f.name}»: ${mb(f.size)} МБ – больше ${VIDEO.maxMb} МБ, сожмите видео`);
  const url = URL.createObjectURL(f);
  const bad = (text: string) => { URL.revokeObjectURL(url); return new Error(`«${f.name}»: ${text}`); };
  const sec = await new Promise<number>((ok, fail) => {
    const v = document.createElement('video');
    const t = setTimeout(() => fail(bad('браузер не смог прочитать видео за 15 секунд – сохраните как MP4 (H.264)')), 15000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { clearTimeout(t); ok(v.duration); };
    v.onerror = () => { clearTimeout(t); fail(bad('браузер не может проиграть это видео – нужен MP4 с кодеком H.264')); };
    v.src = url;
  });
  if (!isFinite(sec)) throw bad('у видео не записана длительность (так бывает у записи экрана) – пересохраните его как MP4');
  if (sec > VIDEO.maxSec) throw bad(`${Math.round(sec)} с – длиннее ${VIDEO.maxSec} секунд`);
  const buf = new Uint8Array(await f.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: `${hash}.${f.type === 'video/webm' ? 'webm' : 'mp4'}`, base64: btoa(bin), url };
}

/** Превью видео – первый кадр (0,1 с, чтобы не взять чёрный), сжатый в WebP 960 px как фото товара. */
export async function firstFrame(url: string, name: string): Promise<Ready> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await new Promise<void>((ok, fail) => { v.onloadeddata = () => ok(); v.onerror = () => fail(new Error('не удалось взять кадр из видео')); });
  v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
  await new Promise<void>((ok) => { v.onseeked = () => ok(); });
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  const blob: Blob = await new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('не удалось сохранить кадр'))), 'image/jpeg', 0.92));
  const w = await toWebp(new File([blob], 'frame.jpg', { type: 'image/jpeg' }), 960);
  return { name, base64: w.base64, url: URL.createObjectURL(blob) };
}

/** Своё превью: фото → WebP 960 px. */
export async function preparePoster(f: File, name: string): Promise<Ready> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) throw new Error(`«${f.name}»: превью – только JPG, PNG или WebP`);
  const w = await toWebp(f, 960);
  return { name, base64: w.base64, url: URL.createObjectURL(f) };
}

/** Новые файлы видео и превью → список для одного коммита. */
export const uploadsOf = (list: { file: string; base64?: string; poster?: { name: string; base64?: string } }[]): Upload[] =>
  list.flatMap((m) => [
    ...(m.base64 ? [{ path: `${VIDEO_DIR}/${m.file}`, base64: m.base64 }] : []),
    ...(m.poster?.base64 ? [{ path: `${IMG_DIR}/${m.poster.name}.webp`, base64: m.poster.base64 }] : []),
  ]);
