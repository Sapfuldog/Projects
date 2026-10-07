import type { Monitor } from './monitor';
import { stockLines, type StockLine } from './inventory';

// Латинские буквы, похожие на кириллицу: «A1-01» находит «А1-01», «AH348» — «АН348».
const LOOKALIKE: Record<string, string> = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
};

/** Строка для поиска без учёта регистра и раскладки похожих букв. */
export const fold = (s: string) => s.toLowerCase().replace(/[abcehkmoptxy]/g, (ch) => LOOKALIKE[ch]);

/** Текст строки содержимого: адрес, наименование, артикул, партия, плавка, заказ, сертификат, тара. */
export function lineText(l: StockLine, m: Monitor): string {
  const p = l.productId ? m.pm.get(l.productId) : undefined;
  const b = l.batchId ? m.inv?.batches[l.batchId] : undefined;
  const t = l.tareTypeId ? m.tm.get(l.tareTypeId) : undefined;
  return fold(
    [l.address, p?.name, p?.sku, p?.barcode, b?.number, b?.heat, b?.order, b?.cert, t?.name, t?.code]
      .filter(Boolean)
      .join(' '),
  );
}

const indexes = new WeakMap<Monitor, { address: string; text: string }[]>();

/** Поисковый индекс склада: по строке на каждую позицию содержимого и на каждую пустую ячейку. */
function searchIndex(m: Monitor) {
  let idx = indexes.get(m);
  if (!idx) {
    idx = stockLines(
      m.idx.cells.map((c) => c.address),
      m.usage,
      'add',
    ).map((l) => ({ address: l.address, text: lineText(l, m) }));
    indexes.set(m, idx);
  }
  return idx;
}

/** Ячейки, где совпал адрес или содержимое: ТМЦ, артикул, штрихкод, партия, плавка, заказ, тара. */
export function searchCells(m: Monitor, q: string): Set<string> {
  const f = fold(q.trim());
  const out = new Set<string>();
  if (!f) return out;
  for (const e of searchIndex(m)) if (e.text.includes(f)) out.add(e.address);
  return out;
}
