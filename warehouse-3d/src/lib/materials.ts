import type { CellType, MaterialGroup, Product, StorageUnit, TareKind, TareType, Tracking } from '../types';

export interface AttrField {
  key: string;
  label: string;
  hint?: string;
}

export interface GroupSpec {
  title: string;
  short: string;
  /** Цвет группы (метки, легенды, 3D в режиме «по группе») */
  color: string;
  unit: string;
  storage: StorageUnit;
  tracking: Tracking;
  hazard?: boolean;
  /** Поля карточки товара */
  attrs: AttrField[];
  /** Поля партии при приходе */
  batch: ('heat' | 'cert' | 'expiry' | 'serial' | 'order')[];
  /** Подходящие типы ячеек в порядке предпочтения */
  cells: CellType[];
}

/** Группы ТМЦ с правилами учёта и хранения. */
export const GROUPS: Record<MaterialGroup, GroupSpec> = {
  metal: {
    title: 'Металлопрокат',
    short: 'Металл',
    color: '#7c8aa0',
    unit: 'т',
    storage: 'long',
    tracking: 'batch',
    attrs: [
      { key: 'profile', label: 'Профиль', hint: 'труба, лист, арматура, уголок…' },
      { key: 'steel', label: 'Марка стали', hint: 'Ст3сп, 09Г2С, AISI 304' },
      { key: 'size', label: 'Размер', hint: '40×40×2' },
      { key: 'gost', label: 'ГОСТ / ТУ' },
      { key: 'length', label: 'Длина, м' },
      { key: 'kgPerM', label: 'Масса 1 м, кг' },
    ],
    batch: ['heat', 'cert'],
    cells: ['cantilever', 'floor', 'pallet'],
  },
  welding: {
    title: 'Сварочные материалы',
    short: 'Сварка',
    color: '#b45309',
    unit: 'кг',
    storage: 'box',
    tracking: 'batch',
    attrs: [
      { key: 'type', label: 'Вид', hint: 'электроды, проволока, флюс' },
      { key: 'brand', label: 'Марка', hint: 'УОНИ-13/55, Св-08Г2С' },
      { key: 'size', label: 'Диаметр, мм' },
      { key: 'approval', label: 'Одобрение РС' },
    ],
    batch: ['cert'],
    cells: ['box', 'pallet', 'shelf'],
  },
  paint: {
    title: 'Лакокрасочные материалы',
    short: 'ЛКМ',
    color: '#e05252',
    unit: 'кг',
    storage: 'pallet',
    tracking: 'batch',
    hazard: true,
    attrs: [
      { key: 'ral', label: 'Цвет (RAL)' },
      { key: 'base', label: 'Основа', hint: 'алкидная, эпоксидная…' },
      { key: 'pack', label: 'Фасовка', hint: 'ведро 20 кг' },
      { key: 'density', label: 'Плотность, кг/л' },
      { key: 'gost', label: 'ГОСТ / ТУ' },
    ],
    batch: ['expiry', 'cert'],
    cells: ['pallet', 'floor', 'box'],
  },
  gas: {
    title: 'Технические газы',
    short: 'Газы',
    color: '#3b82f6',
    unit: 'бал.',
    storage: 'cylinder',
    tracking: 'none',
    hazard: true,
    attrs: [
      { key: 'gas', label: 'Газ' },
      { key: 'volume', label: 'Баллон, л' },
      { key: 'pressure', label: 'Давление, МПа' },
      { key: 'gost', label: 'ГОСТ' },
    ],
    batch: [],
    cells: ['cylinder'],
  },
  valves: {
    title: 'Трубопроводная арматура',
    short: 'Арматура',
    color: '#5b6bd6',
    unit: 'шт',
    storage: 'box',
    tracking: 'none',
    attrs: [
      { key: 'type', label: 'Тип', hint: 'клапан, задвижка, фланец' },
      { key: 'dn', label: 'Ду, мм' },
      { key: 'pn', label: 'Ру, МПа' },
      { key: 'material', label: 'Материал' },
      { key: 'drawing', label: 'Обозначение' },
    ],
    batch: [],
    cells: ['box', 'pallet', 'shelf'],
  },
  hardware: {
    title: 'Метизы и крепёж',
    short: 'Метизы',
    color: '#9aa3ad',
    unit: 'кг',
    storage: 'box',
    tracking: 'none',
    attrs: [
      { key: 'type', label: 'Тип', hint: 'болт, гайка, анкер' },
      { key: 'size', label: 'Размер', hint: 'М12×60' },
      { key: 'class', label: 'Класс прочности' },
      { key: 'coating', label: 'Покрытие' },
      { key: 'gost', label: 'ГОСТ / DIN' },
    ],
    batch: [],
    cells: ['box', 'shelf', 'pallet'],
  },
  cable: {
    title: 'Кабель и провод',
    short: 'Кабель',
    color: '#e3a33b',
    unit: 'м',
    storage: 'pallet',
    tracking: 'batch',
    attrs: [
      { key: 'brand', label: 'Марка', hint: 'ВВГнг(А)-LS' },
      { key: 'section', label: 'Сечение', hint: '3×2,5' },
      { key: 'voltage', label: 'Напряжение, кВ' },
    ],
    batch: ['cert'],
    cells: ['pallet', 'floor', 'box'],
  },
  electro: {
    title: 'Электротехника',
    short: 'Электро',
    color: '#d4b106',
    unit: 'шт',
    storage: 'box',
    tracking: 'none',
    attrs: [
      { key: 'model', label: 'Модель' },
      { key: 'rating', label: 'Номинал' },
    ],
    batch: [],
    cells: ['box', 'shelf', 'pallet'],
  },
  tools: {
    title: 'Инструмент',
    short: 'Инструмент',
    color: '#c2410c',
    unit: 'шт',
    storage: 'piece',
    tracking: 'serial',
    attrs: [
      { key: 'brand', label: 'Производитель' },
      { key: 'model', label: 'Модель' },
    ],
    batch: ['serial'],
    cells: ['shelf', 'box'],
  },
  consumables: {
    title: 'Расходные материалы',
    short: 'Расходники',
    color: '#2e90c8',
    unit: 'шт',
    storage: 'box',
    tracking: 'none',
    attrs: [
      { key: 'size', label: 'Размер' },
      { key: 'gost', label: 'ГОСТ / ТУ' },
    ],
    batch: [],
    cells: ['box', 'shelf', 'pallet'],
  },
  ppe: {
    title: 'Спецодежда и СИЗ',
    short: 'СИЗ',
    color: '#2f9e5a',
    unit: 'шт',
    storage: 'box',
    tracking: 'none',
    attrs: [
      { key: 'size', label: 'Размер' },
      { key: 'height', label: 'Рост' },
      { key: 'season', label: 'Сезон' },
    ],
    batch: [],
    cells: ['box', 'shelf'],
  },
  parts: {
    title: 'Запчасти и комплектующие',
    short: 'Запчасти',
    color: '#7c5cd6',
    unit: 'шт',
    storage: 'box',
    tracking: 'none',
    attrs: [
      { key: 'model', label: 'Модель / обозначение' },
      { key: 'oem', label: 'Каталожный номер' },
    ],
    batch: [],
    cells: ['box', 'shelf', 'pallet'],
  },
  equipment: {
    title: 'Оборудование',
    short: 'Оборудование',
    color: '#2f6fd0',
    unit: 'шт',
    storage: 'pallet',
    tracking: 'serial',
    attrs: [
      { key: 'model', label: 'Модель' },
      { key: 'power', label: 'Мощность' },
      { key: 'maker', label: 'Производитель' },
    ],
    batch: ['serial'],
    cells: ['pallet', 'floor'],
  },
  chem: {
    title: 'Химия и ГСМ',
    short: 'ГСМ',
    color: '#d9731f',
    unit: 'л',
    storage: 'pallet',
    tracking: 'batch',
    hazard: true,
    attrs: [
      { key: 'gost', label: 'ГОСТ / ТУ' },
      { key: 'pack', label: 'Фасовка' },
    ],
    batch: ['expiry', 'cert'],
    cells: ['pallet', 'floor'],
  },
  it: {
    title: 'IT-оборудование',
    short: 'IT',
    color: '#0f9fb3',
    unit: 'шт',
    storage: 'piece',
    tracking: 'serial',
    attrs: [
      { key: 'model', label: 'Модель' },
      { key: 'config', label: 'Конфигурация' },
    ],
    batch: ['serial'],
    cells: ['shelf', 'box', 'virtual'],
  },
  semi: {
    title: 'Полуфабрикаты',
    short: 'П/ф',
    color: '#0f9488',
    unit: 'шт',
    storage: 'pallet',
    tracking: 'batch',
    attrs: [
      { key: 'drawing', label: 'Обозначение (чертёж)', hint: '02790.311.021' },
      { key: 'section', label: 'Секция / узел' },
      { key: 'material', label: 'Материал' },
      { key: 'mass', label: 'Масса 1 шт, кг' },
    ],
    batch: ['order'],
    cells: ['pallet', 'floor', 'cantilever', 'box'],
  },
  finished: {
    title: 'Готовые изделия',
    short: 'Изделия',
    color: '#15803d',
    unit: 'шт',
    storage: 'pallet',
    tracking: 'serial',
    attrs: [
      { key: 'drawing', label: 'Обозначение (чертёж)' },
      { key: 'mass', label: 'Масса, кг' },
      { key: 'otk', label: 'Приёмка ОТК / РС' },
    ],
    batch: ['serial', 'order'],
    cells: ['pallet', 'floor'],
  },
  general: {
    title: 'Прочие ТМЦ',
    short: 'Прочее',
    color: '#8b95a5',
    unit: 'шт',
    storage: 'box',
    tracking: 'none',
    attrs: [],
    batch: [],
    cells: ['box', 'shelf', 'pallet'],
  },
};

export const STORAGE_UNITS: Record<StorageUnit, { title: string; short: string }> = {
  pallet: { title: 'На паллете', short: 'паллета' },
  box: { title: 'В коробе / ящике', short: 'короб' },
  piece: { title: 'Штучно на полке', short: 'штучно' },
  long: { title: 'Длинномер на консоли', short: 'длинномер' },
  bulk: { title: 'Штабелем на полу', short: 'штабель' },
  cylinder: { title: 'В баллонах', short: 'баллоны' },
};

export interface CellTypeSpec {
  title: string;
  short: string;
  /** Единица мест */
  placeUnit: string;
  /** Что принимает ячейка, в порядке предпочтения */
  accepts: StorageUnit[];
  color: string;
}

export const CELL_TYPES: Record<CellType, CellTypeSpec> = {
  pallet: {
    title: 'Паллетная',
    short: 'Паллет.',
    placeUnit: 'паллетомест',
    accepts: ['pallet', 'bulk', 'box'],
    color: '#3b82f6',
  },
  box: { title: 'Коробочная', short: 'Короб.', placeUnit: 'коробомест', accepts: ['box', 'piece'], color: '#f59e0b' },
  shelf: { title: 'Полочная (штучная)', short: 'Полка', placeUnit: '', accepts: ['piece', 'box'], color: '#22c55e' },
  cantilever: { title: 'Консольная', short: 'Консоль', placeUnit: '', accepts: ['long'], color: '#64748b' },
  floor: {
    title: 'Напольная (штабель)',
    short: 'Пол',
    placeUnit: 'мест',
    accepts: ['bulk', 'pallet', 'long'],
    color: '#a16207',
  },
  cylinder: { title: 'Баллонная', short: 'Баллон', placeUnit: 'баллономеста', accepts: ['cylinder'], color: '#0284c7' },
  virtual: {
    title: 'Место учёта',
    short: 'Учёт',
    placeUnit: '',
    accepts: ['pallet', 'box', 'piece', 'long', 'bulk', 'cylinder'],
    color: '#0ea5e9',
  },
};

/** Подходит ли товар к типу ячейки. */
export const accepts = (t: CellType, s: StorageUnit) => CELL_TYPES[t].accepts.includes(s);

/** Насколько ячейка подходит товару: 0 — идеально, больше — хуже, Infinity — нельзя. */
export function fitRank(t: CellType, s: StorageUnit): number {
  const i = CELL_TYPES[t].accepts.indexOf(s);
  return i < 0 ? Infinity : i;
}

/** Стандартная тара. */
export const DEFAULT_TARE: TareType[] = [
  {
    id: 't-eur',
    code: 'EUR',
    name: 'Поддон EUR 1200×800',
    kind: 'pallet',
    length: 1200,
    width: 800,
    height: 144,
    weight: 25,
    returnable: true,
    price: 650,
  },
  {
    id: 't-fin',
    code: 'FIN',
    name: 'Поддон FIN 1200×1000',
    kind: 'pallet',
    length: 1200,
    width: 1000,
    height: 144,
    weight: 30,
    returnable: true,
    price: 720,
  },
  {
    id: 't-box',
    code: 'КГ-60',
    name: 'Короб гофрированный 600×400×400',
    kind: 'box',
    length: 600,
    width: 400,
    height: 400,
    weight: 0.8,
    returnable: false,
    price: 90,
  },
  {
    id: 't-bin',
    code: 'ЯП-64',
    name: 'Ящик пластиковый 600×400×300',
    kind: 'bin',
    length: 600,
    width: 400,
    height: 300,
    weight: 2.2,
    returnable: true,
    price: 1100,
  },
  {
    id: 't-drum',
    code: 'Б-216',
    name: 'Бочка металлическая 216 л',
    kind: 'drum',
    length: 590,
    width: 590,
    height: 880,
    weight: 18,
    returnable: true,
    price: 2400,
  },
  {
    id: 't-reel',
    code: 'Бр-12',
    name: 'Барабан кабельный №12',
    kind: 'reel',
    length: 1220,
    width: 710,
    height: 1220,
    weight: 115,
    returnable: true,
    price: 6800,
  },
  {
    id: 't-cass',
    code: 'КС-6',
    name: 'Кассета для длинномера 6 м',
    kind: 'cassette',
    length: 6000,
    width: 600,
    height: 500,
    weight: 140,
    returnable: true,
    price: 18000,
  },
  {
    id: 't-bag',
    code: 'МКР',
    name: 'Мешок МКР (биг-бэг)',
    kind: 'bag',
    length: 900,
    width: 900,
    height: 1000,
    weight: 2.5,
    returnable: false,
    price: 450,
  },
  // Газовые баллоны — возвратная тара; цвет окраски по ГОСТ 949 / ПБ
  {
    id: 't-o2',
    code: 'Б40-О₂',
    name: 'Баллон 40 л кислородный',
    kind: 'cylinder',
    color: '#3b8fe0',
    length: 219,
    width: 219,
    height: 1390,
    weight: 67,
    returnable: true,
    price: 9500,
  },
  {
    id: 't-c3h8',
    code: 'Б50-ПБ',
    name: 'Баллон 50 л пропан-бутан',
    kind: 'cylinder',
    color: '#d93a3a',
    length: 299,
    width: 299,
    height: 960,
    weight: 22,
    returnable: true,
    price: 4200,
  },
  {
    id: 't-ar',
    code: 'Б40-Ar',
    name: 'Баллон 40 л аргоновый',
    kind: 'cylinder',
    color: '#8d96a3',
    length: 219,
    width: 219,
    height: 1390,
    weight: 67,
    returnable: true,
    price: 9500,
  },
  {
    id: 't-mix',
    code: 'Б40-См',
    name: 'Баллон 40 л сварочная смесь Ar+CO₂',
    kind: 'cylinder',
    color: '#4b9b5f',
    length: 219,
    width: 219,
    height: 1390,
    weight: 67,
    returnable: true,
    price: 9500,
  },
  {
    id: 't-co2',
    code: 'Б40-CO₂',
    name: 'Баллон 40 л углекислотный',
    kind: 'cylinder',
    color: '#2b2f36',
    length: 219,
    width: 219,
    height: 1390,
    weight: 67,
    returnable: true,
    price: 9000,
  },
  {
    id: 't-c2h2',
    code: 'Б40-Ац',
    name: 'Баллон 40 л ацетиленовый',
    kind: 'cylinder',
    color: '#e8e8e8',
    length: 219,
    width: 219,
    height: 1390,
    weight: 70,
    returnable: true,
    price: 12000,
  },
];

export const TARE_KINDS: Record<TareKind, string> = {
  pallet: 'Поддон',
  box: 'Короб',
  bin: 'Ящик',
  drum: 'Бочка',
  reel: 'Барабан',
  cassette: 'Кассета',
  bag: 'Мешок',
  ibc: 'Еврокуб',
  cylinder: 'Баллон',
};

// ---------- Количества и единицы ----------

const DIGITS: Record<string, number> = { т: 3, кг: 1, м: 1, л: 1, 'м²': 2, 'м³': 3 };

/** Количество в базовой единице: 12,480 т / 1 395 м / 48 шт. */
export function fmtQty(qty: number, unit: string): string {
  const d = DIGITS[unit] ?? 0;
  const v = d ? Math.round(qty * 10 ** d) / 10 ** d : Math.round(qty);
  return `${v.toLocaleString('ru-RU', { maximumFractionDigits: d })} ${unit}`;
}

/** Количество с пересчётом в дополнительную единицу: «12,48 т · 1 395 м». */
export function fmtQtyFull(p: Pick<Product, 'unit' | 'units'>, qty: number): string {
  const main = fmtQty(qty, p.unit);
  const alt = p.units?.[0];
  if (!alt || !alt.factor) return main;
  const v = qty / alt.factor;
  const digits = v >= 100 ? 0 : 1;
  return `${main} · ${v.toLocaleString('ru-RU', { maximumFractionDigits: digits })} ${alt.unit}`;
}

/** Сколько тары занимает количество товара (на паллетах, в коробах, на барабанах). */
export function tareCount(p: Pick<Product, 'perTare'>, qty: number): number {
  return p.perTare && p.perTare > 0 ? Math.ceil(qty / p.perTare - 1e-9) : 0;
}

/** Цвет товара для 3D: собственный или цвет группы. */
export const productColor = (p: Product) => p.color ?? GROUPS[p.group].color;
