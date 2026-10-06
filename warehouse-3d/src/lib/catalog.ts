import type { AltUnit, Consumer, MaterialGroup, Product, StorageUnit, Tracking } from '../types';
import { GROUPS } from './materials';

// Демо-каталог ТМЦ судостроительного завода. Вес — кг на базовую единицу, объём — л на базовую
// единицу (с упаковкой), цена — ₽ за базовую единицу. В рабочем режиме каталог приходит из учётной системы.

interface P {
  id: string;
  sku: string;
  name: string;
  group: MaterialGroup;
  category: string;
  weight: number;
  volume: number;
  price: number;
  unit?: string;
  units?: AltUnit[];
  storage?: StorageUnit;
  tracking?: Tracking;
  tareTypeId?: string;
  perTare?: number;
  shelfLife?: number;
  hazard?: boolean;
  attrs?: Record<string, string>;
  min?: number;
  max?: number;
  color?: string;
}

const mk = (p: P): Product => {
  const g = GROUPS[p.group];
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    group: p.group,
    category: p.category,
    unit: p.unit ?? g.unit,
    units: p.units,
    weight: p.weight,
    volume: p.volume,
    storage: p.storage ?? g.storage,
    tareTypeId: p.tareTypeId,
    perTare: p.perTare,
    tracking: p.tracking ?? g.tracking,
    shelfLife: p.shelfLife,
    hazard: p.hazard ?? g.hazard,
    attrs: p.attrs,
    min: p.min ?? 0,
    max: p.max ?? 0,
    price: p.price,
    color: p.color,
  };
};

/** Металл: 1 т стали ≈ 127 л. Доп. единицы — лист, метр. */
const STEEL_L = 127;
const sheet = (
  id: string,
  sku: string,
  name: string,
  steel: string,
  t: number,
  w: number,
  l: number,
  price: number,
  color?: string,
) =>
  mk({
    id,
    sku,
    name,
    group: 'metal',
    category: 'Листовой прокат',
    weight: 1000,
    volume: STEEL_L,
    price,
    storage: 'bulk',
    units: [{ unit: 'лист', factor: Math.round(((w * l * t * 7.85) / 1e9) * 10000) / 10000 }],
    attrs: { profile: 'лист', steel, size: `${t}×${w}×${l}`, gost: 'ГОСТ Р 52927' },
    min: 20,
    max: 160,
    color,
  });
const long = (
  id: string,
  sku: string,
  name: string,
  category: string,
  profile: string,
  steel: string,
  size: string,
  kgPerM: number,
  price: number,
  gost: string,
) =>
  mk({
    id,
    sku,
    name,
    group: 'metal',
    category,
    weight: 1000,
    volume: STEEL_L,
    price,
    storage: 'long',
    units: [{ unit: 'м', factor: kgPerM / 1000 }],
    attrs: { profile, steel, size, gost, length: '6', kgPerM: String(kgPerM) },
    min: 2,
    max: 30,
  });
const gas = (
  id: string,
  sku: string,
  name: string,
  tare: string,
  gasName: string,
  cls: string,
  weight: number,
  volume: number,
  price: number,
  color: string,
) =>
  mk({
    id,
    sku,
    name,
    group: 'gas',
    category: 'Технические газы',
    unit: 'бал.',
    weight,
    volume,
    price,
    tareTypeId: tare,
    perTare: 1,
    attrs: { gas: gasName, class: cls, volume: tare === 't-c3h8' ? '50' : '40' },
    min: 10,
    max: 60,
    color,
  });
const paint = (
  id: string,
  sku: string,
  name: string,
  ral: string,
  base: string,
  shelfLife: number,
  price: number,
  color: string,
) =>
  mk({
    id,
    sku,
    name,
    group: 'paint',
    category: 'ЛКМ',
    weight: 1,
    volume: 0.9,
    price,
    tareTypeId: 't-eur',
    perTare: 640,
    shelfLife,
    attrs: { ral, base, pack: 'ведро 20 кг', density: '1,4' },
    min: 400,
    max: 4000,
    color,
  });
const chem = (id: string, sku: string, name: string, density: number, price: number, shelfLife: number) =>
  mk({
    id,
    sku,
    name,
    group: 'chem',
    category: 'ГСМ и растворители',
    unit: 'л',
    weight: density,
    volume: 1.08,
    price,
    tareTypeId: 't-eur',
    perTare: 800,
    shelfLife,
    attrs: { pack: 'бочка 200 л, 4 на поддоне' },
    min: 400,
    max: 3000,
  });
const cable = (
  id: string,
  sku: string,
  name: string,
  brand: string,
  section: string,
  kgPerM: number,
  perReel: number,
  price: number,
) =>
  mk({
    id,
    sku,
    name,
    group: 'cable',
    category: 'Кабель судовой',
    weight: kgPerM,
    volume: kgPerM * 1.1 + 0.15,
    price,
    tareTypeId: 't-reel',
    perTare: perReel,
    units: [{ unit: 'бар.', factor: perReel }],
    attrs: { brand, section, voltage: '0,66' },
    min: 1000,
    max: 12000,
    color: '#2f3640',
  });
const piece = (
  group: MaterialGroup,
  id: string,
  sku: string,
  name: string,
  category: string,
  weight: number,
  volume: number,
  price: number,
  extra: Partial<P> = {},
) => mk({ id, sku, name, group, category, weight, volume, price, min: 10, max: 200, ...extra });

export const DEMO_PRODUCTS: Product[] = [
  // ----- Металлопрокат -----
  sheet('p-l10', 'ЛС-A-10', 'Лист судовой 10 мм, кат. A, 1500×6000', 'РС A', 10, 1500, 6000, 98000, '#7d8794'),
  sheet('p-l8', 'ЛС-D32-8', 'Лист судовой 8 мм, D32, 1500×6000', 'РС D32', 8, 1500, 6000, 112000, '#86909c'),
  sheet('p-l14', 'ЛС-AH36-14', 'Лист 14 мм, AH36, 2000×6000', 'РС AH36', 14, 2000, 6000, 118000, '#737d89'),
  long(
    'p-bulb',
    'ПБ-140×7',
    'Полособульб 140×7, РС A',
    'Судовой профиль',
    'полособульб',
    'РС A',
    '140×7',
    9.4,
    104000,
    'ГОСТ 21937',
  ),
  long(
    'p-angle',
    'УГ-75×6',
    'Уголок 75×75×6, Ст3сп',
    'Сортовой прокат',
    'уголок',
    'Ст3сп',
    '75×75×6',
    6.89,
    89000,
    'ГОСТ 8509',
  ),
  long(
    'p-chan',
    'ШВ-16П',
    'Швеллер 16П, Ст3сп',
    'Сортовой прокат',
    'швеллер',
    'Ст3сп',
    '16П',
    14.2,
    91000,
    'ГОСТ 8240',
  ),
  long(
    'p-beam',
    'ДТ-20Б1',
    'Двутавр 20Б1, С255',
    'Сортовой прокат',
    'двутавр',
    'С255',
    '20Б1',
    22.4,
    95000,
    'СТО АСЧМ 20',
  ),
  long(
    'p-rod40',
    'КР-40-45',
    'Круг 40, сталь 45',
    'Сортовой прокат',
    'круг',
    'сталь 45',
    'ø40',
    9.87,
    97000,
    'ГОСТ 2590',
  ),
  long('p-pipe57', 'ТР-57×4', 'Труба 57×4, сталь 20', 'Трубы', 'труба', 'сталь 20', '57×4', 5.23, 115000, 'ГОСТ 8732'),
  long(
    'p-pipe108',
    'ТР-108×5',
    'Труба 108×5, сталь 20',
    'Трубы',
    'труба',
    'сталь 20',
    '108×5',
    12.7,
    112000,
    'ГОСТ 8732',
  ),
  long(
    'p-pipe159',
    'ТР-159×6',
    'Труба 159×6, сталь 20',
    'Трубы',
    'труба',
    'сталь 20',
    '159×6',
    22.6,
    110000,
    'ГОСТ 8732',
  ),
  long(
    'p-pipess',
    'ТР-38×3-Н',
    'Труба 38×3 нерж. 12Х18Н10Т',
    'Трубы',
    'труба',
    '12Х18Н10Т',
    '38×3',
    2.61,
    420000,
    'ГОСТ 9941',
  ),

  // ----- Сварочные материалы -----
  piece('welding', 'p-uoni4', 'ЭЛ-УОНИ-4', 'Электроды УОНИ-13/55 ø4 мм', 'Электроды', 1, 0.35, 380, {
    unit: 'кг',
    units: [{ unit: 'пач.', factor: 5 }],
    attrs: { type: 'электроды', brand: 'УОНИ-13/55', size: '4', approval: 'РС' },
    min: 300,
    max: 2500,
  }),
  piece('welding', 'p-mr3', 'ЭЛ-МР3-3', 'Электроды МР-3 ø3 мм', 'Электроды', 1, 0.35, 290, {
    unit: 'кг',
    units: [{ unit: 'пач.', factor: 5 }],
    attrs: { type: 'электроды', brand: 'МР-3', size: '3' },
    min: 200,
    max: 1500,
  }),
  piece('welding', 'p-ozl8', 'ЭЛ-ОЗЛ8-3', 'Электроды ОЗЛ-8 ø3 мм (нерж.)', 'Электроды', 1, 0.35, 1250, {
    unit: 'кг',
    units: [{ unit: 'пач.', factor: 5 }],
    attrs: { type: 'электроды', brand: 'ОЗЛ-8', size: '3', approval: 'РС' },
    min: 50,
    max: 400,
  }),
  piece('welding', 'p-wire12', 'ПР-СВ08Г2С-1,2', 'Проволока Св-08Г2С ø1,2 мм', 'Сварочная проволока', 1, 0.3, 210, {
    unit: 'кг',
    units: [{ unit: 'кас.', factor: 15 }],
    attrs: { type: 'проволока', brand: 'Св-08Г2С', size: '1,2', approval: 'РС' },
    min: 450,
    max: 3000,
  }),
  piece('welding', 'p-fcw', 'ПР-ПОР-1,2', 'Проволока порошковая ø1,2 мм', 'Сварочная проволока', 1, 0.32, 520, {
    unit: 'кг',
    units: [{ unit: 'кас.', factor: 16 }],
    attrs: { type: 'порошковая проволока', size: '1,2', approval: 'РС' },
    min: 160,
    max: 1200,
  }),
  piece('welding', 'p-flux', 'ФЛ-АН348', 'Флюс АН-348А', 'Флюс', 1, 0.75, 95, {
    unit: 'кг',
    units: [{ unit: 'меш.', factor: 25 }],
    storage: 'pallet',
    tareTypeId: 't-eur',
    perTare: 1000,
    attrs: { type: 'флюс', brand: 'АН-348А' },
    min: 500,
    max: 4000,
  }),

  // ----- ЛКМ (огнеопасные — только в складе ЛВЖ) -----
  paint(
    'p-ep0140',
    'ЛКМ-ЭП0140',
    'Грунтовка ЭП-0140 эпоксидная, красно-коричневая',
    '3009',
    'эпоксидная',
    365,
    520,
    '#8e3b2e',
  ),
  paint('p-pf115', 'ЛКМ-ПФ115-7040', 'Эмаль ПФ-115 серая RAL 7040', '7040', 'алкидная', 540, 310, '#9aa0a6'),
  paint('p-ep773', 'ЛКМ-ЭП773', 'Эмаль ЭП-773 светло-серая', '7035', 'эпоксидная', 365, 640, '#c9ccc9'),
  paint(
    'p-af',
    'ЛКМ-АФ-КР',
    'Эмаль необрастающая красная (подводная часть)',
    '3000',
    'виниловая',
    300,
    1450,
    '#b3322a',
  ),
  paint('p-gf021', 'ЛКМ-ГФ021', 'Грунтовка ГФ-021 серая', '7001', 'алкидная', 540, 240, '#8a9196'),
  paint('p-wl', 'ЛКМ-ВЛ-Ч', 'Эмаль для ватерлинии чёрная', '9005', 'эпоксидная', 365, 890, '#2b2b2b'),

  // ----- ГСМ и растворители -----
  chem('p-r4', 'ГСМ-Р4', 'Растворитель Р-4', 0.86, 180, 730),
  chem('p-ws', 'ГСМ-УС', 'Уайт-спирит', 0.79, 160, 1095),
  chem('p-oil', 'ГСМ-И20', 'Масло индустриальное И-20А', 0.89, 210, 1825),
  chem('p-hyd', 'ГСМ-ВМГЗ', 'Масло гидравлическое ВМГЗ', 0.87, 260, 1825),

  // ----- Газы в баллонах (баллон — возвратная тара) -----
  gas(
    'p-o2',
    'ГАЗ-О2-40',
    'Кислород технический, баллон 40 л',
    't-o2',
    'кислород',
    'окислитель',
    75,
    52,
    900,
    '#3b8fe0',
  ),
  gas('p-c3h8', 'ГАЗ-ПБ-50', 'Пропан-бутан, баллон 50 л', 't-c3h8', 'пропан-бутан', 'горючий', 43, 67, 1800, '#d93a3a'),
  gas('p-ar', 'ГАЗ-AR-40', 'Аргон газообразный, баллон 40 л', 't-ar', 'аргон', 'инертный', 77, 52, 1500, '#8d96a3'),
  gas('p-mix', 'ГАЗ-СМ-40', 'Смесь Ar+CO₂ 82/18, баллон 40 л', 't-mix', 'Ar+CO₂', 'инертный', 76, 52, 1700, '#4b9b5f'),
  gas('p-co2', 'ГАЗ-CO2-40', 'Углекислота, баллон 40 л', 't-co2', 'CO₂', 'инертный', 91, 52, 1100, '#2b2f36'),
  gas(
    'p-c2h2',
    'ГАЗ-АЦ-40',
    'Ацетилен растворённый, баллон 40 л',
    't-c2h2',
    'ацетилен',
    'горючий',
    78,
    52,
    3900,
    '#e8e8e8',
  ),

  // ----- Трубопроводная арматура -----
  piece('valves', 'p-vk50', 'АРМ-КЗ-50', 'Клапан запорный проходной Ду50 Ру16, бронза', 'Клапаны', 12, 15, 18500, {
    attrs: { type: 'клапан', dn: '50', pn: '1,6', material: 'бронза', drawing: '521-01.250' },
  }),
  piece('valves', 'p-zd100', 'АРМ-ЗД-100', 'Задвижка клиновая Ду100 Ру16', 'Задвижки', 45, 60, 32000, {
    storage: 'pallet',
    tareTypeId: 't-eur',
    perTare: 12,
    attrs: { type: 'задвижка', dn: '100', pn: '1,6', material: 'сталь 25Л' },
  }),
  piece('valves', 'p-fl50', 'АРМ-ФЛ-50', 'Фланец 1-50-16, ст. 20', 'Фланцы', 2.4, 1.2, 690, {
    attrs: { type: 'фланец', dn: '50', pn: '1,6', material: 'ст. 20' },
    max: 600,
  }),
  piece('valves', 'p-otv57', 'АРМ-ОТ-57', 'Отвод 90° 57×4, ст. 20', 'Отводы', 0.8, 1.5, 240, {
    attrs: { type: 'отвод', dn: '50', material: 'ст. 20' },
    max: 800,
  }),
  piece('valves', 'p-kran25', 'АРМ-КШ-25', 'Кран шаровой Ду25 Ру40', 'Краны', 1.2, 1.5, 2900, {
    attrs: { type: 'кран', dn: '25', pn: '4,0', material: 'латунь' },
  }),

  // ----- Метизы -----
  piece('hardware', 'p-b12', 'МТ-Б-М12×60', 'Болт М12×60 кл. 8.8 оцинк.', 'Болты', 1, 0.25, 260, {
    unit: 'кг',
    units: [{ unit: 'шт', factor: 0.072 }],
    attrs: { type: 'болт', size: 'М12×60', class: '8.8', coating: 'цинк', gost: 'ГОСТ 7798' },
    min: 50,
    max: 600,
  }),
  piece('hardware', 'p-n12', 'МТ-Г-М12', 'Гайка М12 кл. 8 оцинк.', 'Гайки', 1, 0.25, 240, {
    unit: 'кг',
    units: [{ unit: 'шт', factor: 0.016 }],
    attrs: { type: 'гайка', size: 'М12', class: '8', coating: 'цинк', gost: 'ГОСТ 5915' },
    min: 30,
    max: 300,
  }),
  piece('hardware', 'p-s16', 'МТ-Ш-М16', 'Шпилька резьбовая М16×1000 кл. 8.8', 'Шпильки', 1, 0.3, 310, {
    unit: 'кг',
    units: [{ unit: 'шт', factor: 1.58 }],
    attrs: { type: 'шпилька', size: 'М16×1000', class: '8.8' },
    min: 30,
    max: 300,
  }),
  piece('hardware', 'p-w12', 'МТ-Ш-12', 'Шайба 12 плоская оцинк.', 'Шайбы', 1, 0.25, 230, {
    unit: 'кг',
    attrs: { type: 'шайба', size: '12', coating: 'цинк', gost: 'ГОСТ 11371' },
    min: 20,
    max: 200,
  }),
  piece('hardware', 'p-anch', 'МТ-А-12×100', 'Анкер клиновой 12×100', 'Анкеры', 1, 0.3, 420, {
    unit: 'кг',
    units: [{ unit: 'шт', factor: 0.1 }],
    attrs: { type: 'анкер', size: '12×100' },
    min: 10,
    max: 120,
  }),

  // ----- Кабель (на барабанах — возвратная тара) -----
  cable('p-knr325', 'КБ-КНРК-3×2,5', 'Кабель КНРк 3×2,5 судовой', 'КНРк', '3×2,5', 0.25, 1000, 165),
  cable('p-nrshm44', 'КБ-НРШМ-4×4', 'Кабель НРШМ 4×4', 'НРШМ', '4×4', 0.42, 500, 290),
  cable('p-kmpv71', 'КБ-КМПВ-7×1', 'Кабель КМПВ 7×1', 'КМПВ', '7×1', 0.18, 1000, 140),
  cable('p-knr316', 'КБ-КНРК-3×16', 'Кабель КНРк 3×16 судовой', 'КНРк', '3×16', 0.95, 300, 820),

  // ----- Электротехника -----
  piece('electro', 'p-lamp', 'ЭЛ-СВ-36', 'Светильник судовой светодиодный 36 Вт IP66', 'Светильники', 3.5, 12, 7400, {
    attrs: { model: 'ССП-36', rating: '36 Вт' },
  }),
  piece('electro', 'p-qf25', 'ЭЛ-АВ-3P25', 'Автоматический выключатель 3P 25 А', 'Аппараты защиты', 0.4, 0.6, 1650, {
    attrs: { rating: '25 А' },
    max: 400,
  }),
  piece('electro', 'p-jbox', 'ЭЛ-КС10', 'Коробка соединительная КС-10 IP66', 'Коробки', 0.6, 1.2, 980, { max: 300 }),
  piece('electro', 'p-cont', 'ЭЛ-КМ-32', 'Контактор 32 А, 220 В', 'Пускатели', 0.5, 0.8, 2300, {
    attrs: { rating: '32 А' },
  }),
  piece('electro', 'p-gland', 'ЭЛ-СЛ-PG21', 'Сальник кабельный PG21, латунь', 'Кабельные вводы', 0.08, 0.06, 310, {
    max: 2000,
  }),

  // ----- Инструмент (штучно на полке, по инвентарным номерам) -----
  piece('tools', 'p-ushm', 'ИН-УШМ-125', 'Шлифмашина угловая 125 мм', 'Электроинструмент', 2.4, 6, 9800, {
    attrs: { brand: 'Заводская серия', model: 'УШМ-125/1100' },
    color: '#1e6fd9',
    min: 5,
    max: 40,
  }),
  piece('tools', 'p-drill', 'ИН-ДШ-18', 'Дрель-шуруповёрт аккумуляторная 18 В', 'Электроинструмент', 1.8, 5, 12500, {
    color: '#16a34a',
    min: 4,
    max: 30,
  }),
  piece('tools', 'p-torq', 'ИН-КД-200', 'Ключ динамометрический 40–200 Н·м', 'Слесарный инструмент', 1.6, 3, 8900, {
    color: '#94a3b8',
    min: 2,
    max: 20,
  }),
  piece('tools', 'p-perf', 'ИН-ПФ-800', 'Перфоратор SDS-plus 800 Вт', 'Электроинструмент', 3.2, 8, 14900, {
    color: '#0d9488',
    min: 2,
    max: 20,
  }),
  piece('tools', 'p-sockets', 'ИН-НГ-24', 'Набор головок 1/2", 24 предмета', 'Слесарный инструмент', 4.5, 6, 6400, {
    color: '#dc2626',
    min: 2,
    max: 20,
  }),

  // ----- Расходные материалы (в коробах) -----
  piece('consumables', 'p-cut125', 'РМ-КО-125', 'Круг отрезной 125×1,2×22 по металлу', 'Абразив', 0.06, 0.025, 62, {
    units: [{ unit: 'уп.', factor: 25 }],
    min: 1000,
    max: 12000,
  }),
  piece('consumables', 'p-grind125', 'РМ-КЗ-125', 'Круг зачистной 125×6×22', 'Абразив', 0.22, 0.08, 118, {
    min: 400,
    max: 5000,
  }),
  piece('consumables', 'p-flap', 'РМ-КЛ-125', 'Круг лепестковый торцевой 125 P60', 'Абразив', 0.1, 0.1, 150, {
    min: 300,
    max: 3000,
  }),
  piece('consumables', 'p-brush', 'РМ-ЩП-100', 'Щётка проволочная для УШМ 100 мм', 'Щётки', 0.3, 0.3, 390, {
    min: 50,
    max: 600,
  }),
  piece('consumables', 'p-rag', 'РМ-ВТ', 'Ветошь обтирочная', 'Ветошь', 1, 4, 85, { unit: 'кг', min: 100, max: 800 }),

  // ----- Спецодежда и СИЗ -----
  piece('ppe', 'p-gloves', 'СИЗ-ПЕР-ПВХ', 'Перчатки трикотажные с ПВХ', 'Перчатки', 0.05, 0.15, 38, {
    unit: 'пар',
    units: [{ unit: 'уп.', factor: 100 }],
    min: 1000,
    max: 10000,
  }),
  piece('ppe', 'p-suit', 'СИЗ-КС-БР', 'Костюм сварщика брезентовый', 'Спецодежда', 3.2, 8, 5600, {
    attrs: { size: '52-54', height: '182-188' },
    min: 20,
    max: 200,
  }),
  piece('ppe', 'p-mask', 'СИЗ-МС-ХАМ', 'Маска сварщика «хамелеон»', 'Защита лица', 0.5, 4, 3900, { min: 10, max: 100 }),
  piece('ppe', 'p-helmet', 'СИЗ-КАСКА', 'Каска защитная', 'Защита головы', 0.4, 5, 650, { min: 30, max: 300 }),
  piece('ppe', 'p-resp', 'СИЗ-FFP2', 'Респиратор FFP2', 'Защита дыхания', 0.02, 0.1, 95, { min: 500, max: 5000 }),

  // ----- Запчасти -----
  piece('parts', 'p-bear', 'ЗЧ-ПШ-6205', 'Подшипник 6205-2RS', 'Подшипники', 0.13, 0.1, 340, {
    attrs: { oem: '6205-2RS' },
  }),
  piece('parts', 'p-belt', 'ЗЧ-РМ-B1500', 'Ремень клиновой B-1500', 'Ремни', 0.3, 0.5, 520),
  piece('parts', 'p-filter', 'ЗЧ-ФМ-КМП', 'Фильтр масляный компрессора', 'Фильтры', 0.6, 1.5, 1900),

  // ----- Оборудование (на паллетах, по серийным номерам) -----
  piece(
    'equipment',
    'p-weld350',
    'ОБ-ПА-350',
    'Сварочный полуавтомат 350 А',
    'Сварочное оборудование',
    65,
    220,
    185000,
    {
      tareTypeId: 't-eur',
      perTare: 1,
      attrs: { model: 'ПДГ-350', power: '15 кВА' },
      min: 2,
      max: 20,
    },
  ),
  piece('equipment', 'p-comp', 'ОБ-КМП-500', 'Компрессор поршневой 500 л/мин', 'Компрессоры', 110, 450, 96000, {
    tareTypeId: 't-eur',
    perTare: 1,
    attrs: { model: 'КП-500', power: '3 кВт' },
    min: 1,
    max: 8,
  }),
  piece('equipment', 'p-hoist', 'ОБ-ТР-3', 'Таль ручная цепная 3 т', 'Грузоподъёмное', 24, 30, 21000, {
    tareTypeId: 't-eur',
    perTare: 6,
    attrs: { model: 'ТРШ-3', power: '3 т' },
    min: 4,
    max: 30,
  }),

  // ----- IT-оборудование (виртуальный склад) -----
  piece('it', 'p-nb', 'IT-НБ-15', 'Ноутбук 15,6" (i5, 16 ГБ)', 'Компьютеры', 1.9, 6, 78000, { min: 5, max: 40 }),
  piece('it', 'p-mon', 'IT-МН-27', 'Монитор 27"', 'Мониторы', 6, 35, 24000, { min: 5, max: 30 }),
  piece('it', 'p-mfp', 'IT-МФУ-A4', 'МФУ лазерное A4', 'Печать', 15, 70, 42000, { min: 1, max: 10 }),
  piece('it', 'p-sw', 'IT-КМ-24', 'Коммутатор 24×1G PoE', 'Сеть', 4, 12, 56000, { min: 1, max: 10 }),
  piece('it', 'p-srv', 'IT-СРВ-2U', 'Сервер 2U', 'Серверы', 25, 80, 690000, { min: 0, max: 6 }),
  piece('it', 'p-ups', 'IT-ИБП-3', 'ИБП 3 кВА', 'Электропитание', 28, 40, 88000, { min: 1, max: 8 }),
  piece('it', 'p-tsd', 'IT-ТСД', 'Терминал сбора данных (ТСД)', 'Складская техника', 0.5, 2, 52000, {
    min: 2,
    max: 20,
  }),
  piece('it', 'p-cart', 'IT-КРТ-A4', 'Картридж для МФУ', 'Расходные', 0.8, 2.5, 6900, {
    tracking: 'none',
    min: 10,
    max: 60,
  }),
  piece('it', 'p-phone', 'IT-ТЛФ-IP', 'IP-телефон', 'Телефония', 1, 3, 9500, { min: 3, max: 30 }),

  // ----- Полуфабрикаты (по заказам / строительным номерам) -----
  piece('semi', 'p-spool', 'ПФ-УТ-50-045', 'Узел трубопровода Ду50 (спул)', 'Узлы трубопроводов', 38, 220, 21000, {
    tareTypeId: 't-eur',
    perTare: 4,
    attrs: { drawing: '02790.321.045', section: 'Система осушения', material: 'ст. 20', mass: '38' },
    max: 80,
  }),
  piece('semi', 'p-fund', 'ПФ-ФН-112', 'Фундамент под насос, сварной', 'Фундаменты', 320, 900, 64000, {
    tareTypeId: 't-eur',
    perTare: 1,
    attrs: { drawing: '02790.311.112', section: 'МО', material: 'РС A', mass: '320' },
    max: 20,
  }),
  piece('semi', 'p-knee', 'ПФ-КН-300', 'Кница 300×300×10', 'Детали корпуса', 6.5, 1, 1400, {
    tareTypeId: 't-eur',
    perTare: 80,
    attrs: { drawing: '02790.120.034', section: 'Секция 2С-14', material: 'РС A', mass: '6,5' },
    max: 1200,
  }),
  piece('semi', 'p-flor', 'ПФ-ФЛ-1200', 'Флор 1200×600×10', 'Детали корпуса', 55, 8, 9800, {
    tareTypeId: 't-eur',
    perTare: 12,
    attrs: { drawing: '02790.120.058', section: 'Секция 2С-14', material: 'РС A', mass: '55' },
    max: 240,
  }),
  piece('semi', 'p-bracket', 'ПФ-БР-400', 'Бракета 400×400×12', 'Детали корпуса', 12, 2, 2100, {
    tareTypeId: 't-eur',
    perTare: 40,
    attrs: { drawing: '02790.120.061', section: 'Секция 3С-02', material: 'РС A', mass: '12' },
    max: 600,
  }),
  piece(
    'semi',
    'p-pipesec',
    'ПФ-ТС-100',
    'Трубная секция Ду100 L=6 м, изолированная',
    'Узлы трубопроводов',
    95,
    120,
    38000,
    {
      storage: 'long',
      attrs: { drawing: '02790.322.017', section: 'Система балласта', material: 'ст. 20', mass: '95' },
      max: 40,
    },
  ),
  piece('semi', 'p-hatch', 'ПФ-КЛ-1200', 'Комингс люка 1200×800 (узел)', 'Узлы корпуса', 450, 3000, 86000, {
    storage: 'bulk',
    attrs: { drawing: '02790.150.008', section: 'Палуба', material: 'РС A', mass: '450' },
    max: 12,
  }),
  piece('semi', 'p-sect', 'ПФ-СК-2С14', 'Секция двойного дна 2С-14', 'Секции корпуса', 18000, 180000, 4200000, {
    storage: 'bulk',
    attrs: { drawing: '02790.100.214', section: 'двойное дно', material: 'РС A / D32', mass: '18 000' },
    max: 6,
    color: '#5a8a8a',
  }),

  // ----- Готовые изделия (по заказам и заводским номерам) -----
  piece('finished', 'p-grsch', 'ГИ-ГРЩ-1', 'Главный распределительный щит ГРЩ-1', 'Электрощиты', 1800, 9000, 5400000, {
    storage: 'bulk',
    attrs: { drawing: '02790.700.001', mass: '1 800', otk: 'Принят ОТК, РС' },
    max: 3,
    color: '#cfd6dd',
  }),
  piece(
    'finished',
    'p-pumpu',
    'ГИ-НА-40',
    'Насосный агрегат НЦВ 40/30 в сборе',
    'Насосные агрегаты',
    420,
    1500,
    640000,
    {
      tareTypeId: 't-eur',
      perTare: 1,
      attrs: { drawing: '02790.530.040', mass: '420', otk: 'Принят ОТК' },
      max: 12,
      color: '#2f6fd0',
    },
  ),
  piece('finished', 'p-door', 'ГИ-ДВ-ВГН', 'Дверь судовая стальная ВГН 600×1600', 'Закрытия', 180, 500, 112000, {
    tareTypeId: 't-eur',
    perTare: 2,
    attrs: { drawing: '02790.210.016', mass: '180', otk: 'Принят ОТК' },
    max: 24,
    color: '#8d99a6',
  }),
  piece('finished', 'p-port', 'ГИ-ИЛ-400', 'Иллюминатор бортовой ø400', 'Закрытия', 35, 60, 48000, {
    tareTypeId: 't-eur',
    perTare: 8,
    attrs: { drawing: '02790.220.004', mass: '35', otk: 'Принят ОТК' },
    max: 40,
  }),
  piece('finished', 'p-ladder', 'ГИ-ТР-6', 'Трап забортный 6 м', 'Дельные вещи', 260, 2400, 186000, {
    storage: 'bulk',
    attrs: { drawing: '02790.260.002', mass: '260', otk: 'Принят ОТК' },
    max: 6,
  }),
  piece('finished', 'p-vbox', 'ГИ-КК-6', 'Клапанная коробка КК-6', 'Арматурные узлы', 240, 400, 156000, {
    tareTypeId: 't-eur',
    perTare: 1,
    attrs: { drawing: '02790.540.006', mass: '240', otk: 'Принят ОТК' },
    max: 12,
  }),
];

/** Кладовые производства — получатели ТМЦ из зоны выдачи. */
export const DEMO_CONSUMERS: Consumer[] = [
  {
    id: 'c-01',
    code: 'К-01',
    name: 'Кладовая корпусообрабатывающего цеха',
    shop: 'Цех №1 (КОЦ)',
    responsible: 'Смирнова О. Н.',
  },
  {
    id: 'c-02',
    code: 'К-02',
    name: 'Кладовая сборочно-сварочного цеха',
    shop: 'Цех №2 (ССЦ)',
    responsible: 'Кузнецов А. И.',
  },
  { id: 'c-03', code: 'К-03', name: 'Кладовая трубомедницкого цеха', shop: 'Цех №5', responsible: 'Волкова Е. С.' },
  { id: 'c-04', code: 'К-04', name: 'Кладовая электромонтажного цеха', shop: 'Цех №7', responsible: 'Морозов Д. В.' },
  {
    id: 'c-05',
    code: 'К-05',
    name: 'Кладовая малярного участка',
    shop: 'Участок окраски',
    responsible: 'Новикова Т. А.',
  },
];

/** Поставщики, у которых находится возвратная тара (заправка баллонов, возврат барабанов). */
export const SUPPLIERS: Record<string, string> = {
  '@П:Газы': 'Поставщик технических газов (заправка)',
  '@П:Кабель': 'Кабельный завод (возврат барабанов)',
  '@П:Металл': 'Металлобаза (возврат кассет)',
};
