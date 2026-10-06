import { describe, expect, it } from 'vitest';
import type { Product, Rack, Warehouse } from '../types';
import { demoIT, demoShipyard, emptyWarehouse, newZone, newRoom } from './demo';
import { DEMO_CONSUMERS, DEMO_PRODUCTS } from './catalog';
import { DEFAULT_TARE } from './materials';
import { buildCells, defaultPlaces, rackCells, rackContext, rackHeight, rackWarnings, tierBases } from './rack';
import { cellFill, cellUsage, emptyInventory, rackLoads, tareBalances, unitsFit } from './inventory';
import { checkPlacement } from './control';
import { demoSnapshot, demoTick } from './demoData';
import { cellsOf, monitorOf, productsMap, tareMap } from './monitor';
import { importSnapshot, parseCSV, parseDate, toCSV } from './snapshot';
import { locationStats } from './analytics';
import { shapeTemplate } from './geometry';

const ctx = { products: productsMap(DEMO_PRODUCTS), tareTypes: tareMap(DEFAULT_TARE), consumers: DEMO_CONSUMERS };
const P = (id: string) => DEMO_PRODUCTS.find((p) => p.id === id)!;

function smallWarehouse(rack: Partial<Rack>): { w: Warehouse; r: Rack } {
  const w = emptyWarehouse('Тест');
  const room = newRoom(0, shapeTemplate('rect', 20, 10));
  room.floorId = w.floors[0].id;
  const zone = newZone(room.id, 0, shapeTemplate('rect', 20, 10), 8);
  const r: Rack = {
    id: 'r1',
    zoneId: zone.id,
    code: 'A',
    kind: 'pallet',
    x: 10,
    y: 5,
    rotation: 0,
    sections: 2,
    sectionLength: 2700,
    depth: 1100,
    groundLevel: true,
    tiers: [
      { height: 1500, cells: 3, maxLoad: 1000 },
      { height: 1500, cells: 3, maxLoad: 1000 },
    ],
    overrides: {},
    ...rack,
  };
  w.rooms = [room];
  w.zones = [zone];
  w.racks = [r];
  return { w, r };
}

describe('ячейки стеллажа: Ш×Г×В, тип, места', () => {
  it('паллетный стеллаж: Ш = секция / ячейки, Г = глубина, одно паллетоместо', () => {
    const { w, r } = smallWarehouse({});
    const cells = rackCells(w, r);
    expect(cells).toHaveLength(12);
    const c = cells[0];
    expect([c.width, c.depth, c.height]).toEqual([900, 1100, 1500]);
    expect(c.cellType).toBe('pallet');
    expect(c.places).toBe(1);
    expect(c.address).toBe('A-01-01-01');
  });

  it('нижний ярус на полу, следующий — над балкой', () => {
    const { r } = smallWarehouse({});
    expect(tierBases(r)).toEqual([0, 1620]);
    expect(rackHeight(r)).toBe(3120);
  });

  it('консольный двусторонний: ячейки — стороны, Г — вылет консоли', () => {
    const { w, r } = smallWarehouse({
      kind: 'cantilever',
      sections: 1,
      sectionLength: 6000,
      depth: 1000,
      doubleSided: true,
      tiers: [{ height: 650, cells: 2, maxLoad: 2000 }],
    });
    const cells = rackCells(w, r);
    expect(cells).toHaveLength(2);
    expect(cells.every((c) => c.cellType === 'cantilever' && c.width === 6000 && c.depth === 1000)).toBe(true);
    // стороны А и Б по разные стороны колонны
    const [a, b] = cells;
    expect(Math.sign(a.cz - 5)).not.toBe(Math.sign(b.cz - 5));
  });

  it('места по размерам: коробочная полка 1200×600 — три короба 600×400', () => {
    expect(defaultPlaces('box', 1200, 600, 420)).toBe(3);
    expect(defaultPlaces('cylinder', 1300, 560, 1500)).toBe(10);
    expect(defaultPlaces('shelf', 1000, 500, 380)).toBe(0);
  });

  it('стеллаж на мезонине стоит на настиле', () => {
    const w = demoShipyard();
    const r = w.racks.find((x) => x.code === 'М21')!;
    const base = rackContext(w, r).base;
    expect(base).toBeCloseTo(3.3 + 0.06, 5);
    expect(rackCells(w, r)[0].bottom).toBeGreaterThan(3.3);
  });

  it('помещения второго этажа поднимаются на отметку этажа', () => {
    const w = demoShipyard();
    const cells = buildCells(w);
    const top = cells.find((c) => c.address.startsWith('Э1-'))!;
    expect(top.bottom).toBeGreaterThanOrEqual(6);
  });

  it('в демо-складе нет предупреждений конструктора и повторов адресов', () => {
    const w = demoShipyard();
    for (const r of w.racks) expect(rackWarnings(w, r), r.code).toEqual([]);
    const cells = buildCells(w);
    expect(new Set(cells.map((c) => c.address)).size).toBe(cells.length);
  });
});

describe('заполнение, места и нагрузка', () => {
  it('заполнение — по местам или нагрузке, что больше', () => {
    const { w, r } = smallWarehouse({});
    const c = rackCells(w, r)[0];
    const usage = cellUsage(
      { stock: { [c.address]: { 'p-weld350': 1 } } },
      ctx.products,
      new Map([[c.address, c]]),
      ctx.tareTypes,
    );
    expect(cellFill(c, usage.get(c.address))).toBe(1);
    const half = cellUsage(
      { stock: { [c.address]: { 'p-flux': 500 } } },
      ctx.products,
      new Map([[c.address, c]]),
      ctx.tareTypes,
    );
    expect(cellFill(c, half.get(c.address))).toBe(1); // одна паллета — место занято целиком
  });

  it('сколько ещё помещается: по местам и допустимой нагрузке', () => {
    const { w, r } = smallWarehouse({});
    const c = rackCells(w, r)[0];
    expect(unitsFit(c, undefined, P('p-weld350'))).toBe(1); // одно паллетоместо — один полуавтомат
    expect(unitsFit(c, undefined, P('p-pf115'))).toBe(0); // ЛКМ вне зоны ЛВЖ нельзя
    expect(unitsFit(c, undefined, P('p-flux'))).toBe(1000); // флюс ограничен нагрузкой 1 000 кг
  });

  it('нагрузка на секции и стеллаж', () => {
    const { w, r } = smallWarehouse({ sectionLoad: 1500 });
    const cells = rackCells(w, r);
    const stock = { [cells[0].address]: { 'p-flux': 900 }, [cells[1].address]: { 'p-flux': 900 } };
    const usage = cellUsage({ stock }, ctx.products, new Map(cells.map((c) => [c.address, c])), ctx.tareTypes);
    const loads = rackLoads(cells, usage);
    expect(loads.get(r.id)?.sections.get(1)).toBe(1800);
    const v = checkPlacement({
      cells,
      usage,
      products: ctx.products,
      batches: {},
      racks: [r],
      loads,
      lastMove: {},
      now: Date.now(),
    });
    expect(v.map((x) => x.kind)).toContain('sectionOverload');
  });

  it('статистика по типам ячеек и гистограмма', () => {
    const w = demoShipyard();
    const inv = demoSnapshot(w, ctx, Date.now(), 3);
    const { cells, byAddress } = cellsOf(w);
    const usage = cellUsage(inv, ctx.products, byAddress, ctx.tareTypes);
    const s = locationStats(cells, usage, ctx.products).all;
    expect(s.cells).toBe(cells.length);
    expect(s.hist.reduce((a, b) => a + b, 0)).toBe(cells.length);
    expect(Object.keys(s.byType).sort()).toEqual(['box', 'cantilever', 'cylinder', 'floor', 'pallet', 'shelf']);
    expect(s.fill).toBeGreaterThan(0.3);
    expect(s.fill).toBeLessThan(0.85);
  });
});

describe('контроль размещения', () => {
  const w = demoShipyard();
  const inv = demoSnapshot(w, ctx, Date.now(), 7);
  const m = monitorOf(w, inv, DEMO_PRODUCTS, DEFAULT_TARE);
  const kinds = new Set(m.violations.map((v) => v.kind));

  it('находит намеренные нарушения демо-среза', () => {
    for (const k of [
      'overload',
      'sectionOverload',
      'blockedFilled',
      'hazard',
      'gasMix',
      'expired',
      'expiring',
      'places',
      'mixed',
      'cellType',
      'nonHazard',
      'zoneGroup',
      'idle',
    ])
      expect(kinds, k).toContain(k);
  });

  it('кислород в отсеке горючих газов — критичное нарушение', () => {
    const v = m.violations.find((x) => x.kind === 'gasMix')!;
    expect(v.address.startsWith('Б2')).toBe(true);
    expect(m.worst.get(v.address)).toBe('critical');
  });

  it('демо-поток не создаёт новых нарушений', () => {
    const copy: typeof inv = JSON.parse(JSON.stringify(inv));
    const idx = cellsOf(w);
    let t = Date.now();
    for (let i = 0; i < 600; i++)
      demoTick(copy, { w, cells: idx.cells, byAddress: idx.byAddress, ctx, now: (t += 4000) });
    const after = monitorOf(w, copy, DEMO_PRODUCTS, DEFAULT_TARE);
    const before = new Set(
      m.violations.filter((v) => v.kind !== 'idle' && v.kind !== 'expiring').map((v) => v.kind + v.address),
    );
    const fresh = after.violations.filter(
      (v) => v.kind !== 'idle' && v.kind !== 'expiring' && !before.has(v.kind + v.address),
    );
    expect(fresh).toEqual([]);
    expect(copy.events.length).toBeGreaterThan(inv.events.length);
  });
});

describe('тара и баллоны', () => {
  it('баланс: под товаром, пустые, у кладовых, на заправке', () => {
    const w = demoShipyard();
    const inv = demoSnapshot(w, ctx, Date.now(), 5);
    const b = tareBalances(inv, ctx.products);
    const o2 = b.get('t-o2')!;
    expect(o2.atConsumers).toBe(42);
    expect(o2.atSuppliers).toBe(24);
    expect(o2.underGoods).toBeGreaterThan(0);
    const eur = b.get('t-eur')!;
    expect(eur.underGoods).toBeGreaterThan(100);
    expect(eur.empty).toBeGreaterThan(0);
  });
});

describe('импорт среза из учётной системы', () => {
  const { w } = smallWarehouse({});
  const { cells } = cellsOf(w);
  const mapping = demoShipyard().connection.mapping;

  it('CSV с плавками, датами, тарой и неизвестными адресами', () => {
    const csv = toCSV(
      [
        'address',
        'sku',
        'name',
        'group',
        'unit',
        'qty',
        'batch',
        'heat',
        'expiry',
        'weight',
        'tare',
        'tareCount',
        'lastMove',
      ],
      [
        [
          'a-01-01-01',
          'ТР-57×4',
          'Труба 57×4',
          'металлопрокат',
          'т',
          '1,25',
          'П-1',
          '2Т-11',
          '',
          '1250',
          '',
          '',
          '01.09.2026',
        ],
        ['A-01-01-02', 'НОВЫЙ-1', 'Новая позиция', 'ЛКМ', 'кг', '40', '', '', '31.12.2026', '40', '', '', ''],
        ['A-02-01-01', '', '', '', '', '', '', '', '', '', 'EUR', '12', ''],
        ['Z-99', 'ТР-57×4', '', '', '', '1', '', '', '', '', '', '', ''],
      ],
    );
    const rows = parseCSV(csv);
    const r = importSnapshot(rows, mapping, cells, DEMO_PRODUCTS, DEFAULT_TARE, undefined, { replace: true });
    expect(r.received).toBe(4);
    expect(r.matched).toBe(3);
    expect(r.unmatched).toEqual(['Z-99']);
    expect(r.newProducts.map((p: Product) => p.sku)).toEqual(['НОВЫЙ-1']);
    expect(r.newProducts[0].group).toBe('paint');
    const items = r.inventory.stock['A-01-01-01'];
    const [key, qty] = Object.entries(items)[0];
    expect(qty).toBe(1.25);
    expect(r.inventory.batches[key.split('~')[1]].heat).toBe('2Т-11');
    expect(r.inventory.tare['A-02-01-01']).toEqual({ 't-eur': 12 });
    expect(r.inventory.lastMove['A-01-01-01']).toBe(new Date(2026, 8, 1).getTime());
  });

  it('частичное обновление меняет только пришедшие ячейки', () => {
    const prev = { ...emptyInventory(), stock: { 'A-01-01-01': { 'p-flux': 100 }, 'A-01-01-02': { 'p-flux': 200 } } };
    const r = importSnapshot(
      [{ address: 'A-01-01-01', sku: 'ФЛ-АН348', qty: 300 }],
      mapping,
      cells,
      DEMO_PRODUCTS,
      DEFAULT_TARE,
      prev,
      { replace: false },
    );
    expect(r.inventory.stock['A-01-01-01']).toEqual({ 'p-flux': 300 });
    expect(r.inventory.stock['A-01-01-02']).toEqual({ 'p-flux': 200 });
  });

  it('заполненность без содержимого (только процент)', () => {
    const r = importSnapshot(
      [{ address: 'A-01-02-01', fill: '75%' }],
      mapping,
      cells,
      DEMO_PRODUCTS,
      DEFAULT_TARE,
      undefined,
      { replace: true },
    );
    expect(r.inventory.fills?.['A-01-02-01']).toBe(0.75);
    const m = monitorOf(w, r.inventory, DEMO_PRODUCTS, DEFAULT_TARE);
    expect(m.fill.get('A-01-02-01')).toBe(0.75);
  });

  it('разбор дат', () => {
    expect(parseDate('05.03.2027')).toBe(new Date(2027, 2, 5).getTime());
    expect(parseDate('2026-10-06T10:00:00Z')).toBe(Date.parse('2026-10-06T10:00:00Z'));
    expect(parseDate(1700000000)).toBe(1700000000000);
  });
});

describe('виртуальный склад', () => {
  it('места учёта — это ячейки без координат, оборудование по серийным номерам', () => {
    const w = demoIT();
    const inv = demoSnapshot(w, ctx, Date.now(), 2);
    const m = monitorOf(w, inv, DEMO_PRODUCTS, DEFAULT_TARE);
    expect(m.idx.cells.every((c) => c.virtual)).toBe(true);
    expect(m.idx.cells.map((c) => c.address)).toContain('IT-ЦОД');
    const nb = Object.entries(inv.stock['IT-СКЛ']).filter(([k]) => k.startsWith('p-nb~'));
    expect(nb.length).toBe(9);
    expect(nb.every(([, q]) => q === 1)).toBe(true);
  });
});
