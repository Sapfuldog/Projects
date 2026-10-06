import { useMemo } from 'react';
import type { Cell, CellFill, Inventory, Product, Warehouse } from '../types';
import { buildCells } from './rack';
import { useStore, useWarehouse } from '../store';
import { computeStats } from './fill';
import { bbox, rectCorners } from './geometry';
import { fillsFromInventory, productTotals, type ProductTotal } from './inventory';

const cellsCache = new WeakMap<Warehouse, { cells: Cell[]; byKey: Map<string, Cell>; byAddress: Map<string, Cell> }>();

/** Ячейки склада (кэшируются, пока структура склада не изменилась). */
export function cellsOf(w: Warehouse) {
  let v = cellsCache.get(w);
  if (!v) {
    const cells = buildCells(w);
    v = { cells, byKey: new Map(cells.map((c) => [c.key, c])), byAddress: new Map(cells.map((c) => [c.address, c])) };
    cellsCache.set(w, v);
  }
  return v;
}

const EMPTY = { cells: [] as Cell[], byKey: new Map<string, Cell>(), byAddress: new Map<string, Cell>() };

export function useCells() {
  const w = useWarehouse();
  return w ? cellsOf(w) : EMPTY;
}

const NO_FILLS: Record<string, CellFill> = {};

const productMaps = new WeakMap<Product[], Map<string, Product>>();

export function productsMap(products: Product[]) {
  let m = productMaps.get(products);
  if (!m) productMaps.set(products, (m = new Map(products.map((p) => [p.id, p]))));
  return m;
}

export const useProducts = () => useStore((s) => s.products);
export const useProductsMap = () => productsMap(useProducts());
export const useInventory = (): Inventory | undefined =>
  useStore((s) => (s.currentId ? s.inventory[s.currentId] : undefined));

let lastFills: { cells: Cell[]; inv?: Inventory; products: Product[]; out: Record<string, CellFill> } | null = null;

/** Заполнение по внутреннему учёту (кэш на одну комбинацию структуры, остатков и каталога). */
export function internalFills(cells: Cell[], inv: Inventory | undefined, products: Product[]) {
  if (lastFills && lastFills.cells === cells && lastFills.inv === inv && lastFills.products === products)
    return lastFills.out;
  const out = fillsFromInventory(cells, inv, productsMap(products));
  lastFills = { cells, inv, products, out };
  return out;
}

/** Заполнение ячеек: из внутреннего учёта или из внешнего подключения. */
export function useFills(): Record<string, CellFill> {
  const internal = useStore((s) => s.warehouses.find((w) => w.id === s.currentId)?.connection.type === 'internal');
  const stored = useStore((s) => (s.currentId ? s.fills[s.currentId] : undefined) ?? NO_FILLS);
  const inv = useInventory();
  const products = useProducts();
  const { cells } = useCells();
  return internal ? internalFills(cells, inv, products) : stored;
}

const totalsCache = new WeakMap<Inventory, Map<string, ProductTotal>>();

export function useProductTotals(): Map<string, ProductTotal> {
  const inv = useInventory();
  return useMemo(() => {
    if (!inv) return new Map();
    let t = totalsCache.get(inv);
    if (!t) totalsCache.set(inv, (t = productTotals(inv)));
    return t;
  }, [inv]);
}

export function useStats() {
  const { cells } = useCells();
  const fills = useFills();
  return useMemo(() => computeStats(cells, fills), [cells, fills]);
}

/** Габариты всего объекта на плане (м). */
export function warehouseBounds(w: Warehouse) {
  const pts = [
    ...w.rooms.flatMap((r) => r.points),
    ...w.equipment.flatMap((e) => rectCorners(e.x, e.y, e.length, e.width, e.rotation)),
  ];
  if (!pts.length) return { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  return bbox(pts);
}

/** Есть ли в адресах ячеек дубли (например, одинаковые коды стеллажей). */
export function duplicateAddresses(cells: Cell[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const c of cells) {
    if (seen.has(c.address)) dup.add(c.address);
    seen.add(c.address);
  }
  return [...dup];
}
