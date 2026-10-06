// Модель данных. Координаты на плане — в метрах (x вправо, y вниз), размеры стеллажей
// и ячеек — в миллиметрах, нагрузка — в кг.
// Обозначения: Ш — ширина ячейки (вдоль ряда), Г — глубина, В — высота, Д — длина стеллажа.

export interface Pt {
  x: number;
  y: number;
}

// ---------- Здания, этажи, помещения ----------

/** Этаж (уровень) здания. */
export interface Floor {
  id: string;
  name: string;
  /** Отметка пола, м */
  elevation: number;
  /** Высота этажа до перекрытия, м */
  height: number;
}

/** Вид помещения: складское, дворовая территория (открытая площадка), навес и т. д. */
export type RoomKind = 'storage' | 'yard' | 'canopy' | 'production' | 'office' | 'technical';

export interface Room {
  id: string;
  name: string;
  code: string;
  kind: RoomKind;
  points: Pt[];
  /** Высота помещения, м (для двора — допустимая высота штабеля) */
  height: number;
  /** Этаж; отметка пола берётся из этажа */
  floorId?: string;
  /** Отметка пола, если этаж не задан, м */
  elevation: number;
  color: string;
  /** Помещение для ЛВЖ / пожароопасных ТМЦ */
  hazard?: boolean;
  /** Температурный режим, например «+5…+25 °C» */
  temp?: string;
  /** Ограждение (для дворовой территории) */
  fence?: boolean;
}

export type ZoneType =
  'rack' | 'floor' | 'receiving' | 'shipping' | 'issue' | 'buffer' | 'hazard' | 'tare' | 'quarantine' | 'other';

/** Зона размещения внутри помещения с ограничением по высоте и условиями хранения. */
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
  hazard?: boolean;
  temp?: string;
  /** Допустимые группы ТМЦ (пусто — любые) */
  groups?: MaterialGroup[];
}

// ---------- Стеллажи, мезонины, ячейки ----------

/**
 * Тип ячейки: паллетная (паллетоместа), коробочная (короба/ящики), полочная (штучное хранение
 * без тары), консольная (длинномер), напольная (штабель), баллонная (газовые баллоны),
 * виртуальная (место учёта без адреса).
 */
export type CellType = 'pallet' | 'box' | 'shelf' | 'cantilever' | 'floor' | 'cylinder' | 'virtual';

/** Вид стеллажа. Напольное хранение — блок мест на полу; баллонная стойка — места для баллонов. */
export type RackKind = 'pallet' | 'shelf' | 'cantilever' | 'floor' | 'cylinder';

/** Ярус стеллажа. Все ячейки яруса одинаковые. */
export interface Tier {
  /** Высота яруса в свету = В ячейки, мм */
  height: number;
  /** Количество ячеек в секции на ярусе */
  cells: number;
  /** Допустимая нагрузка на ячейку, кг */
  maxLoad: number;
  /** Тип ячеек яруса (по умолчанию — по виду стеллажа) */
  cellType?: CellType;
  /** Мест в ячейке (паллет, коробов, баллонов); не задано — по размерам, 0 — без мест (по объёму и весу) */
  places?: number;
}

/** Индивидуальные настройки конкретной ячейки. */
export interface CellOverride {
  blocked?: boolean;
  maxLoad?: number;
  note?: string;
  /** Закреплена за кладовой (id получателя) или товаром */
  reservedFor?: string;
  cellType?: CellType;
  places?: number;
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
  /** Ширина секции в свету (между стойками), мм */
  sectionLength: number;
  /** Глубина стеллажа = Г ячейки, мм (для консольного — вылет консоли) */
  depth: number;
  /** Нижний ярус стоит на полу (без балки) */
  groundLevel: boolean;
  tiers: Tier[];
  /** Ключ — `${секция}.${ярус}.${ячейка}` (с 1) */
  overrides: Record<string, CellOverride>;
  /** Допустимая нагрузка на весь стеллаж, кг */
  maxLoad?: number;
  /** Допустимая нагрузка на секцию (раму), кг */
  sectionLoad?: number;
  /** Консольный стеллаж: двусторонний */
  doubleSided?: boolean;
  /** Стоит на мезонине: id мезонина и номер настила (1…) */
  mezzanineId?: string;
  deck?: number;
}

/** Мезонин: многоуровневая конструкция с настилами, лестницей и ограждением. */
export interface Mezzanine {
  id: string;
  zoneId: string;
  name: string;
  code: string;
  /** Центр на плане, м */
  x: number;
  y: number;
  rotation: number;
  /** Длина и ширина площадки, м */
  length: number;
  width: number;
  /** Число настилов над полом */
  levels: number;
  /** Высота между настилами, м */
  levelHeight: number;
  /** Нагрузка на настил, кг/м² */
  deckLoad: number;
  /** С какого торца лестница */
  stairs: 'start' | 'end';
  color: string;
}

// ---------- Виртуальные склады ----------

export type PlaceKind = 'storage' | 'person' | 'room' | 'transit' | 'repair' | 'contractor';

/** Место учёта виртуального склада (без координат): кабинет, сотрудник, «в ремонте», «в пути». */
export interface VirtualPlace {
  id: string;
  code: string;
  name: string;
  kind: PlaceKind;
  note?: string;
}

// ---------- Подключение к учётной системе ----------

/** Источник среза: нет, демо-поток (имитация учётной системы), REST, WebSocket, файл CSV/JSON. */
export type ConnectionType = 'none' | 'demo' | 'rest' | 'ws' | 'file';

/** Сопоставление полей среза остатков из учётной системы (1С, WMS) с полями приложения. */
export interface FieldMapping {
  address: string;
  sku: string;
  name: string;
  group: string;
  unit: string;
  qty: string;
  batch: string;
  heat: string;
  cert: string;
  expiry: string;
  order: string;
  weight: string;
  tare: string;
  tareCount: string;
  lastMove: string;
  /** Заполненность 0..1 или % — если система отдаёт только её */
  fill: string;
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

export type WarehouseKind = 'physical' | 'virtual';

export interface Warehouse {
  id: string;
  name: string;
  /** Физический склад (здания, двор) или виртуальный (только учёт по местам) */
  kind: WarehouseKind;
  address: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** Шаблон адреса ячейки: {room} {zone} {rack} {section} {tier} {cell} */
  addressTemplate: string;
  /** До скольки знаков дополнять номера нулями */
  pad: number;
  floors: Floor[];
  rooms: Room[];
  zones: Zone[];
  racks: Rack[];
  mezzanines: Mezzanine[];
  equipment: Equipment[];
  /** Места учёта виртуального склада */
  places: VirtualPlace[];
  connection: Connection;
}

// ---------- Оборудование и элементы окружения ----------

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
  | 'toilet'
  | 'counter'
  | 'worker'
  | 'tree';

/** Объект конструктора: стена, ворота, рампа, окно выдачи, погрузчик, офис… Размеры в метрах. */
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
  /** Этаж (для многоэтажных зданий) */
  floorId?: string;
  /** Рампа занята / погрузчик в движении / окно открыто */
  active?: boolean;
}

// ---------- ТМЦ, тара, партии ----------

export type MaterialGroup =
  | 'metal'
  | 'welding'
  | 'paint'
  | 'gas'
  | 'valves'
  | 'hardware'
  | 'cable'
  | 'electro'
  | 'tools'
  | 'consumables'
  | 'ppe'
  | 'parts'
  | 'equipment'
  | 'chem'
  | 'it'
  | 'semi'
  | 'finished'
  | 'general';

/** Как хранится: на паллете, в коробе, штучно на полке, длинномер, штабелем, в баллонах. */
export type StorageUnit = 'pallet' | 'box' | 'piece' | 'long' | 'bulk' | 'cylinder';

/** Учёт: без партий, по партиям (плавки, сроки годности), по серийным/инвентарным номерам. */
export type Tracking = 'none' | 'batch' | 'serial';

/** Дополнительная единица: 1 [unit] = factor базовых единиц. */
export interface AltUnit {
  unit: string;
  factor: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  group: MaterialGroup;
  category: string;
  /** Базовая единица учёта: т, кг, м, шт, л, пар, компл… */
  unit: string;
  units?: AltUnit[];
  /** Вес 1 базовой единицы, кг */
  weight: number;
  /** Объём 1 базовой единицы, л */
  volume: number;
  storage: StorageUnit;
  /** Тара хранения (поддон, короб, барабан, бочка…) */
  tareTypeId?: string;
  /** Базовых единиц на одной таре */
  perTare?: number;
  tracking: Tracking;
  /** Срок годности, дней */
  shelfLife?: number;
  /** ЛВЖ / опасный груз */
  hazard?: boolean;
  /** Характеристики: марка стали, ГОСТ, RAL, размер… */
  attrs?: Record<string, string>;
  /** Минимальный остаток — ниже него уведомление */
  min: number;
  /** Норма (100%) для шкалы остатка */
  max: number;
  /** Цена за базовую единицу, ₽ */
  price: number;
  barcode?: string;
  /** Цвет изделия/тары для 3D */
  color?: string;
}

export type TareKind = 'pallet' | 'box' | 'bin' | 'drum' | 'reel' | 'cassette' | 'bag' | 'ibc' | 'cylinder';

/** Вид тары: поддон, короб, ящик, бочка, барабан, кассета, газовый баллон… */
export interface TareType {
  id: string;
  code: string;
  name: string;
  kind: TareKind;
  /** Цвет окраски (для баллонов — по виду газа) */
  color?: string;
  /** Габариты, мм */
  length: number;
  width: number;
  height: number;
  /** Вес пустой тары, кг */
  weight: number;
  /** Возвратная (учитывается у контрагентов) */
  returnable: boolean;
  price: number;
}

/** Партия: плавка и сертификат для проката, срок годности для ЛКМ, серийный номер для оборудования. */
export interface Batch {
  id: string;
  productId: string;
  number: string;
  receivedAt: number;
  expiry?: number;
  heat?: string;
  cert?: string;
  supplier?: string;
  /** Заказ / строительный номер судна (для полуфабрикатов и изделий) */
  order?: string;
}

/** Получатель: кладовая производства (цеха, участка). */
export interface Consumer {
  id: string;
  code: string;
  name: string;
  shop: string;
  responsible?: string;
  /** Месячные лимиты: товар → количество в базовых единицах */
  limits?: Record<string, number>;
}

/** Вид движения в журнале (для мониторинга активности ячеек). */
export type OpType = 'receipt' | 'shipment' | 'issue' | 'return' | 'move' | 'count' | 'writeoff' | 'tare';

/** Движение из учётной системы — для ленты событий и графиков активности. */
export interface OpEvent {
  id: string;
  at: number;
  type: OpType;
  productId?: string;
  batchId?: string;
  tareTypeId?: string;
  /** Количество (для инвентаризации и тары — изменение со знаком) */
  qty: number;
  from?: string;
  to?: string;
  user: string;
  /** Контрагент или кладовая */
  party?: string;
  note?: string;
}

/** Срез остатков склада, полученный из учётной системы. */
export interface Inventory {
  /** Остатки: адрес ячейки → ключ (товар или товар~партия) → количество в базовых единицах */
  stock: Record<string, Record<string, number>>;
  batches: Record<string, Batch>;
  /** Пустая тара: место (адрес ячейки или «@код» кладовой/поставщика) → вид тары → шт */
  tare: Record<string, Record<string, number>>;
  /** Журнал движений (если учётная система его передаёт) */
  events: OpEvent[];
  /** Дата последнего движения по ячейке */
  lastMove: Record<string, number>;
  /** Когда получен срез */
  updatedAt: number;
  /** История заполнения: точка на каждый день, когда приходил срез */
  history: HistoryPoint[];
  /** Заполненность ячеек 0..1, если учётная система передаёт только её (без содержимого) */
  fills?: Record<string, number>;
}

export interface HistoryPoint {
  at: number;
  cells: number;
  occupied: number;
  places: number;
  usedPlaces: number;
  /** Вес, т */
  weight: number;
}

/** Данные о заполнении ячейки (внешняя система или внутренний учёт). */
export interface CellFill {
  /** Заполненность 0..1 */
  fill: number;
  weight?: number;
  qty?: number;
  sku?: string;
  name?: string;
  /** Занято мест (паллет/коробов) */
  used?: number;
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

/** Ячейка, вычисленная из структуры стеллажа (или место учёта виртуального склада). */
export interface Cell {
  /** `${rackId}:${s}.${t}.${p}` */
  key: string;
  address: string;
  rackId: string;
  zoneId: string;
  roomId: string;
  floorId?: string;
  section: number;
  tier: number;
  pos: number;
  /** Ш × Г × В, мм */
  width: number;
  depth: number;
  height: number;
  /** Допустимая нагрузка, кг */
  maxLoad: number;
  cellType: CellType;
  /** Мест (паллет/коробов); 0 — учёт по объёму */
  places: number;
  blocked: boolean;
  note?: string;
  reservedFor?: string;
  hazard: boolean;
  /** Центр ячейки в 3D, м (x, высота, z) */
  cx: number;
  cy: number;
  cz: number;
  /** Поворот вокруг вертикали, рад (3D) */
  rotY: number;
  /** Отметка низа ячейки, м */
  bottom: number;
  virtual?: boolean;
}

export type Step =
  | 'objects'
  | 'rooms'
  | 'zones'
  | 'racks'
  | 'mezzanine'
  | 'cells'
  | 'equipment'
  | 'other'
  | 'places'
  | 'connect'
  | 'fill';

export type Section = 'home' | 'warehouse' | 'cells' | 'items' | 'tare' | 'control' | 'analytics' | 'settings';

export type Selection =
  | { kind: 'room'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'rack'; id: string }
  | { kind: 'cell'; id: string; rackId: string }
  | { kind: 'equipment'; id: string }
  | { kind: 'mezzanine'; id: string }
  | null;

/** Окраска груза в 3D: натуральная, по заполнению, нагрузке, группе ТМЦ, контролю, давности движения. */
export type ColorMode = 'real' | 'fill' | 'load' | 'group' | 'control' | 'age';
