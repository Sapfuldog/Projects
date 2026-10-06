import { describe, expect, it } from 'vitest';
import { demoWarehouse } from './demo';
import { buildCells } from './rack';
import {
  applyOp,
  cellUsage,
  cellVolume,
  emptyInventory,
  fillsFromInventory,
  planDoc,
  productTotals,
  stockStatus,
  suggestPicking,
  suggestPlacement,
  unitsFit,
} from './inventory';
import { DEMO_PRODUCTS, generateDemoInventory } from './demoInventory';
import { categoryShares, dailySeries, kpis, stockDelta, turnover } from './analytics';
import { buildAlerts } from './alerts';
import type { Doc, Product } from '../types';

const w = demoWarehouse();
const cells = buildCells(w);
const tv: Product = { ...DEMO_PRODUCTS[0], max: 1000, min: 100 };
const cable: Product = { ...DEMO_PRODUCTS.find((p) => p.id === 'p-cable')!, max: 1000, min: 100 };
const pm = new Map([tv, cable].map((p) => [p.id, p]));

describe('размещение и отбор', () => {
  it('ячейка вмещает товар по объёму и по грузоподъёмности', () => {
    const c = cells.find((x) => x.address === 'A-01-01-01')!;
    const byVol = Math.floor((cellVolume(c) * 0.9) / tv.volume);
    const byW = Math.floor(c.maxLoad / tv.weight);
    expect(unitsFit(c, undefined, tv)).toBe(Math.min(byVol, byW));
    expect(unitsFit({ ...c, blocked: true }, undefined, tv)).toBe(0);
  });

  it('крупный товар — на нижние ярусы, мелкий — в маленькие ячейки, без превышения Г', () => {
    const inv = emptyInventory();
    const big = suggestPlacement(cells, cellUsage(inv.stock, pm), tv, 50);
    expect(big.rest).toBe(0);
    expect(big.plan.every((l) => cells.find((c) => c.address === l.address)!.tier === 1)).toBe(true);
    const small = suggestPlacement(cells, cellUsage(inv.stock, pm), cable, 500);
    expect(small.rest).toBe(0);
    expect(small.plan.every((l) => l.address.startsWith('M'))).toBe(true);
    for (const l of [...big.plan, ...small.plan])
      applyOp(inv.stock, {
        type: 'receipt',
        productId: [...pm.keys()][l.address.startsWith('M') ? 1 : 0],
        qty: l.qty,
        to: l.address,
      });
    const usage = cellUsage(inv.stock, pm);
    for (const c of cells) {
      const u = usage.get(c.address);
      if (!u) continue;
      expect(u.weight).toBeLessThanOrEqual(c.maxLoad);
      expect(u.volume).toBeLessThanOrEqual(cellVolume(c));
    }
  });

  it('повторная приёмка дозаполняет ячейки с тем же товаром', () => {
    const inv = emptyInventory();
    applyOp(inv.stock, { type: 'receipt', productId: tv.id, qty: 2, to: 'A-01-01-01' });
    const plan = suggestPlacement(cells, cellUsage(inv.stock, pm), tv, 3).plan;
    expect(plan[0]).toEqual({ address: 'A-01-01-01', qty: 3 });
  });

  it('отбор начинается с почти пустых ячеек и не уходит в минус', () => {
    const inv = emptyInventory();
    applyOp(inv.stock, { type: 'receipt', productId: tv.id, qty: 10, to: 'A-01-01-01' });
    applyOp(inv.stock, { type: 'receipt', productId: tv.id, qty: 3, to: 'A-01-01-02' });
    const r = suggestPicking(inv.stock, tv.id, 20);
    expect(r.plan).toEqual([
      { address: 'A-01-01-02', qty: 3 },
      { address: 'A-01-01-01', qty: 10 },
    ]);
    expect(r.rest).toBe(7);
    for (const l of r.plan) applyOp(inv.stock, { type: 'shipment', productId: tv.id, qty: l.qty, from: l.address });
    expect(inv.stock).toEqual({});
  });

  it('план документа учитывает предыдущие строки', () => {
    const inv = emptyInventory();
    const doc: Doc = {
      id: 'd1',
      kind: 'receipt',
      number: 'П-1',
      status: 'new',
      partner: 'x',
      createdAt: 0,
      lines: [
        { productId: tv.id, qty: 30 },
        { productId: tv.id, qty: 30 },
      ],
    };
    const { lines, ops } = planDoc(doc, cells, inv, pm);
    const addrs = ops.map((o) => o.to);
    const fill = new Map<string, number>();
    ops.forEach((o) => fill.set(o.to!, (fill.get(o.to!) ?? 0) + o.qty));
    for (const [a, q] of fill)
      expect(q).toBeLessThanOrEqual(
        unitsFit(
          cells.find((c) => c.address === a)!,
          undefined,
          tv,
        ),
      );
    expect(lines.every((l) => l.rest === 0)).toBe(true);
    expect(addrs.length).toBeGreaterThan(1);
  });

  it('статус остатка', () => {
    expect(stockStatus(tv, 0)).toBe('out');
    expect(stockStatus(tv, 50)).toBe('low');
    expect(stockStatus(tv, 500)).toBe('ok');
  });
});

describe('демо-данные и аналитика', () => {
  const now = new Date('2026-10-06T19:00:00').getTime();
  const { inventory: inv, products } = generateDemoInventory(w, DEMO_PRODUCTS, now);
  const map = new Map(products.map((p) => [p.id, p]));

  it('остатки согласованы с журналом операций', () => {
    const replay = emptyInventory().stock;
    for (const e of [...inv.events].sort((a, b) => a.at - b.at)) applyOp(replay, e);
    expect(replay).toEqual(inv.stock);
    for (const items of Object.values(inv.stock)) for (const q of Object.values(items)) expect(q).toBeGreaterThan(0);
  });

  it('ячейки не перегружены по объёму, заполнение 0..1', () => {
    const fills = fillsFromInventory(cells, inv, map);
    const usage = cellUsage(inv.stock, map);
    expect(Object.keys(fills).length).toBeGreaterThan(500);
    for (const c of cells) {
      const u = usage.get(c.address);
      if (u) expect(u.volume).toBeLessThanOrEqual(cellVolume(c) * 0.9 + 1e-6);
      const f = fills[c.address];
      if (f) (expect(f.fill).toBeGreaterThan(0), expect(f.fill).toBeLessThanOrEqual(1));
    }
  });

  it('ряд по дням заканчивается текущим остатком', () => {
    const s = dailySeries(inv, 30, now);
    let total = 0;
    productTotals(inv).forEach((t) => (total += t.qty));
    expect(s).toHaveLength(30);
    expect(s[29].stock).toBe(total);
    // остаток вчера + изменения сегодня = остаток сегодня
    const today = inv.events.filter((e) => e.at >= s[29].day).reduce((acc, e) => acc + stockDelta(e), 0);
    expect(s[28].stock + today).toBe(total);
  });

  it('KPI, категории, оборот и ABC', () => {
    const k = kpis(inv, products, now);
    expect(k.totalQty).toBeGreaterThan(0);
    expect(k.receipts7).toBeGreaterThan(0);
    expect(k.shipments7).toBeGreaterThan(0);
    const cats = categoryShares(inv, products);
    expect(cats.length).toBeLessThanOrEqual(5);
    const t = turnover(inv, products, 30, now);
    expect(t[0].abc).toBe('A');
    expect(t.some((x) => x.abc === 'C')).toBe(true);
  });

  it('уведомления о документах в работе', () => {
    const alerts = buildAlerts(inv, products, cells, fillsFromInventory(cells, inv, map));
    expect(alerts.some((a) => a.id === 'receipts')).toBe(true);
    expect(alerts.some((a) => a.id === 'orders')).toBe(true);
  });
});
