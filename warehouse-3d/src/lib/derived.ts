import { useMemo } from 'react';
import type { Cell, CellFill, Warehouse } from '../types';
import { buildCells } from './rack';
import { useStore, useWarehouse } from '../store';
import { computeStats } from './fill';
import { bbox } from './geometry';

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

export function useFills(): Record<string, CellFill> {
  return useStore((s) => (s.currentId ? s.fills[s.currentId] : undefined) ?? NO_FILLS);
}

export function useStats() {
  const { cells } = useCells();
  const fills = useFills();
  return useMemo(() => computeStats(cells, fills), [cells, fills]);
}

/** Габариты всего объекта на плане (м). */
export function warehouseBounds(w: Warehouse) {
  const pts = w.rooms.flatMap((r) => r.points);
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
