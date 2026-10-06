// Модель данных. Координаты на плане — в метрах (x вправо, y вниз),
// размеры стеллажей и ячеек — в миллиметрах, грузоподъёмность — в кг.

export interface Pt {
  x: number;
  y: number;
}

/** Помещение склада: произвольный многоугольник на плане + высота потолка. */
export interface Room {
  id: string;
  name: string;
  code: string;
  points: Pt[];
  /** Высота помещения (до потолка/ферм), м */
  height: number;
  /** Отметка пола относительно нуля объекта (для многоэтажных складов), м */
  elevation: number;
  color: string;
}

export type ZoneType = 'rack' | 'floor' | 'receiving' | 'shipping' | 'buffer' | 'other';

/** Зона размещения внутри помещения с ограничением по высоте. */
export interface Zone {
  id: string;
  roomId: string;
  name: string;
  code: string;
  type: ZoneType;
  points: Pt[];
  /** Максимальная высота размещения в зоне, м */
  height: number;
  color: string;
}

/** Ярус стеллажа. Все ячейки яруса одинаковые. */
export interface Tier {
  /** Полезная (в свету) высота яруса = В ячейки, мм */
  height: number;
  /** Количество ячеек в одной секции на этом ярусе */
  cells: number;
  /** Грузоподъёмность одной ячейки = Г, кг */
  maxLoad: number;
}

export type RackKind = 'pallet' | 'shelf';

/** Индивидуальные настройки конкретной ячейки (перекрывают настройки яруса). */
export interface CellOverride {
  blocked?: boolean;
  maxLoad?: number;
  note?: string;
}

/** Стеллаж: секции по длине × ярусы по высоте × ячейки в секции. */
export interface Rack {
  id: string;
  zoneId: string;
  code: string;
  kind: RackKind;
  /** Центр стеллажа на плане, м */
  x: number;
  y: number;
  /** Поворот на плане, градусы (по часовой стрелке) */
  rotation: number;
  /** Количество секций (пролётов) */
  sections: number;
  /** Длина секции в свету (между стойками) = Д секции, мм */
  sectionLength: number;
  /** Глубина стеллажа = Ш ячейки, мм */
  depth: number;
  /** Нижний ярус стоит на полу (без балки) */
  groundLevel: boolean;
  tiers: Tier[];
  /** Ключ — `${секция}.${ярус}.${ячейка}` (с 1) */
  overrides: Record<string, CellOverride>;
}

export type ConnectionType = 'none' | 'internal' | 'demo' | 'rest' | 'ws' | 'file';

export interface FieldMapping {
  address: string;
  fill: string;
  qty: string;
  capacity: string;
  weight: string;
  sku: string;
  name: string;
}

export interface Connection {
  type: ConnectionType;
  /** REST/WebSocket адрес */
  url: string;
  /** Заголовки запроса в JSON, например {"Authorization": "Bearer ..."} */
  headers: string;
  /** Период опроса REST, сек */
  interval: number;
  /** Путь к массиву в ответе, например `data.items` (пусто — корень) */
  path: string;
  mapping: FieldMapping;
  /** Автообновление включено */
  active: boolean;
  /** Куда отправлять структуру ячеек (POST), необязательно */
  pushUrl: string;
  /** Демо: средняя целевая заполненность, 0..1 */
  demoTarget: number;
  /** Демо: период обновления, сек */
  demoInterval: number;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** Шаблон адреса ячейки: {room} {zone} {rack} {section} {tier} {cell} */
  addressTemplate: string;
  /** До скольки знаков дополнять номера нулями */
  pad: number;
  rooms: Room[];
  zones: Zone[];
  racks: Rack[];
  equipment: Equipment[];
  connection: Connection;
}

// ---------- Оборудование и элементы здания ----------

export type EquipmentType =
  | 'wall'
  | 'partition'
  | 'door'
  | 'gate'
  | 'column'
  | 'dock'
  | 'conveyor'
  | 'forklift'
  | 'truck'
  | 'workzone'
  | 'office'
  | 'toilet';

/** Объект конструктора: стена, ворота, рампа, конвейер, погрузчик, офис… Размеры в метрах. */
export interface Equipment {
  id: string;
  type: EquipmentType;
  name: string;
  /** Центр на плане, м */
  x: number;
  y: number;
  rotation: number;
  /** Длина (вдоль оси), ширина (поперёк), высота, м */
  length: number;
  width: number;
  height: number;
  color: string;
  /** Рампа занята / погрузчик в движении */
  active?: boolean;
}

// ---------- Товары, остатки и операции ----------

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  /** Вес единицы, кг */
  weight: number;
  /** Объём единицы, л */
  volume: number;
  /** Минимальный остаток — ниже него уведомление */
  min: number;
  /** Норма (100%) для шкалы остатка */
  max: number;
  /** Цена за единицу, ₽ */
  price: number;
  barcode?: string;
}

export type OpType = 'receipt' | 'shipment' | 'move' | 'count';

/** Складская операция — строка журнала. */
export interface OpEvent {
  id: string;
  at: number;
  type: OpType;
  productId: string;
  /** Количество (для инвентаризации — расхождение со знаком) */
  qty: number;
  from?: string;
  to?: string;
  docId?: string;
  user: string;
}

export type DocKind = 'receipt' | 'order';
export type DocStatus = 'new' | 'progress' | 'done' | 'cancelled';

export interface DocLine {
  productId: string;
  qty: number;
}

/** Документ: поставка (приход) или заказ (отгрузка). */
export interface Doc {
  id: string;
  kind: DocKind;
  number: string;
  status: DocStatus;
  partner: string;
  createdAt: number;
  doneAt?: number;
  lines: DocLine[];
  note?: string;
}

export interface Inventory {
  /** Остатки: адрес ячейки → товар → количество */
  stock: Record<string, Record<string, number>>;
  events: OpEvent[];
  docs: Doc[];
  seq: number;
}

/** Данные о заполнении ячейки, полученные из подключения. */
export interface CellFill {
  /** Заполненность 0..1 */
  fill: number;
  weight?: number;
  qty?: number;
  sku?: string;
  name?: string;
  updatedAt: number;
}

export interface SyncStatus {
  at: number;
  source: string;
  received: number;
  matched: number;
  unmatched: string[];
  error?: string;
}

/** Ячейка, вычисленная из структуры стеллажа. */
export interface Cell {
  /** `${rackId}:${s}.${t}.${p}` */
  key: string;
  address: string;
  rackId: string;
  zoneId: string;
  roomId: string;
  section: number;
  tier: number;
  pos: number;
  /** Д × Ш × В, мм */
  length: number;
  width: number;
  height: number;
  /** Г, кг */
  maxLoad: number;
  blocked: boolean;
  note?: string;
  /** Центр ячейки в 3D, м (x, высота, z) */
  cx: number;
  cy: number;
  cz: number;
  /** Поворот вокруг вертикали, рад (3D) */
  rotY: number;
}

export type Step = 'objects' | 'rooms' | 'zones' | 'racks' | 'cells' | 'equipment' | 'other' | 'connect' | 'fill';

export type Section = 'home' | 'warehouse' | 'stock' | 'inbound' | 'orders' | 'analytics' | 'settings';

export type Selection =
  | { kind: 'room'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'rack'; id: string }
  | { kind: 'cell'; id: string; rackId: string }
  | { kind: 'equipment'; id: string }
  | null;

export type ColorMode = 'fill' | 'load' | 'sku' | 'zone';
