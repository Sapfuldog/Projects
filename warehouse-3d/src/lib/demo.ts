import type { Connection, Rack, Room, Warehouse, Zone } from '../types';
import { shapeTemplate } from './geometry';
import { defaultTiers } from './rack';

let counter = 0;
export const uid = (prefix = '') =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const ROOM_COLORS = ['#64748b', '#0ea5e9', '#a855f7', '#f97316', '#14b8a6', '#eab308'];
export const ZONE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export const ZONE_TYPES: Record<Zone['type'], string> = {
  rack: 'Стеллажное хранение',
  floor: 'Напольное хранение',
  receiving: 'Приёмка',
  shipping: 'Отгрузка',
  buffer: 'Буфер / комплектация',
  other: 'Прочее',
};

export const defaultConnection = (): Connection => ({
  type: 'none',
  url: '',
  headers: '',
  interval: 30,
  path: '',
  mapping: {
    address: 'address',
    fill: 'fill',
    qty: 'qty',
    capacity: 'capacity',
    weight: 'weight',
    sku: 'sku',
    name: 'name',
  },
  active: false,
  pushUrl: '',
  demoTarget: 0.65,
  demoInterval: 3,
});

export function emptyWarehouse(name = 'Новый склад'): Warehouse {
  const now = Date.now();
  return {
    id: uid('w'),
    name,
    address: '',
    description: '',
    createdAt: now,
    updatedAt: now,
    addressTemplate: '{rack}-{section}-{tier}-{cell}',
    pad: 2,
    rooms: [],
    zones: [],
    racks: [],
    connection: defaultConnection(),
  };
}

export function newRoom(index: number, points = shapeTemplate('rect', 30, 20)): Room {
  return {
    id: uid('r'),
    name: `Помещение ${index + 1}`,
    code: `P${index + 1}`,
    points,
    height: 10,
    elevation: 0,
    color: ROOM_COLORS[index % ROOM_COLORS.length],
  };
}

export function newZone(roomId: string, index: number, points: Zone['points'], height = 8): Zone {
  return {
    id: uid('z'),
    roomId,
    name: `Зона ${index + 1}`,
    code: `Z${index + 1}`,
    type: 'rack',
    points,
    height,
    color: ZONE_COLORS[index % ZONE_COLORS.length],
  };
}

/** Демонстрационный склад: Г-образный корпус + антресоль-помещение, несколько зон и рядов стеллажей. */
export function demoWarehouse(): Warehouse {
  const w = emptyWarehouse('Демо-склад «Северный»');
  w.address = 'г. Москва, ул. Складская, 1';
  w.description = 'Пример: Г-образный корпус с паллетным хранением, зона мелкоштучного хранения и приёмка.';
  w.connection.type = 'demo';
  w.connection.active = true;

  const main: Room = {
    ...newRoom(0, shapeTemplate('L', 60, 44)),
    name: 'Корпус А',
    code: 'A',
    height: 12,
  };
  const small: Room = {
    ...newRoom(1, shapeTemplate('rect', 22, 18, 34, 26)),
    name: 'Корпус Б (мелкоштучка)',
    code: 'B',
    height: 6,
  };
  w.rooms = [main, small];

  const rect = (x1: number, y1: number, x2: number, y2: number) => [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
  const zPallet: Zone = { ...newZone(main.id, 0, rect(2, 2, 58, 17), 10.5), name: 'Паллетное хранение', code: 'PAL' };
  const zRecv: Zone = {
    ...newZone(main.id, 2, rect(32, 18, 58, 21), 3),
    name: 'Приёмка / отгрузка',
    code: 'RCV',
    type: 'receiving',
    color: '#f59e0b',
  };
  const zPallet2: Zone = {
    ...newZone(main.id, 1, rect(2, 19, 28, 42), 8),
    name: 'Паллетное хранение (низкое)',
    code: 'PL2',
    color: '#22c55e',
  };
  const zShelf: Zone = {
    ...newZone(small.id, 3, rect(36, 28, 54, 42), 2.6),
    name: 'Мелкоштучное хранение',
    code: 'SH',
    color: '#8b5cf6',
  };
  w.zones = [zPallet, zPallet2, zRecv, zShelf];

  const racks: Rack[] = [];
  const letters = 'ABCDEFGHIJKLMNOP';
  // Высокие паллетные ряды: одиночный + две пары «спина к спине»
  [3, 7.6, 8.8, 13.4, 14.6].forEach((y, i) => {
    racks.push({
      id: uid('k'),
      zoneId: zPallet.id,
      code: letters[i],
      kind: 'pallet',
      x: 30,
      y,
      rotation: 0,
      sections: 18,
      sectionLength: 2700,
      depth: 1100,
      groundLevel: true,
      tiers: defaultTiers(5, 1700, 3, 1000),
      overrides: {},
    });
  });
  // Низкие ряды, повёрнутые на 90°
  [3.2, 7.8, 9, 13.6, 14.8, 19.4, 20.6, 25.2].forEach((x, i) => {
    racks.push({
      id: uid('k'),
      zoneId: zPallet2.id,
      code: letters[5 + i],
      kind: 'pallet',
      x,
      y: 30.5,
      rotation: 90,
      sections: 9,
      sectionLength: 1825,
      depth: 1100,
      groundLevel: true,
      tiers: [
        { height: 1600, cells: 2, maxLoad: 1000 },
        { height: 1400, cells: 2, maxLoad: 800 },
        { height: 1400, cells: 2, maxLoad: 800 },
        { height: 1400, cells: 2, maxLoad: 600 },
      ],
      overrides: {},
    });
  });
  // Полочные стеллажи (мелкоштучное хранение)
  [30, 30.7, 34, 34.7, 38, 38.7].forEach((y, i) => {
    racks.push({
      id: uid('k'),
      zoneId: zShelf.id,
      code: `M${i + 1}`,
      kind: 'shelf',
      x: 45,
      y,
      rotation: 0,
      sections: 12,
      sectionLength: 1200,
      depth: 600,
      groundLevel: false,
      tiers: defaultTiers(6, 350, 3, 80),
      overrides: {},
    });
  });
  // Пример заблокированных ячеек (колонна здания)
  racks[2].overrides['9.1.2'] = { blocked: true, note: 'Колонна' };
  racks[2].overrides['9.2.2'] = { blocked: true, note: 'Колонна' };
  w.racks = racks;
  return w;
}
