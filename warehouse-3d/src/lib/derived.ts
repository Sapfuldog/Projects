import { useMemo } from 'react';
import type { Inventory, Warehouse } from '../types';
import { useStore, useWarehouse } from '../store';
import { cellsOf, monitorOf, partyLabel, productsMap, tareMap, type CellsIndex, type Monitor } from './monitor';
import { productTotals, type ProductTotal } from './inventory';

// Хуки React поверх расчётов мониторинга (lib/monitor.ts).

const EMPTY: CellsIndex = { cells: [], byKey: new Map(), byAddress: new Map(), byRack: new Map() };

export function useCells(): CellsIndex {
  const w = useWarehouse();
  return w ? cellsOf(w) : EMPTY;
}

export const useProducts = () => useStore((s) => s.products);
export const useProductsMap = () => productsMap(useProducts());
export const useTareTypes = () => useStore((s) => s.tareTypes);
export const useTareMap = () => tareMap(useTareTypes());
export const useConsumers = () => useStore((s) => s.consumers);
export const useInventory = (): Inventory | undefined =>
  useStore((s) => (s.currentId ? s.inventory[s.currentId] : undefined));

/** Мониторинг текущего склада. */
export function useMonitor(): Monitor | undefined {
  const w = useWarehouse();
  const inv = useInventory();
  const products = useProducts();
  const tare = useTareTypes();
  return w ? monitorOf(w, inv, products, tare) : undefined;
}

/** Мониторинг любого склада (для обзора всех объектов). */
export function useMonitorOf(w: Warehouse): Monitor {
  const inv = useStore((s) => s.inventory[w.id]);
  const products = useProducts();
  const tare = useTareTypes();
  return monitorOf(w, inv, products, tare);
}

/** Подпись получателя/места тары по коду. */
export function usePartyName() {
  const consumers = useConsumers();
  return useMemo(() => (code?: string) => partyLabel(code, consumers), [consumers]);
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

export { cellsOf, warehouseBounds, duplicateAddresses } from './monitor';
