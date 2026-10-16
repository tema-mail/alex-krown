/** Админка → «Экспорт CSV» (перенесено из Elite Rose: src/pages/admin/products.csv.ts): все товары,
    включая скрытые, в формате окна «Импорт CSV» – файл можно поправить в Excel и загрузить обратно.
    Колонки и кодировка строк – в src/v1/admin/CsvImport.tsx, чтобы выгрузка и загрузка не разошлись. */
import { allProducts, allSections, asset, v1 } from '../../../v1/site';
import { csvFile, csvRow } from '../../../v1/admin/CsvImport';

export function GET({ site }: { site: URL }) {
  const rows = allProducts.map((p) =>
    csvRow(
      p,
      allSections.filter((s) => s.path !== 'catalog' && s.uids.includes(p.uid)).map((s) => s.path),
      (name) => new URL(asset(`v1/img/${name}.webp`), site).href,
      new URL(v1(p.path), site).href,
    ),
  );
  return new Response(csvFile(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
}
