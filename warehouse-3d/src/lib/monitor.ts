import type { Cell, Consumer, Inventory, Product, TareType, Warehouse } from '../types';
import { buildCells } from './rack';
import { cellFill, cellUsage, rackLoads, type CellUse, type RackLoad } from './inventory';
import { checkPlacement, worstByAddress, type Level, type Violation } from './control';
import { cellActivity, lastMoves, locationStats, type CellActivity, type LocationStats } from './analytics';
import { SUPPLIERS } from './catalog';
import { bbox, rectCorners } from './geometry';

// Расчёты мониторинга для склада: ячейки, загрузка, заполнение, нагрузка стеллажей, нарушения,
// активность. Всё кэшируется, пока не изменилась структура склада или срез остатков.

export interface CellsIndex {
  cells: Cell[];
  byKey: Map<string, Cell>;
  byAddress: Map<string, Cell>;
  byRack: Map<string, Cell[]>;
}

const cellsCache = new WeakMap<Warehouse, CellsIndex>();

/** Ячейки склада (кэшируются, пока структура склада не изменилась). */
export function cellsOf(w: Warehouse): CellsIndex {
  let v = cellsCache.get(w);
  if (!v) {
    const cells = buildCells(w);
    const byRack = new Map<string, Cell[]>();
    for (const c of cells) {
      if (!c.rackId) continue;
      let list = byRack.get(c.rackId);
      if (!list) byRack.set(c.rackId, (list = []));
      list.push(c);
    }
    v = {
      cells,
      byKey: new Map(cells.map((c) => [c.key, c])),
      byAddress: new Map(cells.map((c) => [c.address, c])),
      byRack,
    };
    cellsCache.set(w, v);
  }
  return v;
}

const productMaps = new WeakMap<Product[], Map<string, Product>>();
export function productsMap(products: Product[]) {
  let m = productMaps.get(products);
  if (!m) productMaps.set(products, (m = new Map(products.map((p) => [p.id, p]))));
  return m;
}

const tareMaps = new WeakMap<TareType[], Map<string, TareType>>();
export function tareMap(list: TareType[]) {
  let m = tareMaps.get(list);
  if (!m) tareMaps.set(list, (m = new Map(list.map((t) => [t.id, t]))));
  return m;
}

export interface Monitor {
  w: Warehouse;
  idx: CellsIndex;
  inv?: Inventory;
  usage: Map<string, CellUse>;
  /** Заполнение ячеек 0..1 по адресу */
  fill: Map<string, number>;
  loads: Map<string, RackLoad>;
  stats: LocationStats;
  violations: Violation[];
  worst: Map<string, Level>;
  violationsAt: Map<string, Violation[]>;
  lastMove: Record<string, number>;
  activity: Map<string, CellActivity>;
}

interface CacheEntry {
  w: Warehouse;
  inv?: Inventory;
  products: Product[];
  tareTypes: TareType[];
  m: Monitor;
}

const monitors = new Map<string, CacheEntry>();

/** Мониторинг склада по срезу остатков. */
export function monitorOf(
  w: Warehouse,
  inv: Inventory | undefined,
  products: Product[],
  tareTypes: TareType[],
): Monitor {
  const hit = monitors.get(w.id);
  if (hit && hit.w === w && hit.inv === inv && hit.products === products && hit.tareTypes === tareTypes) return hit.m;
  const idx = cellsOf(w);
  const pm = productsMap(products);
  const tm = tareMap(tareTypes);
  const usage = inv ? cellUsage(inv, pm, idx.byAddress, tm) : new Map<string, CellUse>();
  const fill = new Map<string, number>();
  for (const c of idx.cells) {
    const f = Math.max(cellFill(c, usage.get(c.address)), inv?.fills?.[c.address] ?? 0);
    if (f > 0) fill.set(c.address, f);
  }
  const loads = rackLoads(idx.cells, usage);
  const lastMove = lastMoves(inv);
  const now = Date.now();
  const violations = checkPlacement({
    cells: idx.cells,
    usage,
    products: pm,
    batches: inv?.batches ?? {},
    racks: w.racks,
    loads,
    lastMove,
    now,
    zones: new Map(w.zones.map((z) => [z.id, z])),
  });
  const violationsAt = new Map<string, Violation[]>();
  for (const v of violations) {
    let list = violationsAt.get(v.address);
    if (!list) violationsAt.set(v.address, (list = []));
    list.push(v);
  }
  const m: Monitor = {
    w,
    idx,
    inv,
    usage,
    fill,
    loads,
    stats: locationStats(idx.cells, usage, pm, inv?.fills),
    violations,
    worst: worstByAddress(violations),
    violationsAt,
    lastMove,
    activity: cellActivity(inv?.events ?? [], 30, now),
  };
  monitors.set(w.id, { w, inv, products, tareTypes, m });
  return m;
}

/** Подпись места тары/получателя: «@К-01» → кладовая, «@П:Газы» → поставщик. */
export function partyLabel(code: string | undefined, consumers: Consumer[]): string {
  if (!code) return '';
  if (SUPPLIERS[code]) return SUPPLIERS[code];
  if (code.startsWith('@')) {
    const c = consumers.find((x) => x.code === code.slice(1));
    return c ? `${c.code} · ${c.name}` : code.slice(1);
  }
  return code;
}

/** Габариты объекта на плане (м). */
export function warehouseBounds(w: Warehouse) {
  const pts = [
    ...w.rooms.flatMap((r) => r.points),
    ...w.equipment
      .filter((e) => e.type !== 'tree')
      .flatMap((e) => rectCorners(e.x, e.y, e.length, e.width, e.rotation)),
  ];
  if (!pts.length) return { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  return bbox(pts);
}

/** Повторяющиеся адреса ячеек (например, одинаковые коды стеллажей). */
export function duplicateAddresses(cells: Cell[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const c of cells) {
    if (seen.has(c.address)) dup.add(c.address);
    seen.add(c.address);
  }
  return [...dup];
}
