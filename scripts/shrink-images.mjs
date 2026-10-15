/**
 * Сжатие картинок копии под лимит GitHub Pages (1 ГБ на сайт).
 *
 *   node scripts/shrink-images.mjs
 *
 * JPEG и PNG в public/_t/ пережимаются на месте: ширина не больше 1680 px,
 * JPEG – mozjpeg q78, PNG – палитра не трогается, только уменьшение размера.
 * Формат и имя файла не меняются, поэтому ссылки страниц остаются прежними.
 * Файл заменяется, только если стал меньше. Оригиналы – в кэше tilda-port.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public/_t');
const MAX = 1680;

function* walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(jpe?g|png)$/i.test(e.name)) yield p;
  }
}

const files = [...walk(DIR)];
let before = 0;
let after = 0;
let i = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (i < files.length) {
      const f = files[i++];
      const src = readFileSync(f);
      before += src.length;
      try {
        const img = sharp(src, { failOn: 'none' }).rotate().resize({ width: MAX, withoutEnlargement: true });
        const out = /\.png$/i.test(f)
          ? await img.png({ compressionLevel: 9, effort: 8 }).toBuffer()
          : await img.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
        if (out.length < src.length) writeFileSync(f, out);
        after += Math.min(out.length, src.length);
      } catch (e) {
        after += src.length;
        console.log(`  ✗ ${f.slice(DIR.length)}: ${e.message}`);
      }
    }
  }),
);
const mb = (n) => (n / 1048576).toFixed(0) + ' МБ';
console.log(`картинок: ${files.length}, было ${mb(before)}, стало ${mb(after)}`);
