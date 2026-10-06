import type { Batch, Cell, CellFill, Inventory, OpType, Product, TareType } from '../types';
import { accepts, tareCount } from './materials';

// Расчёты для мониторинга по срезу остатков из учётной системы: загрузка ячеек (места паллет,
// коробов, баллонов; объём; вес), нагрузка секций и стеллажей, тара. Учёт ведёт другая система.

export const emptyInventory = (): Inventory => ({
  stock: {},
  batches: {},
  tare: {},
  events: [],
  lastMove: {},
  updatedAt: 0,
  history: [],
});

/** Ключ остатка: товар или товар~партия. */
export const skey = (productId: string, batchId?: string) => (batchId ? `${productId}~${batchId}` : productId);
export function splitKey(k: string): [string, string | undefined] {
  const i = k.indexOf('~');
  return i < 0 ? [k, undefined] : [k.slice(0, i), k.slice(i + 1)];
}

/** Объём ячейки, л. */
export const cellVolume = (c: Cell) => (c.width * c.depth * c.height) / 1e6;

/** Доля объёма ячейки, которую разрешено занимать (зазоры, упаковка). */
export const FILL_LIMIT = 0.9;

/** Шаг количества по единице: тонны до кг, метры и килограммы до десятых. */
export function qtyStep(unit: string): number {
  return ({ т: 0.001, кг: 0.1, м: 0.1, л: 0.1, 'м³': 0.01, 'м²': 0.01 } as Record<string, number>)[unit] ?? 1;
}
export const floorTo = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;
export const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Сколько мест занимает пустая тара (поддоны в стопке, короба в сложенном виде). */
export function tarePlaces(t: TareType, n: number): number {
  const per = { pallet: 15, box: 25, bin: 6, drum: 4, reel: 1, cassette: 2, bag: 20, ibc: 1, cylinder: 1 }[t.kind];
  return Math.ceil(n / per);
}

export interface CellUse {
  volume: number;
  weight: number;
  qty: number;
  /** Занято мест (паллет, коробов, баллонов) */
  places: number;
  /** ключ (товар~партия) → количество */
  items: Record<string, number>;
  /** товар → количество */
  byProduct: Record<string, number>;
  /** Пустая тара в ячейке: вид → шт */
  tare: Record<string, number>;
}

const emptyUse = (): CellUse => ({ volume: 0, weight: 0, qty: 0, places: 0, items: {}, byProduct: {}, tare: {} });

/** Мест, которые занимает товар в ячейке: по таре или по объёму места. */
export function productPlaces(c: Cell | undefined, p: Product, qty: number): number {
  if (!c || c.places <= 0) return 0;
  if (p.perTare) return tareCount(p, qty);
  const placeVol = (cellVolume(c) * FILL_LIMIT) / c.places;
  return placeVol > 0 ? Math.ceil((qty * p.volume) / placeVol - 1e-9) : 0;
}

/** Загрузка ячеек: объём, вес, места, содержимое. */
export function cellUsage(
  inv: Pick<Inventory, 'stock'> & Partial<Pick<Inventory, 'tare'>>,
  products: Map<string, Product>,
  cellsByAddress?: Map<string, Cell>,
  tareTypes?: Map<string, TareType>,
): Map<string, CellUse> {
  const out = new Map<string, CellUse>();
  for (const [address, items] of Object.entries(inv.stock)) {
    const u = emptyUse();
    u.items = items;
    for (const [k, q] of Object.entries(items)) {
      const [pid] = splitKey(k);
      u.byProduct[pid] = (u.byProduct[pid] ?? 0) + q;
      u.qty += q;
      const p = products.get(pid);
      if (p) {
        u.volume += q * p.volume;
        u.weight += q * p.weight;
      }
    }
    const c = cellsByAddress?.get(address);
    for (const [pid, q] of Object.entries(u.byProduct)) {
      const p = products.get(pid);
      if (p) u.places += productPlaces(c, p, q);
    }
    out.set(address, u);
  }
  for (const [address, tare] of Object.entries(inv.tare ?? {})) {
    if (address.startsWith('@')) continue;
    const u = out.get(address) ?? emptyUse();
    for (const [tid, n] of Object.entries(tare)) {
      if (n <= 0) continue;
      u.tare[tid] = n;
      const t = tareTypes?.get(tid);
      if (t) {
        u.weight += t.weight * n;
        u.places += tarePlaces(t, n);
        u.volume += ((t.length * t.width * t.height) / 1e6) * (t.kind === 'pallet' ? n / 7 : n);
      }
    }
    out.set(address, u);
  }
  return out;
}

/** Заполнение ячейки 0..1: по местам (или объёму) и по нагрузке — по большему. */
export function cellFill(c: Cell, u: CellUse | undefined): number {
  if (!u || (u.qty <= 0 && !Object.keys(u.tare).length)) return 0;
  if (c.virtual) return 1;
  // Ячейка заполнена, если заняты все места или выбрана допустимая нагрузка — что наступит раньше
  const load = c.maxLoad > 0 ? u.weight / c.maxLoad : 0;
  if (c.places > 0) return Math.min(1, Math.max(u.places / c.places, load));
  const vol = u.volume / (cellVolume(c) * FILL_LIMIT || 1);
  return Math.min(1, Math.max(vol, load));
}

export interface RackLoad {
  total: number;
  sections: Map<number, number>;
}

/** Нагрузка на стеллажи и секции, кг. */
export function rackLoads(cells: Cell[], usage: Map<string, CellUse>): Map<string, RackLoad> {
  const out = new Map<string, RackLoad>();
  for (const c of cells) {
    const u = usage.get(c.address);
    if (!u || !c.rackId) continue;
    let l = out.get(c.rackId);
    if (!l) out.set(c.rackId, (l = { total: 0, sections: new Map() }));
    l.total += u.weight;
    l.sections.set(c.section, (l.sections.get(c.section) ?? 0) + u.weight);
  }
  return out;
}

/** Почему товар нельзя положить в ячейку (null — можно). */
export function cellRefusal(c: Cell, u: CellUse | undefined, p: Product, reservedOk?: string): string | null {
  if (c.blocked) return 'ячейка заблокирована';
  if (c.virtual) return null;
  if (!accepts(c.cellType, p.storage)) return 'тип ячейки не подходит';
  if (!!p.hazard !== c.hazard) return p.hazard ? 'нужна ячейка в зоне ЛВЖ' : 'зона ЛВЖ только для опасных грузов';
  if (c.reservedFor && c.reservedFor !== p.id && c.reservedFor !== reservedOk) return 'ячейка зарезервирована';
  const mixed = Object.keys(u?.byProduct ?? {}).some((pid) => pid !== p.id);
  if (mixed && c.cellType !== 'box' && c.cellType !== 'shelf') return 'в ячейке другой товар';
  return null;
}

export interface FitOptions {
  /** Остаток нагрузки стеллажа/секции, кг */
  loadLeft?: number;
  reservedOk?: string;
}

/** Сколько ещё товара поместится в ячейку: по местам, объёму, нагрузке ячейки и стеллажа. */
export function unitsFit(c: Cell, u: CellUse | undefined, p: Product, opts: FitOptions = {}): number {
  if (cellRefusal(c, u, p, opts.reservedOk)) return 0;
  if (c.virtual) return Number.MAX_SAFE_INTEGER;
  const limits: number[] = [];
  const mine = u?.byProduct[p.id] ?? 0;
  if (c.places > 0) {
    const myPlaces = productPlaces(c, p, mine);
    const otherPlaces = (u?.places ?? 0) - myPlaces;
    const free = c.places - otherPlaces - myPlaces;
    if (p.perTare) limits.push(free * p.perTare + (myPlaces * p.perTare - mine));
    else {
      const placeVol = (cellVolume(c) * FILL_LIMIT) / c.places;
      limits.push(p.volume > 0 ? ((c.places - otherPlaces) * placeVol) / p.volume - mine : Infinity);
    }
  }
  if (p.volume > 0 && c.cellType !== 'cylinder')
    limits.push((cellVolume(c) * FILL_LIMIT - (u?.volume ?? 0)) / p.volume);
  if (p.weight > 0) {
    limits.push((c.maxLoad - (u?.weight ?? 0)) / p.weight);
    if (opts.loadLeft !== undefined) limits.push(opts.loadLeft / p.weight);
  }
  const n = floorTo(Math.min(...limits), qtyStep(p.unit));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Изменить остаток (внутри immer-черновика или на копии). */
export function addStock(stock: Inventory['stock'], address: string, key: string, delta: number) {
  const items = (stock[address] ??= {});
  const v = (items[key] ?? 0) + delta;
  if (v > 1e-9) items[key] = Math.round(v * 1e6) / 1e6;
  else delete items[key];
  if (!Object.keys(items).length) delete stock[address];
}

export function addTare(tare: Inventory['tare'], place: string, tareTypeId: string, delta: number) {
  const items = (tare[place] ??= {});
  const v = (items[tareTypeId] ?? 0) + delta;
  if (v !== 0) items[tareTypeId] = v;
  else delete items[tareTypeId];
  if (!Object.keys(items).length) delete tare[place];
}

export interface OpInput {
  type: OpType;
  productId?: string;
  batchId?: string;
  tareTypeId?: string;
  qty: number;
  from?: string;
  to?: string;
  party?: string;
  note?: string;
}

/** Применить операцию к остаткам и таре. */
export function applyOp(inv: Pick<Inventory, 'stock' | 'tare'>, op: OpInput) {
  if (op.type === 'tare') {
    if (!op.tareTypeId) return;
    if (op.from) addTare(inv.tare, op.from, op.tareTypeId, -op.qty);
    if (op.to) addTare(inv.tare, op.to, op.tareTypeId, op.qty);
    return;
  }
  if (!op.productId) return;
  const k = skey(op.productId, op.batchId);
  switch (op.type) {
    case 'receipt':
    case 'return':
      if (op.to) addStock(inv.stock, op.to, k, op.qty);
      break;
    case 'shipment':
    case 'issue':
    case 'writeoff':
      if (op.from) addStock(inv.stock, op.from, k, -op.qty);
      break;
    case 'move':
      if (op.from && op.to) {
        addStock(inv.stock, op.from, k, -op.qty);
        addStock(inv.stock, op.to, k, op.qty);
      }
      break;
    case 'count':
      if (op.to) addStock(inv.stock, op.to, k, op.qty);
      break;
  }
}

/** Заполнение ячеек по внутреннему учёту (для 3D, карт и статистики). */
export function fillsFromInventory(
  cells: Cell[],
  inv: Inventory | undefined,
  products: Map<string, Product>,
  tareTypes?: Map<string, TareType>,
): Record<string, CellFill> {
  const out: Record<string, CellFill> = {};
  if (!inv) return out;
  const byAddr = new Map(cells.map((c) => [c.address, c]));
  const usage = cellUsage(inv, products, byAddr, tareTypes);
  const now = inv.events.length ? inv.events[inv.events.length - 1].at : Date.now();
  for (const c of cells) {
    const u = usage.get(c.address);
    if (!u) continue;
    const ids = Object.keys(u.byProduct);
    const main = products.get(ids[0]);
    const tareIds = Object.keys(u.tare);
    out[c.address] = {
      fill: cellFill(c, u),
      weight: Math.round(u.weight),
      qty: u.qty,
      used: u.places,
      sku: ids.length > 1 ? `${main?.sku ?? ''} +${ids.length - 1}` : main?.sku,
      name: main?.name ?? (tareIds.length ? `Пустая тара: ${tareTypes?.get(tareIds[0])?.name ?? ''}` : undefined),
      updatedAt: now,
    };
  }
  return out;
}

export interface ProductTotal {
  qty: number;
  cells: number;
}

export function productTotals(inv: Pick<Inventory, 'stock'> | undefined): Map<string, ProductTotal> {
  const out = new Map<string, ProductTotal>();
  if (!inv) return out;
  for (const items of Object.values(inv.stock)) {
    const seen = new Set<string>();
    for (const [k, q] of Object.entries(items)) {
      const [pid] = splitKey(k);
      const t = out.get(pid) ?? { qty: 0, cells: 0 };
      t.qty += q;
      if (!seen.has(pid)) t.cells += 1;
      seen.add(pid);
      out.set(pid, t);
    }
  }
  return out;
}

export interface BatchStock {
  batch?: Batch;
  batchId?: string;
  qty: number;
  cells: string[];
}

/** Остатки товара по партиям. */
export function batchStock(inv: Inventory | undefined, productId: string): BatchStock[] {
  const m = new Map<string, BatchStock>();
  for (const [address, items] of Object.entries(inv?.stock ?? {})) {
    for (const [k, q] of Object.entries(items)) {
      const [pid, bid] = splitKey(k);
      if (pid !== productId) continue;
      const key = bid ?? '';
      const e = m.get(key) ?? { batch: bid ? inv?.batches[bid] : undefined, batchId: bid, qty: 0, cells: [] };
      e.qty += q;
      e.cells.push(address);
      m.set(key, e);
    }
  }
  return [...m.values()].sort(
    (a, b) =>
      (a.batch?.expiry ?? Infinity) - (b.batch?.expiry ?? Infinity) ||
      (a.batch?.receivedAt ?? 0) - (b.batch?.receivedAt ?? 0),
  );
}

export interface TareBalance {
  /** Под товаром (поддоны, барабаны, полные баллоны) */
  underGoods: number;
  /** Пустая на складе */
  empty: number;
  /** У кладовых производства */
  atConsumers: number;
  /** У поставщиков (на заправке, к возврату) */
  atSuppliers: number;
  /** По местам: кладовые и поставщики */
  parties: Record<string, number>;
}

/** Баланс тары по видам: под товаром, пустая, у кладовых, у поставщиков. */
export function tareBalances(inv: Inventory | undefined, products: Map<string, Product>): Map<string, TareBalance> {
  const out = new Map<string, TareBalance>();
  const get = (id: string) => {
    let b = out.get(id);
    if (!b) out.set(id, (b = { underGoods: 0, empty: 0, atConsumers: 0, atSuppliers: 0, parties: {} }));
    return b;
  };
  for (const items of Object.values(inv?.stock ?? {})) {
    const byProduct: Record<string, number> = {};
    for (const [k, q] of Object.entries(items)) byProduct[splitKey(k)[0]] = (byProduct[splitKey(k)[0]] ?? 0) + q;
    for (const [pid, q] of Object.entries(byProduct)) {
      const p = products.get(pid);
      if (p?.tareTypeId) get(p.tareTypeId).underGoods += tareCount(p, q);
    }
  }
  for (const [place, items] of Object.entries(inv?.tare ?? {})) {
    for (const [tid, n] of Object.entries(items)) {
      const b = get(tid);
      if (!place.startsWith('@')) b.empty += n;
      else {
        b.parties[place] = (b.parties[place] ?? 0) + n;
        if (place.startsWith('@П:')) b.atSuppliers += n;
        else b.atConsumers += n;
      }
    }
  }
  return out;
}

export type StockStatus = 'ok' | 'low' | 'out';

export function stockStatus(p: Product, qty: number): StockStatus {
  if (qty <= 1e-9) return 'out';
  if (qty < p.min) return 'low';
  return 'ok';
}

export const STATUS_TITLE: Record<StockStatus, string> = {
  ok: 'В наличии',
  low: 'Низкий остаток',
  out: 'Нет в наличии',
};

export const OP_TITLE: Record<OpType, string> = {
  receipt: 'Приход',
  shipment: 'Отгрузка',
  issue: 'Выдача в производство',
  return: 'Возврат из производства',
  move: 'Перемещение',
  count: 'Инвентаризация',
  writeoff: 'Списание',
  tare: 'Тара',
};
