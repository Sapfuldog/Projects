import { describe, expect, it } from 'vitest';
import { pointInPolygon, polygonArea, polygonInside, selfIntersects, shapeTemplate } from './geometry';
import { buildCells, formatAddress, rackCells, rackHeight, rackLength, rackWarnings, tierBases } from './rack';
import { extractRows, mapRecord, matchRecords, parseCSV, toCSV, computeStats } from './fill';
import { demoWarehouse, emptyWarehouse, newRoom, newZone } from './demo';
import { generateRows, nextCode } from './layout';
import type { Rack } from '../types';

describe('геометрия', () => {
  it('площадь Г-образного помещения', () => {
    // 60×44 минус вырез 30×22
    expect(polygonArea(shapeTemplate('L', 60, 44))).toBeCloseTo(60 * 44 - 30 * 22);
  });
  it('точка внутри / снаружи', () => {
    const L = shapeTemplate('L', 60, 44);
    expect(pointInPolygon({ x: 10, y: 40 }, L)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 40 }, L)).toBe(false);
  });
  it('вложенность и самопересечение', () => {
    const outer = shapeTemplate('rect', 10, 10);
    expect(polygonInside(shapeTemplate('rect', 4, 4, 1, 1), outer)).toBe(true);
    expect(polygonInside(shapeTemplate('rect', 4, 4, 8, 8), outer)).toBe(false);
    expect(
      selfIntersects([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBe(true);
    expect(selfIntersects(outer)).toBe(false);
  });
});

const rack = (patch: Partial<Rack> = {}): Rack => ({
  id: 'k1',
  zoneId: 'z1',
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
    { height: 1200, cells: 2, maxLoad: 800 },
  ],
  overrides: {},
  ...patch,
});

describe('стеллажи и ячейки', () => {
  it('габариты стеллажа', () => {
    const r = rack();
    expect(rackLength(r)).toBe(2 * 2700 + 3 * 90);
    expect(tierBases(r)).toEqual([0, 1500 + 120]);
    expect(rackHeight(r)).toBe(1500 + 120 + 1200);
    expect(tierBases(rack({ groundLevel: false }))[0]).toBe(120);
  });

  it('ячейки получают ДШВГ яруса и адрес по шаблону', () => {
    const w = emptyWarehouse();
    w.racks = [rack({ overrides: { '2.1.3': { blocked: true }, '1.2.1': { maxLoad: 500 } } })];
    const cells = rackCells(w, w.racks[0]);
    expect(cells).toHaveLength(2 * (3 + 2));
    const c = cells.find((x) => x.address === 'A-01-02-01')!;
    expect(c).toMatchObject({ length: 1350, width: 1100, height: 1200, maxLoad: 500 });
    expect(cells.find((x) => x.address === 'A-02-01-03')!.blocked).toBe(true);
    expect(cells.find((x) => x.address === 'A-01-01-01')!.length).toBe(900);
  });

  it('шаблон адреса', () => {
    expect(
      formatAddress('{room}.{zone}.{rack}/{section}{tier}{cell}', 3, {
        room: 'A',
        zone: 'Z',
        rack: 'R1',
        section: 1,
        tier: 2,
        cell: 10,
      }),
    ).toBe('A.Z.R1/001002010');
  });

  it('предупреждение о высоте зоны', () => {
    const w = emptyWarehouse();
    const room = newRoom(0, shapeTemplate('rect', 30, 20));
    const zone = newZone(room.id, 0, shapeTemplate('rect', 28, 18, 1, 1), 2.5);
    w.rooms = [room];
    w.zones = [zone];
    w.racks = [rack({ zoneId: zone.id })];
    expect(rackWarnings(w, w.racks[0]).some((t) => t.includes('высоты зоны'))).toBe(true);
    w.zones[0] = { ...zone, height: 3 };
    expect(rackWarnings(w, w.racks[0])).toEqual([]);
  });

  it('демо-склад без дублей адресов и в границах зон', () => {
    const w = demoWarehouse();
    const cells = buildCells(w);
    expect(cells.length).toBeGreaterThan(1000);
    expect(new Set(cells.map((c) => c.address)).size).toBe(cells.length);
    for (const r of w.racks) expect(rackWarnings(w, r)).toEqual([]);
  });

  it('генератор рядов укладывается в зону', () => {
    const zone = newZone('r', 0, shapeTemplate('rect', 40, 20), 10);
    const racks = generateRows(zone, {
      template: 'pallet-3',
      orientation: 0,
      rows: 3,
      auto: true,
      backToBack: true,
      aisle: 3,
      backGap: 0.2,
      margin: 1,
      sections: 5,
      autoSections: true,
      startCode: 'A',
    });
    expect(racks.length).toBeGreaterThan(3);
    expect(racks.map((r) => r.code).slice(0, 3)).toEqual(['A', 'B', 'C']);
    const w = emptyWarehouse();
    w.rooms = [{ ...newRoom(0, shapeTemplate('rect', 40, 20)), id: 'r', height: 12 }];
    w.zones = [zone];
    w.racks = racks;
    for (const r of racks) expect(rackWarnings(w, r)).toEqual([]);
  });

  it('коды рядов', () => {
    expect(nextCode('A', 25)).toBe('Z');
    expect(nextCode('Z', 1)).toBe('AA');
    expect(nextCode('R09', 2)).toBe('R11');
  });
});

describe('заполнение', () => {
  const m = {
    address: 'address',
    fill: 'fill',
    qty: 'qty',
    capacity: 'capacity',
    weight: 'weight',
    sku: 'sku',
    name: 'name',
  };

  it('заполненность из процентов, долей и количества', () => {
    expect(mapRecord({ address: 'X', fill: 80 }, m)!.data.fill).toBeCloseTo(0.8);
    expect(mapRecord({ address: 'X', fill: '45%' }, m)!.data.fill).toBeCloseTo(0.45);
    expect(mapRecord({ address: 'X', fill: 0.3 }, m)!.data.fill).toBeCloseTo(0.3);
    expect(mapRecord({ address: 'X', qty: 10, capacity: 40 }, m)!.data.fill).toBeCloseTo(0.25);
    expect(mapRecord({ address: 'X', qty: '3' }, { ...m, fill: '' })!.data.fill).toBe(1);
    expect(mapRecord({ fill: 1 }, m)).toBeNull();
  });

  it('вложенный путь и словарь', () => {
    expect(extractRows({ data: { items: [{ a: 1 }] } }, 'data.items')).toEqual([{ a: 1 }]);
    expect(extractRows({ 'A-1': { fill: 1 } }, '')).toEqual([{ address: 'A-1', fill: 1 }]);
  });

  it('сопоставление с ячейками без учёта регистра, суммирование', () => {
    const w = emptyWarehouse();
    w.racks = [rack()];
    const cells = buildCells(w);
    const res = matchRecords(
      [
        { address: 'a-01-01-01', fill: 0.4, weight: 100, sku: 'S1' },
        { address: 'A-01-01-01', fill: 0.3, weight: 50, sku: 'S2' },
        { address: 'NOPE', fill: 1 },
      ],
      { mapping: m },
      cells,
    );
    expect(res.received).toBe(3);
    expect(res.matched).toBe(1);
    expect(res.unmatched).toEqual(['NOPE']);
    expect(res.fills['A-01-01-01']).toMatchObject({ weight: 150, sku: 'S1, S2' });
    expect(res.fills['A-01-01-01'].fill).toBeCloseTo(0.7);
    const stats = computeStats(cells, res.fills).all;
    expect(stats.occupied).toBe(1);
    expect(stats.total).toBe(cells.length);
  });

  it('CSV из Excel (;, кавычки, BOM) туда и обратно', () => {
    const csv = toCSV(
      ['address', 'name'],
      [
        ['A-1', 'Вода; "газ"'],
        ['B-2', 'Сок'],
      ],
    );
    expect(parseCSV(csv)).toEqual([
      { address: 'A-1', name: 'Вода; "газ"' },
      { address: 'B-2', name: 'Сок' },
    ]);
    expect(parseCSV('address,fill\nA,50\n')).toEqual([{ address: 'A', fill: '50' }]);
  });
});
