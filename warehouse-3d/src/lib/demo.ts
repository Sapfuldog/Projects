import type { Connection, Equipment, Rack, Room, Warehouse, Zone } from '../types';
import { shapeTemplate } from './geometry';
import { defaultTiers } from './rack';
import { uid } from './id';
import { newEquipment } from './equipment';

export { uid } from './id';

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
    equipment: [],
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

/**
 * Демонстрационный склад: Г-образный корпус с паллетным хранением, приёмкой у трёх доков,
 * корпус мелкоштучного хранения с офисом и упаковкой. Заполнение — по внутреннему учёту.
 */
export function demoWarehouse(): Warehouse {
  const w = emptyWarehouse('Склад №1 — Основной');
  w.address = 'г. Москва, ул. Складская, 1';
  w.description = 'Г-образный корпус с паллетным хранением, док-станции, корпус мелкоштучного хранения.';
  w.connection.type = 'internal';

  const main: Room = { ...newRoom(0, shapeTemplate('L', 60, 44)), name: 'Корпус А', code: 'A', height: 12 };
  const small: Room = { ...newRoom(1, shapeTemplate('rect', 22, 18, 34, 26)), name: 'Корпус Б', code: 'B', height: 6 };
  w.rooms = [main, small];

  const rect = (x1: number, y1: number, x2: number, y2: number) => [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
  const zPallet: Zone = { ...newZone(main.id, 0, rect(2, 2, 54, 17), 10.5), name: 'Зона хранения A', code: 'PAL' };
  const zPallet2: Zone = {
    ...newZone(main.id, 1, rect(2, 19, 28, 42), 8),
    name: 'Зона хранения B',
    code: 'PL2',
    color: '#22c55e',
  };
  const zRecv: Zone = {
    ...newZone(main.id, 2, rect(55.5, 2, 59.5, 21), 3),
    name: 'Погрузочная зона',
    code: 'DOCK',
    type: 'receiving',
    color: '#f59e0b',
  };
  const zShelf: Zone = {
    ...newZone(small.id, 3, rect(36, 32, 54, 42), 2.6),
    name: 'Мелкоштучное хранение',
    code: 'SH',
    color: '#8b5cf6',
  };
  const zPack: Zone = {
    ...newZone(small.id, 4, rect(44, 26.5, 50, 31), 2),
    name: 'Секция сборки',
    code: 'PACK',
    type: 'buffer',
    color: '#06b6d4',
  };
  w.zones = [zPallet, zPallet2, zRecv, zShelf, zPack];

  const racks: Rack[] = [];
  const letters = 'ABCDEFGHIJKLMNOP';
  // Высокие паллетные ряды: одиночный + две пары «спина к спине»
  [3, 7.6, 8.8, 13.4, 14.6].forEach((y, i) => {
    racks.push({
      id: uid('k'),
      zoneId: zPallet.id,
      code: letters[i],
      kind: 'pallet',
      x: 28,
      y,
      rotation: 0,
      sections: 16,
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
  // Полочные стеллажи
  [34, 34.7, 38.5, 39.2].forEach((y, i) => {
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
  // Колонна здания в ряду C
  racks[2].overrides['8.1.2'] = { blocked: true, note: 'Колонна' };
  racks[2].overrides['8.2.2'] = { blocked: true, note: 'Колонна' };
  w.racks = racks;

  const eq: Equipment[] = [];
  const add = (e: Equipment, patch: Partial<Equipment> = {}) => eq.push({ ...e, ...patch });
  // Доки на правой стене корпуса А: ворота, рампа и фура
  [5, 10.5, 16].forEach((y, i) => {
    add(newEquipment('gate', 60, y, 90, i + 1), { name: `Ворота ${i + 1}`, active: i < 2 });
    add(newEquipment('dock', 61.5, y, 270, i + 1), { name: `Рампа ${i + 1}`, active: i < 2 });
    if (i < 2) add(newEquipment('truck', 70, y, 0, i + 1), { name: `Фура ${i + 1}`, color: i ? '#e2e8f0' : '#cbd5e1' });
  });
  add(newEquipment('conveyor', 57.5, 11.5, 90, 1), { length: 14 });
  add(newEquipment('forklift', 20, 5.3, 0, 1), { name: 'Погрузчик 1' });
  add(newEquipment('forklift', 36, 11.1, 180, 2), { name: 'Погрузчик 2' });
  add(newEquipment('forklift', 5.5, 30, 90, 3), { name: 'Погрузчик 3', color: '#facc15' });
  add(newEquipment('forklift', 52, 19.5, 0, 4), { name: 'Погрузчик 4', active: false });
  // Корпус Б: офис, упаковка, санузел, двери
  add(newEquipment('office', 39.5, 28.75, 0, 1), { name: 'Офис склада', length: 7, width: 4.5 });
  add(newEquipment('workzone', 47, 28.75, 0, 1), { name: 'Столы упаковки', length: 5, width: 3 });
  add(newEquipment('toilet', 53, 28.25, 0, 1), { name: 'Санузел', height: 3 });
  add(newEquipment('door', 45, 22, 0, 1), { name: 'Дверь А' });
  add(newEquipment('door', 45, 26, 0, 2), { name: 'Дверь Б' });
  w.equipment = eq;
  return w;
}
