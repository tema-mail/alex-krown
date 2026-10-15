/**
 * Видео и кадры блока «Новая коллекция» и видео в карточках товаров.
 *
 *   FFMPEG=/путь/к/ffmpeg node scripts/collection-media.mjs <папка с клипами VK>
 *
 * Исходники – клипы VK бренда (vk.com/alex_krown), в репозиторий не кладутся:
 *   clip-126.mp4 – Cardiogram Black, улица (клип 456239126, «Костюм. Худи 6900, Джоггеры 6900»)
 *   clip-131.mp4 – Cardiogram Black, съёмка в зеркало (клип 456239131, «Костюм: Худи, Джоггеры»)
 * Нарезки 6–8 с: H.264 без звука, faststart – браузер начинает играть, не дожидаясь файла целиком.
 * Кадры-постеры – WebP. Всё кладётся в public/home/video/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
const FF = process.env.FFMPEG || 'ffmpeg';
const OUT = join(ROOT, 'public/home/video');
if (!SRC) throw new Error('укажи папку с клипами: node scripts/collection-media.mjs <папка>');
mkdirSync(OUT, { recursive: true });

/* имя → [клип, начало, длительность, ширина, кадр-постер (с от начала клипа)] */
const CUTS = {
  'cardiogram-street': ['clip-126.mp4', 3, 8, 720, 3.4],
  'cardiogram-mirror': ['clip-131.mp4', 2.6, 7, 480, 3.2],
  'cardiogram-hoodie': ['clip-126.mp4', 0.4, 6, 480, 5],
  'cardiogram-joggers': ['clip-131.mp4', 4.2, 6, 480, 5],
};

const run = (args) => execFileSync(FF, ['-loglevel', 'error', '-y', ...args]);
for (const [name, [clip, ss, t, w, poster]] of Object.entries(CUTS)) {
  const src = join(SRC, clip);
  const mp4 = join(OUT, `${name}.mp4`);
  run(['-ss', String(ss), '-t', String(t), '-i', src, '-an', '-vf', `scale=${w}:-2`, '-c:v', 'libx264', '-profile:v', 'high',
    '-crf', w > 600 ? '29' : '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  const jpg = join(OUT, `${name}.jpg`);
  run(['-ss', String(poster), '-i', src, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '2', jpg]);
  await sharp(jpg).webp({ quality: 74 }).toFile(join(OUT, `${name}.webp`));
  execFileSync('rm', [jpg]);
  console.log(`${name}: ${(statSync(mp4).size / 1024).toFixed(0)} КБ видео, ${(statSync(join(OUT, `${name}.webp`)).size / 1024).toFixed(0)} КБ кадр`);
}
