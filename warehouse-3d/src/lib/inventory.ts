import type { Cell, CellFill, Doc, Inventory, OpType, Product } from '../types';

// Складской учёт: остатки по ячейкам, подбор ячеек при приёмке (адресное хранение)
// и подбор ячеек при отгрузке. Одна ячейка — один товар (моно-ячейки).

export const emptyInventory = (): Inventory => ({ stock: {}, events: [], docs: [], seq: 1 });

/** Объём ячейки, л. */
export const cellVolume = (c: Cell) => (c.length * c.width * c.height) / 1e6;

/** Доля объёма ячейки, которую разрешено занимать (зазоры, упаковка). */
export const FILL_LIMIT = 0.9;

export interface CellUse {
  volume: number;
  weight: number;
  qty: number;
  /** товар → количество */
  items: Record<string, number>;
}

export function cellUsage(stock: Inventory['stock'], products: Map<string, Product>): Map<string, CellUse> {
  const out = new Map<string, CellUse>();
  for (const [address, items] of Object.entries(stock)) {
    let volume = 0;
    let weight = 0;
    let qty = 0;
    for (const [pid, q] of Object.entries(items)) {
      const p = products.get(pid);
      qty += q;
      if (p) {
        volume += q * p.volume;
        weight += q * p.weight;
      }
    }
    out.set(address, { volume, weight, qty, items });
  }
  return out;
}

/** Сколько ещё единиц товара поместится в ячейку по объёму и по Г. */
export function unitsFit(c: Cell, use: CellUse | undefined, p: Product): number {
  if (c.blocked) return 0;
  const freeVol = cellVolume(c) * FILL_LIMIT - (use?.volume ?? 0);
  const freeW = c.maxLoad - (use?.weight ?? 0);
  const byVol = p.volume > 0 ? freeVol / p.volume : Infinity;
  const byW = p.weight > 0 ? freeW / p.weight : Infinity;
  const n = Math.floor(Math.min(byVol, byW));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export interface PlanLine {
  address: string;
  qty: number;
}

export interface Plan {
  plan: PlanLine[];
  /** Сколько не удалось разместить/собрать */
  rest: number;
}

/** Крупный товар — на паллетные места, мелкий — в небольшие ячейки полочных стеллажей. */
export const isBulky = (p: Product) => p.volume >= 15;

/**
 * Подбор ячеек для приёмки: сначала ячейки с этим же товаром, затем пустые —
 * крупный товар на нижние ярусы, мелкий в ячейки поменьше.
 */
export function suggestPlacement(cells: Cell[], usage: Map<string, CellUse>, p: Product, qty: number): Plan {
  const plan: PlanLine[] = [];
  let rest = qty;
  const same = cells
    .filter((c) => !c.blocked && usage.get(c.address)?.items[p.id])
    .sort((a, b) => a.tier - b.tier || a.address.localeCompare(b.address));
  for (const c of same) {
    if (rest <= 0) break;
    const use = usage.get(c.address);
    if (use && Object.keys(use.items).length > 1) continue;
    const n = Math.min(rest, unitsFit(c, use, p));
    if (n > 0) {
      plan.push({ address: c.address, qty: n });
      rest -= n;
    }
  }
  if (rest > 0) {
    const bulky = isBulky(p);
    const empty = cells
      .filter((c) => !c.blocked && !(usage.get(c.address)?.qty ?? 0))
      .filter((c) => unitsFit(c, undefined, p) >= 1)
      .sort((a, b) =>
        bulky
          ? a.tier - b.tier || a.address.localeCompare(b.address)
          : cellVolume(a) - cellVolume(b) || a.tier - b.tier || a.address.localeCompare(b.address),
      );
    for (const c of empty) {
      if (rest <= 0) break;
      const n = Math.min(rest, unitsFit(c, undefined, p));
      if (n > 0) {
        plan.push({ address: c.address, qty: n });
        rest -= n;
      }
    }
  }
  return { plan, rest };
}

/** Подбор ячеек для отгрузки: сначала почти пустые ячейки (освобождаем места). */
export function suggestPicking(stock: Inventory['stock'], productId: string, qty: number): Plan {
  const plan: PlanLine[] = [];
  let rest = qty;
  const sources = Object.entries(stock)
    .filter(([, items]) => (items[productId] ?? 0) > 0)
    .map(([address, items]) => ({ address, qty: items[productId] }))
    .sort((a, b) => a.qty - b.qty || a.address.localeCompare(b.address));
  for (const s of sources) {
    if (rest <= 0) break;
    const n = Math.min(rest, s.qty);
    plan.push({ address: s.address, qty: n });
    rest -= n;
  }
  return { plan, rest };
}

/** Изменить остаток (внутри immer-черновика или на копии). */
export function addStock(stock: Inventory['stock'], address: string, productId: string, delta: number) {
  const items = (stock[address] ??= {});
  const v = (items[productId] ?? 0) + delta;
  if (v > 0) items[productId] = v;
  else delete items[productId];
  if (!Object.keys(items).length) delete stock[address];
}

export interface OpInput {
  type: OpType;
  productId: string;
  qty: number;
  from?: string;
  to?: string;
  docId?: string;
}

export function applyOp(stock: Inventory['stock'], op: OpInput) {
  if (op.type === 'receipt' && op.to) addStock(stock, op.to, op.productId, op.qty);
  if (op.type === 'shipment' && op.from) addStock(stock, op.from, op.productId, -op.qty);
  if (op.type === 'move' && op.from && op.to) {
    addStock(stock, op.from, op.productId, -op.qty);
    addStock(stock, op.to, op.productId, op.qty);
  }
  if (op.type === 'count' && op.to) addStock(stock, op.to, op.productId, op.qty);
}

/** Заполнение ячеек по внутреннему учёту (для 3D и статистики). */
export function fillsFromInventory(
  cells: Cell[],
  inv: Inventory | undefined,
  products: Map<string, Product>,
): Record<string, CellFill> {
  const out: Record<string, CellFill> = {};
  if (!inv) return out;
  const usage = cellUsage(inv.stock, products);
  const now = inv.events.length ? inv.events[inv.events.length - 1].at : Date.now();
  for (const c of cells) {
    const u = usage.get(c.address);
    if (!u) continue;
    const ids = Object.keys(u.items);
    const main = products.get(ids[0]);
    out[c.address] = {
      fill: Math.min(1, u.volume / (cellVolume(c) * FILL_LIMIT || 1)),
      weight: Math.round(u.weight),
      qty: u.qty,
      sku: ids.length > 1 ? `${main?.sku ?? ''} +${ids.length - 1}` : main?.sku,
      name: main?.name,
      updatedAt: now,
    };
  }
  return out;
}

export interface ProductTotal {
  qty: number;
  cells: number;
}

export function productTotals(inv: Inventory | undefined): Map<string, ProductTotal> {
  const out = new Map<string, ProductTotal>();
  if (!inv) return out;
  for (const items of Object.values(inv.stock)) {
    for (const [pid, q] of Object.entries(items)) {
      const t = out.get(pid) ?? { qty: 0, cells: 0 };
      t.qty += q;
      t.cells += 1;
      out.set(pid, t);
    }
  }
  return out;
}

export type StockStatus = 'ok' | 'low' | 'out';

export function stockStatus(p: Product, qty: number): StockStatus {
  if (qty <= 0) return 'out';
  if (qty < p.min) return 'low';
  return 'ok';
}

export const STATUS_TITLE: Record<StockStatus, string> = {
  ok: 'В наличии',
  low: 'Низкий остаток',
  out: 'Нет в наличии',
};

export const OP_TITLE: Record<OpType, string> = {
  receipt: 'Поступление',
  shipment: 'Отгрузка',
  move: 'Перемещение',
  count: 'Инвентаризация',
};

export interface DocPlanLine {
  productId: string;
  qty: number;
  plan: PlanLine[];
  rest: number;
}

/**
 * План проведения документа: для поставки — ячейки размещения (с учётом уже распределённых строк),
 * для заказа — ячейки отбора.
 */
export function planDoc(
  doc: Doc,
  cells: Cell[],
  inv: Inventory | undefined,
  products: Map<string, Product>,
): { lines: DocPlanLine[]; ops: OpInput[] } {
  const stock: Inventory['stock'] = JSON.parse(JSON.stringify(inv?.stock ?? {}));
  const lines: DocPlanLine[] = [];
  const ops: OpInput[] = [];
  for (const l of doc.lines) {
    const p = products.get(l.productId);
    if (!p) {
      lines.push({ productId: l.productId, qty: l.qty, plan: [], rest: l.qty });
      continue;
    }
    const res =
      doc.kind === 'receipt'
        ? suggestPlacement(cells, cellUsage(stock, products), p, l.qty)
        : suggestPicking(stock, p.id, l.qty);
    for (const pl of res.plan) {
      const op: OpInput =
        doc.kind === 'receipt'
          ? { type: 'receipt', productId: p.id, qty: pl.qty, to: pl.address }
          : { type: 'shipment', productId: p.id, qty: pl.qty, from: pl.address };
      applyOp(stock, op);
      ops.push(op);
    }
    lines.push({ productId: l.productId, qty: l.qty, plan: res.plan, rest: res.rest });
  }
  return { lines, ops };
}
