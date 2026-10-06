import type {
  Connection,
  Equipment,
  Floor,
  Mezzanine,
  PlaceKind,
  Pt,
  Rack,
  RackKind,
  Room,
  RoomKind,
  Tier,
  VirtualPlace,
  Warehouse,
  WarehouseKind,
  Zone,
  ZoneType,
} from '../types';
import { shapeTemplate } from './geometry';
import { uid } from './id';
import { newEquipment } from './equipment';

export { uid } from './id';

// ---------- Справочники структуры ----------

export interface RoomKindSpec {
  title: string;
  short: string;
  color: string;
  /** Есть стены (у двора и навеса — нет) */
  walls: boolean;
  /** Есть кровля без стен (навес) */
  roof: boolean;
  /** Цвет покрытия пола */
  floor: string;
}

export const ROOM_KINDS: Record<RoomKind, RoomKindSpec> = {
  storage: {
    title: 'Складское помещение',
    short: 'Склад',
    color: '#5b7fb5',
    walls: true,
    roof: false,
    floor: '#e9e5dc',
  },
  yard: { title: 'Дворовая территория', short: 'Двор', color: '#7a8a6a', walls: false, roof: false, floor: '#b9bdb6' },
  canopy: { title: 'Навес', short: 'Навес', color: '#b08a4f', walls: false, roof: true, floor: '#d9d3c6' },
  production: {
    title: 'Производственное помещение',
    short: 'Цех',
    color: '#8a6fb5',
    walls: true,
    roof: false,
    floor: '#e2e0e8',
  },
  office: { title: 'Офис / бытовое', short: 'Офис', color: '#4aa3c7', walls: true, roof: false, floor: '#e6edf0' },
  technical: {
    title: 'Техническое помещение',
    short: 'Тех.',
    color: '#8a8f99',
    walls: true,
    roof: false,
    floor: '#e4e4e4',
  },
};

export const ZONE_TYPES: Record<ZoneType, { title: string; color: string }> = {
  rack: { title: 'Стеллажное хранение', color: '#3b82f6' },
  floor: { title: 'Напольное хранение', color: '#14b8a6' },
  receiving: { title: 'Приёмка', color: '#f59e0b' },
  shipping: { title: 'Отгрузка', color: '#ef4444' },
  issue: { title: 'Выдача на кладовые производства', color: '#0ea5e9' },
  buffer: { title: 'Комплектация / буфер', color: '#06b6d4' },
  hazard: { title: 'ЛВЖ / опасные грузы', color: '#dc2626' },
  tare: { title: 'Тара', color: '#a16207' },
  quarantine: { title: 'Карантин / брак', color: '#9333ea' },
  other: { title: 'Прочее', color: '#94a3b8' },
};

export const PLACE_KINDS: Record<PlaceKind, string> = {
  storage: 'Место хранения',
  person: 'Выдано сотруднику',
  room: 'Кабинет / помещение',
  transit: 'В пути',
  repair: 'В ремонте',
  contractor: 'У подрядчика',
};

export const ROOM_COLORS = ['#5b7fb5', '#0ea5e9', '#a855f7', '#f97316', '#14b8a6', '#eab308'];
export const ZONE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

// ---------- Конструкторы ----------

export const newFloor = (index: number, elevation: number, height = 6): Floor => ({
  id: uid('f'),
  name: `${index + 1} этаж`,
  elevation,
  height,
});

export const defaultConnection = (): Connection => ({
  type: 'none',
  url: '',
  headers: '',
  interval: 60,
  path: '',
  mapping: {
    address: 'address',
    sku: 'sku',
    name: 'name',
    group: 'group',
    unit: 'unit',
    qty: 'qty',
    batch: 'batch',
    heat: 'heat',
    cert: 'cert',
    expiry: 'expiry',
    order: 'order',
    weight: 'weight',
    tare: 'tare',
    tareCount: 'tareCount',
    lastMove: 'lastMove',
    fill: 'fill',
  },
  active: false,
  pushUrl: '',
  demoTarget: 0.65,
  demoInterval: 4,
});

export function emptyWarehouse(name = 'Новый склад', kind: WarehouseKind = 'physical'): Warehouse {
  const now = Date.now();
  return {
    id: uid('w'),
    name,
    kind,
    address: '',
    description: '',
    createdAt: now,
    updatedAt: now,
    addressTemplate: '{rack}-{section}-{tier}-{cell}',
    pad: 2,
    floors: kind === 'physical' ? [{ ...newFloor(0, 0, 12), name: '1 этаж' }] : [],
    rooms: [],
    zones: [],
    racks: [],
    mezzanines: [],
    equipment: [],
    places: [],
    connection: defaultConnection(),
  };
}

export function newRoom(index: number, points = shapeTemplate('rect', 30, 20), kind: RoomKind = 'storage'): Room {
  return {
    id: uid('r'),
    name: `${ROOM_KINDS[kind].short} ${index + 1}`,
    code: `P${index + 1}`,
    kind,
    points,
    height: kind === 'yard' ? 6 : 10,
    elevation: 0,
    color: ROOM_KINDS[kind].color,
    fence: kind === 'yard' ? true : undefined,
  };
}

export function newZone(roomId: string, index: number, points: Pt[], height = 8, type: ZoneType = 'rack'): Zone {
  return {
    id: uid('z'),
    roomId,
    name: `${ZONE_TYPES[type].title} ${index + 1}`,
    code: `Z${index + 1}`,
    type,
    points,
    height,
    color: ZONE_TYPES[type].color,
    hazard: type === 'hazard' || undefined,
  };
}

export function newMezzanine(zoneId: string, x: number, y: number, index: number): Mezzanine {
  return {
    id: uid('m'),
    zoneId,
    name: `Мезонин ${index + 1}`,
    code: `МЗ${index + 1}`,
    x,
    y,
    rotation: 0,
    length: 12,
    width: 8,
    levels: 1,
    levelHeight: 3,
    deckLoad: 500,
    stairs: 'start',
    color: '#5b6b7f',
  };
}

export const newPlace = (index: number, kind: PlaceKind = 'storage'): VirtualPlace => ({
  id: uid('v'),
  code: `M${String(index + 1).padStart(2, '0')}`,
  name: `${PLACE_KINDS[kind]} ${index + 1}`,
  kind,
});

// ---------- Демо: центральный склад ТМЦ судостроительного завода ----------

const rect = (x1: number, y1: number, x2: number, y2: number): Pt[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

const tiers = (heights: number[], cells: number, maxLoad: number | number[], extra: Partial<Tier> = {}): Tier[] =>
  heights.map((height, i) => ({
    height,
    cells,
    maxLoad: Array.isArray(maxLoad) ? maxLoad[i] : maxLoad,
    ...extra,
  }));

interface RackSpecIn {
  zone: Zone;
  code: string;
  kind: RackKind;
  x: number;
  y: number;
  rotation?: number;
  sections: number;
  sectionLength: number;
  depth: number;
  tiers: Tier[];
  groundLevel?: boolean;
  maxLoad?: number;
  sectionLoad?: number;
  doubleSided?: boolean;
  mezzanineId?: string;
  deck?: number;
}

function mkRack(r: RackSpecIn): Rack {
  return {
    id: uid('k'),
    zoneId: r.zone.id,
    code: r.code,
    kind: r.kind,
    x: r.x,
    y: r.y,
    rotation: r.rotation ?? 0,
    sections: r.sections,
    sectionLength: r.sectionLength,
    depth: r.depth,
    groundLevel: r.groundLevel ?? r.kind !== 'shelf',
    tiers: r.tiers,
    overrides: {},
    maxLoad: r.maxLoad,
    sectionLoad: r.sectionLoad,
    doubleSided: r.doubleSided,
    mezzanineId: r.mezzanineId,
    deck: r.deck,
  };
}

function mkZone(
  room: Room,
  code: string,
  name: string,
  type: ZoneType,
  points: Pt[],
  height: number,
  extra: Partial<Zone> = {},
): Zone {
  return {
    id: uid('z'),
    roomId: room.id,
    name,
    code,
    type,
    points,
    height,
    color: ZONE_TYPES[type].color,
    ...(type === 'hazard' ? { hazard: true } : {}),
    ...extra,
  };
}

function mkRoom(
  name: string,
  code: string,
  kind: RoomKind,
  points: Pt[],
  height: number,
  floor: Floor,
  extra: Partial<Room> = {},
): Room {
  return {
    id: uid('r'),
    name,
    code,
    kind,
    points,
    height,
    floorId: floor.id,
    elevation: floor.elevation,
    color: ROOM_KINDS[kind].color,
    ...extra,
  };
}

/**
 * Демо: центральный склад ТМЦ судостроительного завода.
 * Корпус 1 — паллетное хранение, мезонин мелкоштучного хранения (3 уровня), зона выдачи на кладовые
 * производства, приёмка, карантин, тара. Отдельно — склад ЛВЖ (ЛКМ, ГСМ), склад газовых баллонов с
 * раздельными отсеками, навес для кабеля и труб, двухэтажный корпус полуфабрикатов и готовых изделий,
 * открытая площадка металлопроката.
 */
export function demoShipyard(): Warehouse {
  const w = emptyWarehouse('Центральный склад ТМЦ', 'physical');
  w.address = 'Судостроительный завод, промплощадка №1';
  w.description =
    'Склад обеспечения производства: металлопрокат, сварочные материалы, ЛКМ, газы, комплектующие, полуфабрикаты и готовые изделия.';
  w.connection.type = 'demo';
  w.connection.active = true;

  const f1: Floor = { id: uid('f'), name: '1 этаж', elevation: 0, height: 6 };
  const f2: Floor = { id: uid('f'), name: '2 этаж', elevation: 6, height: 4.5 };
  w.floors = [f1, f2];

  // ----- Помещения -----
  const k1 = mkRoom('Корпус 1 — склад ТМЦ', 'К1', 'storage', rect(0, 0, 60, 36), 12, f1, { temp: '+5…+25 °C' });
  const lvzh = mkRoom('Склад ЛВЖ (ЛКМ, ГСМ)', 'ЛВЖ', 'storage', rect(64, 0, 80, 14), 6, f1, {
    hazard: true,
    temp: '+5…+25 °C',
    color: '#d24c4c',
  });
  const gas = mkRoom('Склад газовых баллонов', 'ГБ', 'canopy', rect(64, 18, 80, 30), 4, f1, {
    hazard: true,
    fence: true,
    color: '#3b82f6',
  });
  const canopy = mkRoom('Навес: кабель и трубы', 'НВ', 'canopy', rect(84, 0, 104, 30), 7, f1);
  const k2a = mkRoom('Корпус 2 · 1 этаж — полуфабрикаты и изделия', 'К2', 'storage', rect(0, 54, 36, 78), 6, f1, {
    temp: '+5…+25 °C',
    color: '#0f9488',
  });
  const k2b = mkRoom('Корпус 2 · 2 этаж — комплектующие', 'К2Э', 'storage', rect(0, 54, 36, 78), 4.5, f2, {
    temp: '+15…+25 °C',
    color: '#7c5cd6',
  });
  const yard = mkRoom('Открытая площадка металлопроката', 'ДВ', 'yard', rect(40, 34, 104, 80), 6, f1, { fence: true });
  w.rooms = [k1, lvzh, gas, canopy, k2a, k2b, yard];

  // ----- Зоны -----
  const zPal = mkZone(k1, 'ПХ', 'Паллетное хранение', 'rack', rect(1.5, 1.5, 40, 22.5), 10.5);
  const zMez = mkZone(k1, 'МЗ', 'Мезонин мелкоштучного хранения', 'rack', rect(42, 1.5, 58.5, 14.5), 10, {
    color: '#6366f1',
  });
  const zIssue = mkZone(k1, 'ВЫД', 'Выдача на кладовые производства', 'issue', rect(42, 16, 58.5, 25.5), 3);
  const zRecv = mkZone(k1, 'ПР', 'Приёмка', 'receiving', rect(1.5, 25, 20, 34.5), 3);
  const zQuar = mkZone(k1, 'КР', 'Карантин / брак', 'quarantine', rect(21.5, 25, 31.5, 34.5), 3);
  const zTare = mkZone(k1, 'ТР', 'Тара', 'tare', rect(33, 25, 40, 34.5), 3);
  const zLvzh = mkZone(lvzh, 'ЛВЖ', 'ЛКМ и ГСМ', 'hazard', rect(65, 1, 79, 13), 4.5, { temp: '+5…+25 °C' });
  const zGasA = mkZone(gas, 'ГГ', 'Горючие газы', 'hazard', rect(64.8, 18.8, 71.6, 29.2), 3);
  const zGasB = mkZone(gas, 'КГ', 'Кислород и инертные газы', 'hazard', rect(72.4, 18.8, 79.2, 29.2), 3, {
    color: '#2563eb',
  });
  const zCable = mkZone(canopy, 'КБ', 'Кабель на барабанах', 'floor', rect(85, 1, 103, 14), 3, { groups: ['cable'] });
  const zPipe = mkZone(canopy, 'ТП', 'Трубы и трубные секции', 'rack', rect(85, 16, 103, 29), 6, {
    groups: ['metal', 'semi'],
  });
  const zSemi = mkZone(k2a, 'ПФ', 'Полуфабрикаты', 'floor', rect(1.5, 55.5, 20.5, 76.5), 5, { groups: ['semi'] });
  const zFin = mkZone(k2a, 'ГИ', 'Готовые изделия', 'floor', rect(22, 55.5, 34.5, 76.5), 5, {
    groups: ['finished'],
    color: '#15803d',
  });
  const zElec = mkZone(k2b, 'ЭЛ', 'Электротехника и КИП', 'rack', rect(1.5, 55.5, 34.5, 76.5), 3.5, {
    color: '#7c5cd6',
  });
  const zCant = mkZone(yard, 'КС', 'Сортовой прокат и трубы', 'rack', rect(42, 36, 70, 54), 5, { groups: ['metal'] });
  const zSheet = mkZone(yard, 'ЛП', 'Листовой прокат', 'floor', rect(72, 36, 102, 54), 2.5, { groups: ['metal'] });
  const zBig = mkZone(yard, 'КП', 'Крупногабаритные полуфабрикаты', 'floor', rect(42, 58, 70, 78), 6, {
    groups: ['semi', 'finished'],
  });
  const zYTare = mkZone(yard, 'ВТ', 'Возвратная тара', 'tare', rect(72, 58, 102, 78), 3);
  w.zones = [
    zPal,
    zMez,
    zIssue,
    zRecv,
    zQuar,
    zTare,
    zLvzh,
    zGasA,
    zGasB,
    zCable,
    zPipe,
    zSemi,
    zFin,
    zElec,
    zCant,
    zSheet,
    zBig,
    zYTare,
  ];

  // ----- Мезонин -----
  const mz: Mezzanine = {
    id: uid('m'),
    zoneId: zMez.id,
    name: 'Мезонин 3 уровня',
    code: 'МЗ',
    x: 50.25,
    y: 8,
    rotation: 0,
    length: 16,
    width: 12.5,
    levels: 2,
    levelHeight: 3.3,
    deckLoad: 500,
    stairs: 'start',
    color: '#5b6b7f',
  };
  w.mezzanines = [mz];

  // ----- Стеллажи -----
  const racks: Rack[] = [];
  const palletTiers = tiers([1700, 1500, 1500, 1500, 1400], 3, [1000, 1000, 1000, 1000, 800]);
  [3.2, 7.5, 8.7, 13, 14.2, 18.5, 19.7].forEach((y, i) =>
    racks.push(
      mkRack({
        zone: zPal,
        code: `А${i + 1}`,
        kind: 'pallet',
        x: 20.5,
        y,
        sections: 10,
        sectionLength: 2700,
        depth: 1100,
        tiers: palletTiers.map((t) => ({ ...t })),
        sectionLoad: 15000,
        maxLoad: 150000,
      }),
    ),
  );
  // Мезонин: уровень 1 (под настилом) и 2 — коробочное хранение, уровень 3 — штучное (инструмент)
  for (let deck = 0; deck <= 2; deck++) {
    [3, 5.7, 6.3, 9, 9.6, 12.3].forEach((y, i) =>
      racks.push(
        mkRack({
          zone: zMez,
          code: `М${deck + 1}${i + 1}`,
          kind: 'shelf',
          x: 51.4,
          y,
          sections: 10,
          sectionLength: 1200,
          depth: deck === 2 ? 500 : 600,
          groundLevel: false,
          tiers:
            deck === 2
              ? tiers([380, 380, 380, 380, 380], 2, 60, { cellType: 'shelf' })
              : tiers([420, 420, 420, 420, 420], 1, 150, { cellType: 'box' }),
          sectionLoad: deck === 2 ? 600 : 750,
          maxLoad: deck === 2 ? 6000 : 7500,
          mezzanineId: mz.id,
          deck,
        }),
      ),
    );
  }
  // Зона выдачи: места под комплекты для кладовых
  const issue = mkRack({
    zone: zIssue,
    code: 'В1',
    kind: 'floor',
    x: 50.25,
    y: 20,
    sections: 5,
    sectionLength: 2600,
    depth: 2400,
    tiers: tiers([1800], 2, 2000, { cellType: 'pallet', places: 2 }),
  });
  for (let s = 1; s <= 5; s++)
    for (let p = 1; p <= 2; p++)
      issue.overrides[`${s}.1.${p}`] = { reservedFor: `c-0${s}`, note: `Комплекты для К-0${s}` };
  racks.push(issue);
  racks.push(
    mkRack({
      zone: zRecv,
      code: 'ПР1',
      kind: 'floor',
      x: 10.75,
      y: 29.75,
      sections: 6,
      sectionLength: 1300,
      depth: 2600,
      tiers: tiers([1800], 2, 1500, { cellType: 'pallet', places: 1 }),
    }),
    mkRack({
      zone: zQuar,
      code: 'КР1',
      kind: 'floor',
      x: 26.5,
      y: 29.75,
      sections: 3,
      sectionLength: 1300,
      depth: 2600,
      tiers: tiers([1800], 2, 1500, { cellType: 'pallet', places: 1 }),
    }),
    mkRack({
      zone: zTare,
      code: 'Т1',
      kind: 'floor',
      x: 36.5,
      y: 29.75,
      sections: 2,
      sectionLength: 1400,
      depth: 5200,
      tiers: tiers([2200], 4, 2000, { cellType: 'floor', places: 3 }),
    }),
  );
  // Склад ЛВЖ
  [3, 7, 11].forEach((y, i) =>
    racks.push(
      mkRack({
        zone: zLvzh,
        code: `Л${i + 1}`,
        kind: 'pallet',
        x: 72,
        y,
        sections: 4,
        sectionLength: 2700,
        depth: 1100,
        tiers: tiers([1400, 1300, 1300], 3, 1000),
        // У стеллажа Л2 рамы слабее — допустимая нагрузка на секцию 6 т
        sectionLoad: i === 1 ? 6000 : 9000,
        maxLoad: 36000,
      }),
    ),
  );
  // Баллоны: горючие газы и кислород — в разных отсеках
  const cyl = (zone: Zone, code: string, x: number, y: number) =>
    mkRack({
      zone,
      code,
      kind: 'cylinder',
      x,
      y,
      sections: 3,
      sectionLength: 1300,
      depth: 560,
      tiers: tiers([1500], 1, 800, { cellType: 'cylinder' }),
    });
  racks.push(cyl(zGasA, 'Б1', 68.2, 21.5), cyl(zGasA, 'Б2', 68.2, 26.5));
  racks.push(cyl(zGasB, 'Б3', 75.8, 20.8), cyl(zGasB, 'Б4', 75.8, 24), cyl(zGasB, 'Б5', 75.8, 27.2));
  // Навес: кабель на барабанах и консольные стеллажи для труб
  [4.5, 10.5].forEach((y, i) =>
    racks.push(
      mkRack({
        zone: zCable,
        code: `Н${i + 1}`,
        kind: 'floor',
        x: 94,
        y,
        sections: 8,
        sectionLength: 1500,
        depth: 3000,
        tiers: tiers([1500], 2, 2500, { cellType: 'floor', places: 1 }),
      }),
    ),
  );
  const cant = (zone: Zone, code: string, x: number, y: number) =>
    mkRack({
      zone,
      code,
      kind: 'cantilever',
      x,
      y,
      sections: 2,
      sectionLength: 6000,
      depth: 1000,
      doubleSided: true,
      tiers: tiers([650, 650, 650, 650], 2, 2500),
      maxLoad: 40000,
    });
  racks.push(cant(zPipe, 'К4', 94, 19.5), cant(zPipe, 'К5', 94, 25.5));
  // Корпус 2, 1 этаж: полуфабрикаты и готовые изделия
  racks.push(
    mkRack({
      zone: zSemi,
      code: 'ПФ1',
      kind: 'floor',
      x: 11,
      y: 59,
      sections: 5,
      sectionLength: 3000,
      depth: 3000,
      tiers: tiers([2500], 1, 6000, { cellType: 'floor', places: 1 }),
    }),
    mkRack({
      zone: zSemi,
      code: 'ПФ2',
      kind: 'floor',
      x: 11,
      y: 65,
      sections: 5,
      sectionLength: 3000,
      depth: 3000,
      tiers: tiers([2500], 1, 6000, { cellType: 'floor', places: 1 }),
    }),
    mkRack({
      zone: zSemi,
      code: 'ПФ3',
      kind: 'pallet',
      x: 11,
      y: 72.5,
      sections: 5,
      sectionLength: 2700,
      depth: 1100,
      tiers: tiers([1500, 1300], 3, 1000),
      sectionLoad: 6000,
      maxLoad: 30000,
    }),
    mkRack({
      zone: zFin,
      code: 'ГИ1',
      kind: 'floor',
      x: 28.25,
      y: 60,
      sections: 3,
      sectionLength: 3500,
      depth: 3500,
      tiers: tiers([3000], 1, 8000, { cellType: 'floor', places: 1 }),
    }),
    mkRack({
      zone: zFin,
      code: 'ГИ2',
      kind: 'pallet',
      x: 28.25,
      y: 66.5,
      sections: 4,
      sectionLength: 2700,
      depth: 1100,
      tiers: tiers([1600, 1400, 1400], 3, 1000),
      sectionLoad: 9000,
      maxLoad: 36000,
    }),
    mkRack({
      zone: zFin,
      code: 'ГИ3',
      kind: 'floor',
      x: 28.25,
      y: 72.5,
      sections: 3,
      sectionLength: 3500,
      depth: 3000,
      tiers: tiers([2500], 1, 6000, { cellType: 'floor', places: 1 }),
    }),
  );
  // Корпус 2, 2 этаж: коробочное хранение электротехники
  [58, 60.7, 61.3, 64, 64.6, 67.3, 70, 70.6, 73.3].forEach((y, i) =>
    racks.push(
      mkRack({
        zone: zElec,
        code: `Э${i + 1}`,
        kind: 'shelf',
        x: 18,
        y,
        sections: 12,
        sectionLength: 1200,
        depth: 600,
        groundLevel: false,
        tiers: tiers([420, 420, 420, 420, 420], 1, 150, { cellType: 'box' }),
        sectionLoad: 750,
        maxLoad: 9000,
      }),
    ),
  );
  // Двор: консольные стеллажи, штабели листа, крупногабаритные полуфабрикаты, возвратная тара
  [39, 45, 51].forEach((y, i) => racks.push(cant(zCant, `К${i + 1}`, 56, y)));
  [40.5, 49.5].forEach((y, i) =>
    racks.push(
      mkRack({
        zone: zSheet,
        code: `Ш${i + 1}`,
        kind: 'floor',
        x: 87,
        y,
        sections: 3,
        sectionLength: 6500,
        depth: 4600,
        tiers: tiers([1500], 2, 20000, { cellType: 'floor', places: 0 }),
      }),
    ),
  );
  racks.push(
    mkRack({
      zone: zBig,
      code: 'ПК1',
      kind: 'floor',
      x: 56,
      y: 68,
      sections: 3,
      sectionLength: 7000,
      depth: 14000,
      tiers: tiers([5000], 2, 40000, { cellType: 'floor', places: 1 }),
    }),
    mkRack({
      zone: zYTare,
      code: 'Т2',
      kind: 'floor',
      x: 87,
      y: 68,
      sections: 6,
      sectionLength: 3000,
      depth: 6000,
      tiers: tiers([2500], 2, 3000, { cellType: 'floor', places: 4 }),
    }),
  );
  // Повреждённая балка — ячейка заблокирована (в демо-срезе в ней остался груз)
  const a3 = racks.find((r) => r.code === 'А3')!;
  a3.overrides['6.2.2'] = { blocked: true, note: 'Повреждена балка — заявка на ремонт' };
  a3.overrides['6.2.3'] = { blocked: true, note: 'Повреждена балка — заявка на ремонт' };
  w.racks = racks;

  // ----- Оборудование и окружение -----
  const eq: Equipment[] = [];
  const add = (e: Equipment, patch: Partial<Equipment> = {}) => eq.push({ ...e, ...patch });
  // Корпус 1: ворота и рампы на южной стене, фуры на подъезде
  [11, 36.5].forEach((x, i) => {
    add(newEquipment('gate', x, 36, 0, i + 1), { name: `Ворота ${i + 1}`, active: i === 0 });
    add(newEquipment('dock', x, 37.5, 0, i + 1), { name: `Рампа ${i + 1}`, active: i === 0 });
  });
  add(newEquipment('truck', 11, 45.5, 90, 1), { name: 'Фура: металлопрокат' });
  add(newEquipment('truck', 36.5, 45.5, 90, 2), { name: 'Фура: возврат тары', color: '#cbd5e1' });
  add(newEquipment('door', 60, 30, 90, 1), { name: 'Дверь к окнам выдачи' });
  // Окна выдачи на кладовые производства — у восточной стены
  [17.5, 20.5, 23.5].forEach((y, i) => {
    add(newEquipment('counter', 59.2, y, 90, i + 1), { name: `Окно выдачи ${i + 1}`, active: i < 2 });
    add(newEquipment('worker', 58.2, y, 90, i + 1), { name: `Кладовщик ${i + 1}` });
    if (i < 2) add(newEquipment('worker', 61, y, 270, i + 4), { name: `Представитель К-0${i + 1}`, color: '#2563eb' });
  });
  add(newEquipment('office', 47, 30.5, 0, 1), { name: 'Офис кладовщиков', length: 8, width: 5, height: 3 });
  add(newEquipment('toilet', 55, 31, 0, 1), { name: 'Бытовка', length: 4, width: 4, height: 3 });
  add(newEquipment('forklift', 14, 5.35, 0, 1), { name: 'Погрузчик 1' });
  add(newEquipment('forklift', 27, 10.85, 180, 2), { name: 'Погрузчик 2' });
  add(newEquipment('forklift', 30, 16.35, 0, 3), { name: 'Погрузчик 3', active: false, color: '#facc15' });
  add(newEquipment('worker', 8, 10.9, 0, 7), { name: 'Кладовщик 4' });
  add(newEquipment('worker', 44, 4.4, 90, 8), { name: 'Комплектовщик' });
  add(newEquipment('worker', 12, 27, 0, 9), { name: 'Приёмщик' });
  // ЛВЖ и баллоны
  add(newEquipment('gate', 72, 14, 0, 3), { name: 'Ворота ЛВЖ', length: 3, height: 3.5 });
  add(newEquipment('wall', 72, 24, 90, 1), {
    name: 'Противопожарная стена между отсеками',
    length: 12,
    height: 3,
    width: 0.25,
  });
  add(newEquipment('gate', 68, 30, 0, 4), { name: 'Калитка: горючие газы', length: 2, height: 2.2 });
  add(newEquipment('gate', 76, 30, 0, 5), { name: 'Калитка: кислород', length: 2, height: 2.2 });
  // Двор и навес
  add(newEquipment('gate', 40, 44, 90, 5), { name: 'Въезд на площадку', length: 6, height: 2.2, active: true });
  add(newEquipment('forklift', 72, 56, 0, 4), {
    name: 'Погрузчик 4 (двор)',
    length: 3.4,
    width: 1.6,
    height: 2.6,
    color: '#f97316',
  });
  add(newEquipment('truck', 60, 56, 0, 3), { name: 'Длинномер', color: '#e2e8f0' });
  add(newEquipment('worker', 50, 42.2, 0, 10), { name: 'Стропальщик' });
  add(newEquipment('worker', 86, 44, 0, 11), { name: 'Кладовщик площадки' });
  add(newEquipment('worker', 90, 7.5, 0, 12), { name: 'Электрик' });
  // Корпус 2
  add(newEquipment('gate', 18, 54, 0, 6), { name: 'Ворота корпуса 2', active: true });
  add(newEquipment('forklift', 11, 69, 0, 5), { name: 'Погрузчик 5', active: false });
  add(newEquipment('worker', 28, 63.5, 0, 13), { name: 'Контролёр ОТК' });
  add(newEquipment('worker', 18, 62.65, 0, 14), { name: 'Кладовщик 2 этажа', floorId: f2.id });
  // Озеленение
  for (let x = 44; x <= 100; x += 8) add(newEquipment('tree', x, 83, 0, 1), { name: 'Дерево' });
  for (let y = 4; y <= 32; y += 7) add(newEquipment('tree', -4, y, 0, 1), { name: 'Дерево' });
  add(newEquipment('tree', 38.5, 70, 0, 1), { name: 'Дерево' });
  w.equipment = eq;
  return w;
}

// ---------- Демо: виртуальный IT-склад ----------

/** Виртуальный склад: только места учёта (склад IT, серверная, сотрудники, ремонт, в пути). */
export function demoIT(): Warehouse {
  const w = emptyWarehouse('IT-склад (виртуальный)', 'virtual');
  w.address = 'Заводоуправление, каб. 214';
  w.description = 'Учёт IT-оборудования по местам: склад, серверная, выдано сотрудникам, ремонт, в пути.';
  w.connection.type = 'demo';
  w.connection.active = true;
  const p = (code: string, name: string, kind: PlaceKind, note?: string): VirtualPlace => ({
    id: uid('v'),
    code,
    name,
    kind,
    note,
  });
  w.places = [
    p('IT-СКЛ', 'Склад IT, каб. 214', 'storage', 'Новое оборудование и подменный фонд'),
    p('IT-ЦОД', 'Серверная (ЦОД), корп. 3', 'room'),
    p('IT-ОГТ', 'Выдано: отдел главного технолога', 'person', 'Иванов С. П.'),
    p('IT-БУХ', 'Выдано: бухгалтерия', 'person', 'Петрова А. В.'),
    p('IT-Ц07', 'Выдано: цех №7, мастера участков', 'person', 'Морозов Д. В.'),
    p('IT-СКЛ1', 'Выдано: центральный склад ТМЦ', 'person', 'ТСД и принтеры этикеток'),
    p('IT-РЕМ', 'В ремонте (сервисный центр)', 'repair'),
    p('IT-ПУТЬ', 'В пути от поставщика', 'transit'),
  ];
  return w;
}
