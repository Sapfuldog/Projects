import type { Batch, Cell, Consumer, Inventory, OpEvent, OpType, Product, Rack, TareType, Warehouse } from '../types';
import { buildCells } from './rack';
import { DAY, historyPoint, locationStats, startOfDay } from './analytics';
import {
  addStock,
  addTare,
  cellUsage,
  emptyInventory,
  floorTo,
  qtyStep,
  skey,
  splitKey,
  tarePlaces,
  unitsFit,
  type CellUse,
} from './inventory';

// Демо-данные «учётной системы»: срез остатков склада, партии (плавки, сертификаты, сроки годности,
// заказы), тара и баллоны, журнал движений и история заполнения. В рабочем режиме всё это приходит
// из 1С/WMS, здесь — генерируется, чтобы показать мониторинг и контроль.

/** Детерминированный генератор случайных чисел (одинаковое демо при каждом создании). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoCtx {
  products: Map<string, Product>;
  tareTypes: Map<string, TareType>;
  consumers: Consumer[];
}

/** Где в демо хранится товар: шаблон кода стеллажа. */
export function homeOf(p: Product): RegExp {
  switch (p.group) {
    case 'metal':
      return p.storage === 'bulk' ? /^Ш\d$/ : /^К\d$/;
    case 'welding':
      return p.storage === 'pallet' ? /^А[1-3]$/ : /^М1\d$/;
    case 'valves':
      return p.storage === 'pallet' ? /^А[3-5]$/ : /^М1\d$/;
    case 'paint':
    case 'chem':
      return /^Л\d$/;
    case 'gas':
      return p.attrs?.class === 'горючий' ? /^Б[12]$/ : /^Б[345]$/;
    case 'hardware':
      return /^М1\d$/;
    case 'cable':
      return /^Н\d$/;
    case 'electro':
      return /^(Э\d|М2\d)$/;
    case 'tools':
      return /^М3\d$/;
    case 'consumables':
      return /^(М1\d|М2\d|М3\d|А7)$/;
    case 'ppe':
      return /^(М2\d|А[67])$/;
    case 'parts':
      return /^(М2\d|М3\d|Э\d)$/;
    case 'equipment':
      return /^А[4-6]$/;
    case 'semi':
      if (p.id === 'p-sect') return /^ПК\d$/;
      if (p.storage === 'bulk' || p.id === 'p-fund') return /^ПФ[12]$/;
      return p.storage === 'long' ? /^К[45]$/ : /^(ПФ3|А[12])$/;
    case 'finished':
      return p.storage === 'bulk' ? /^ГИ[13]$/ : /^ГИ2$/;
    case 'it':
      return /^$/;
    default:
      return /^А\d$/;
  }
}

/** Средняя занятость стеллажей в демо. */
const OCCUPANCY: [RegExp, number][] = [
  [/^А\d$/, 0.8],
  [/^М1\d$/, 0.82],
  [/^М2\d$/, 0.72],
  [/^М3\d$/, 0.6],
  [/^Л\d$/, 0.72],
  [/^Б\d$/, 0.9],
  [/^Н\d$/, 0.72],
  [/^К\d$/, 0.8],
  [/^Ш\d$/, 0.9],
  [/^ПФ\d$/, 0.7],
  [/^ПК\d$/, 0.6],
  [/^ГИ\d$/, 0.7],
  [/^Э\d$/, 0.62],
];

const SERIAL_PREFIX: Partial<Record<Product['group'], string>> = {
  tools: 'ИН-',
  equipment: 'ЗН-',
  finished: 'ЗН-',
  it: 'SN',
};

/** Кладовые, которым обычно выдают группу ТМЦ. */
const CONSUMER_BY_GROUP: Partial<Record<Product['group'], string[]>> = {
  metal: ['К-01', 'К-02', 'К-03'],
  welding: ['К-02', 'К-01', 'К-03'],
  paint: ['К-05'],
  chem: ['К-05', 'К-03'],
  gas: ['К-02', 'К-01', 'К-03'],
  valves: ['К-03'],
  hardware: ['К-02', 'К-03', 'К-04'],
  cable: ['К-04'],
  electro: ['К-04'],
  semi: ['К-02', 'К-03'],
  finished: ['К-02', 'К-03', 'К-04'],
};

const USERS = [
  'Кладовщик Иванова Н.',
  'Кладовщик Петров С.',
  'Кладовщик Сидорова Е.',
  'Водитель Зайцев А.',
  'Приёмщик Орлов В.',
];

interface Builder {
  w: Warehouse;
  ctx: DemoCtx;
  cells: Cell[];
  byAddress: Map<string, Cell>;
  rackById: Map<string, Rack>;
  inv: Inventory;
  rand: () => number;
  now: number;
  /** Нагрузка секций и стеллажей, кг */
  secLoad: Map<string, number>;
  rackLoad: Map<string, number>;
  seq: number;
}

const pick = <T>(arr: T[], rand: () => number): T => arr[Math.floor(rand() * arr.length) % arr.length];
const isCount = (unit: string) => unit === 'шт' || unit === 'пар' || unit === 'бал.';
const pad = (n: number, d: number) => String(n).padStart(d, '0');
const dateStr = (t: number) => new Date(t).toLocaleDateString('ru-RU');

function usageOf(b: Builder, address: string): CellUse | undefined {
  const items = b.inv.stock[address];
  const tare = b.inv.tare[address];
  if (!items && !tare) return undefined;
  return cellUsage(
    { stock: items ? { [address]: items } : {}, tare: tare ? { [address]: tare } : {} },
    b.ctx.products,
    b.byAddress,
    b.ctx.tareTypes,
  ).get(address);
}

/** Остаток нагрузки секции и стеллажа, кг. */
function loadLeft(b: Builder, c: Cell): number | undefined {
  const r = b.rackById.get(c.rackId);
  if (!r) return undefined;
  const left: number[] = [];
  if (r.sectionLoad) left.push(r.sectionLoad - (b.secLoad.get(`${r.id}:${c.section}`) ?? 0));
  if (r.maxLoad) left.push(r.maxLoad - (b.rackLoad.get(r.id) ?? 0));
  return left.length ? Math.max(0, Math.min(...left)) : undefined;
}

function addLoad(b: Builder, c: Cell, kg: number) {
  if (!c.rackId) return;
  const k = `${c.rackId}:${c.section}`;
  b.secLoad.set(k, (b.secLoad.get(k) ?? 0) + kg);
  b.rackLoad.set(c.rackId, (b.rackLoad.get(c.rackId) ?? 0) + kg);
}

/** Новая партия товара (плавка и сертификат, срок годности, заказ или заводской номер). */
function newBatch(b: Builder, p: Product, receivedAt: number, serial?: number): Batch {
  const r = b.rand;
  const id = `b-${p.id.slice(2)}-${(b.seq++).toString(36)}`;
  const batch: Batch = { id, productId: p.id, number: '', receivedAt };
  switch (p.group) {
    case 'metal':
      batch.number = `П-${pad(1000 + Math.floor(r() * 8999), 4)}`;
      batch.heat = `${pick(['2Т', '4Б', '1К', '7М'], r)}-${pad(Math.floor(r() * 99999), 5)}`;
      batch.cert = `Серт. № ${Math.floor(1000 + r() * 8000)}/${new Date(receivedAt).getFullYear() % 100}`;
      batch.supplier = 'Металлобаза';
      break;
    case 'welding':
    case 'cable':
      batch.number = `П-${pad(Math.floor(r() * 99999), 5)}`;
      batch.cert = `Серт. № ${Math.floor(100 + r() * 9000)}`;
      break;
    case 'paint':
    case 'chem':
      batch.number = `${pad(Math.floor(r() * 9999), 4)}/${new Date(receivedAt).getMonth() + 1}`;
      batch.cert = `Паспорт № ${Math.floor(100 + r() * 900)}`;
      if (p.shelfLife) batch.expiry = startOfDay(receivedAt + p.shelfLife * DAY);
      break;
    case 'semi':
      batch.number = `ПФ-${pad(Math.floor(r() * 9999), 4)}`;
      batch.order = pick(['Заказ 02790', 'Заказ 02790', 'Заказ 02791'], r);
      break;
    default:
      if (serial !== undefined) batch.number = `${SERIAL_PREFIX[p.group] ?? 'SN'}${pad(serial, 6)}`;
      else batch.number = `П-${pad(Math.floor(r() * 99999), 5)}`;
      if (p.group === 'finished') batch.order = pick(['Заказ 02790', 'Заказ 02791'], r);
  }
  b.inv.batches[id] = batch;
  return batch;
}

/** Активные партии товара в демо (1–3 на товар). */
const lots = new WeakMap<Builder, Map<string, Batch[]>>();
function lotFor(b: Builder, p: Product): Batch | undefined {
  if (p.tracking !== 'batch') return undefined;
  let m = lots.get(b);
  if (!m) lots.set(b, (m = new Map()));
  let list = m.get(p.id);
  if (!list) {
    list = [];
    const n = 1 + Math.floor(b.rand() * 3);
    for (let i = 0; i < n; i++) {
      // Срок годности: партия получена так, чтобы до конца срока оставалось от 1,5 до 10 месяцев
      const back = p.shelfLife ? Math.min(p.shelfLife - 45, 30 + b.rand() * (p.shelfLife - 75)) : 20 + b.rand() * 300;
      list.push(newBatch(b, p, startOfDay(b.now - Math.max(5, back) * DAY)));
    }
    m.set(p.id, list);
  }
  return pick(list, b.rand);
}

/** Положить товар в ячейку (с партиями и учётом нагрузки стеллажа). */
function put(b: Builder, c: Cell, p: Product, qty: number, batch?: Batch) {
  if (qty <= 0) return;
  if (p.tracking === 'serial' && !batch && qty <= 12 && Number.isInteger(qty)) {
    for (let i = 0; i < qty; i++) {
      const s = newBatch(b, p, startOfDay(b.now - (10 + b.rand() * 400) * DAY), 100000 + b.seq * 7 + i);
      addStock(b.inv.stock, c.address, skey(p.id, s.id), 1);
    }
  } else {
    const lot = batch ?? lotFor(b, p);
    addStock(b.inv.stock, c.address, skey(p.id, lot?.id), qty);
  }
  addLoad(b, c, qty * p.weight);
}

/** Сколько положить: целые паллеты/барабаны/баллоны, остальное — доля от того, что помещается. */
function chooseQty(p: Product, fit: number, rand: () => number, lo = 0.35, hi = 0.95): number {
  const step = qtyStep(p.unit);
  if (p.perTare && fit >= p.perTare) {
    const units = Math.floor(fit / p.perTare + 1e-9);
    const k = Math.max(1, Math.round(units * (0.6 + 0.4 * rand())));
    let q = k * p.perTare;
    if (rand() < 0.3) q -= floorTo(p.perTare * rand() * 0.6, step);
    return Math.max(step, floorTo(q, step));
  }
  const q = fit * (lo + (hi - lo) * rand());
  return isCount(p.unit) ? Math.max(1, Math.floor(q)) : Math.max(step, floorTo(q, step));
}

function fillRack(b: Builder, r: Rack, candidates: Product[], occ: number) {
  const cells = b.cells.filter((c) => c.rackId === r.id);
  let prev: Product | undefined;
  for (const c of cells) {
    if (c.blocked || c.reservedFor) continue;
    const tierK = c.tier >= 5 ? 0.75 : c.tier === 4 ? 0.9 : 1;
    if (b.rand() > occ * tierK) continue;
    // Баллонные стойки: каждая секция — свой газ; остальные стеллажи — товары «пятнами»
    const p =
      c.cellType === 'cylinder'
        ? candidates[(r.code.charCodeAt(1) + c.section) % candidates.length]
        : prev && b.rand() < 0.55
          ? prev
          : pick(candidates, b.rand);
    const fit = unitsFit(c, usageOf(b, c.address), p, { loadLeft: loadLeft(b, c) });
    if (fit <= 0) continue;
    const tools = p.group === 'tools';
    put(b, c, p, chooseQty(p, fit, b.rand, tools ? 0.15 : 0.35, tools ? 0.45 : 0.95));
    prev = p;
    // Баллонные места: часть мест занимают пустые баллоны (возвратная тара)
    if (c.cellType === 'cylinder' && p.tareTypeId) {
      const u = usageOf(b, c.address);
      const free = c.places - (u?.places ?? 0);
      const empty = Math.floor(free * b.rand() * 0.8);
      if (empty > 0) addTare(b.inv.tare, c.address, p.tareTypeId, empty);
    }
  }
}

const cellAt = (b: Builder, rackCode: string, s: number, t: number, p: number) => {
  const r = b.w.racks.find((x) => x.code === rackCode);
  return r ? b.cells.find((c) => c.rackId === r.id && c.section === s && c.tier === t && c.pos === p) : undefined;
};

function clearCell(b: Builder, c: Cell) {
  const u = usageOf(b, c.address);
  if (u) addLoad(b, c, -u.weight);
  delete b.inv.stock[c.address];
  delete b.inv.tare[c.address];
}

/** Намеренные нарушения правил хранения — чтобы раздел «Контроль» было на чём показать. */
function addViolations(b: Builder) {
  const P = (id: string) => b.ctx.products.get(id)!;
  const set = (code: string, s: number, t: number, p: number, items: [string, number, Partial<Batch>?][]) => {
    const c = cellAt(b, code, s, t, p);
    if (!c) return;
    clearCell(b, c);
    for (const [pid, qty, patch] of items) {
      const prod = P(pid);
      let batch: Batch | undefined;
      if (patch) batch = { ...newBatch(b, prod, startOfDay(b.now - 200 * DAY)), ...patch };
      if (batch) b.inv.batches[batch.id] = batch;
      put(b, c, prod, qty, batch);
    }
  };
  // Перегруз ячейки: метизы 1 180 кг при допустимых 1 000 кг
  set('А2', 4, 2, 1, [['p-b12', 1180]]);
  // ЛКМ в обычном корпусе (вне склада ЛВЖ)
  set('А6', 2, 1, 3, [['p-pf115', 640]]);
  // Разные товары в паллетной ячейке и мест больше, чем есть
  set('А4', 7, 1, 2, [
    ['p-zd100', 12],
    ['p-hoist', 6],
  ]);
  // Длинномер в паллетной ячейке — тип ячейки не подходит
  set('А5', 9, 1, 1, [['p-pipe57', 0.25]]);
  // Груз остался в заблокированной ячейке (повреждена балка)
  set('А3', 6, 2, 2, [['p-n12', 380]]);
  // Обычный товар в зоне ЛВЖ
  set('Л3', 3, 3, 3, [['p-b12', 400]]);
  // Просроченная и истекающая партии ЛКМ
  set('Л1', 2, 1, 1, [['p-ep0140', 640, { expiry: startOfDay(b.now - 18 * DAY), number: '0417/3' }]]);
  set('Л1', 3, 2, 2, [['p-af', 520, { expiry: startOfDay(b.now + 12 * DAY), number: '1188/9' }]]);
  // Перегруз секции 2 стеллажа Л2 (рамы на 6 т)
  for (let t = 1; t <= 3; t++)
    for (let p = 1; p <= 3; p++) {
      const pid = (t + p) % 2 ? 'p-oil' : 'p-ep773';
      set('Л2', 2, t, p, [[pid, pid === 'p-oil' ? 800 : 640]]);
    }
  // Кислород в отсеке горючих газов
  set('Б2', 3, 1, 1, [
    ['p-c3h8', 5],
    ['p-o2', 2],
  ]);
  // Полуфабрикат на площадке листового проката (зона не для этой группы)
  set('Ш2', 3, 1, 2, [['p-fund', 1]]);
}

/** Комплекты для кладовых в зоне выдачи, приёмка, карантин. */
function fillService(b: Builder) {
  const P = (id: string) => b.ctx.products.get(id)!;
  const kits: Record<string, string[]> = {
    'c-01': ['p-cut125', 'p-gloves', 'p-mr3'],
    'c-02': ['p-uoni4', 'p-wire12', 'p-gloves', 'p-grind125'],
    'c-03': ['p-fl50', 'p-otv57', 'p-kran25', 'p-ozl8'],
    'c-04': ['p-gland', 'p-jbox', 'p-qf25'],
    'c-05': ['p-rag', 'p-resp', 'p-brush'],
  };
  for (const c of b.cells) {
    if (!c.reservedFor || b.rand() > 0.7) continue;
    const list = kits[c.reservedFor] ?? [];
    const n = 1 + Math.floor(b.rand() * 2);
    for (let i = 0; i < n; i++) {
      const p = P(pick(list, b.rand));
      const fit = unitsFit(c, usageOf(b, c.address), p, { reservedOk: c.reservedFor });
      if (fit > 0) put(b, c, p, chooseQty(p, fit, b.rand, 0.1, 0.35));
    }
  }
  const recv = ['p-uoni4', 'p-wire12', 'p-flux', 'p-hoist', 'p-weld350', 'p-knee', 'p-b12', 'p-suit', 'p-zd100'];
  for (const c of b.cells.filter((x) => b.rackById.get(x.rackId)?.code === 'ПР1')) {
    if (b.rand() > 0.55) continue;
    const p = P(pick(recv, b.rand));
    const fit = unitsFit(c, usageOf(b, c.address), p);
    if (fit > 0) put(b, c, p, chooseQty(p, fit, b.rand, 0.5, 1));
  }
  const quar: [string, number, string][] = [
    ['p-zd100', 4, 'Брак: трещина корпуса, акт № 112'],
    ['p-door', 1, 'Брак: не держит давление, рекламация'],
    ['p-flor', 6, 'Несоответствие чертежу, ждёт решения ОТК'],
  ];
  const qc = b.cells.filter((x) => b.rackById.get(x.rackId)?.code === 'КР1');
  quar.forEach(([pid, qty], i) => {
    const c = qc[i * 2];
    if (c) put(b, c, P(pid), qty);
  });
}

/** Пустая тара на складе, у кладовых и у поставщиков. */
function fillTare(b: Builder) {
  const T1 = b.cells.filter((x) => b.rackById.get(x.rackId)?.code === 'Т1');
  const T2 = b.cells.filter((x) => b.rackById.get(x.rackId)?.code === 'Т2');
  const t1: [string, number][] = [
    ['t-eur', 30],
    ['t-eur', 22],
    ['t-fin', 12],
    ['t-drum', 7],
    ['t-bin', 15],
    ['t-eur', 18],
  ];
  t1.forEach(([tid, n], i) => T1[i] && addTare(b.inv.tare, T1[i].address, tid, n));
  const t2: [string, number][] = [
    ['t-reel', 3],
    ['t-reel', 4],
    ['t-cass', 6],
    ['t-reel', 2],
    ['t-cass', 4],
    ['t-eur', 45],
    ['t-reel', 3],
    ['t-fin', 30],
  ];
  t2.forEach(([tid, n], i) => T2[i] && addTare(b.inv.tare, T2[i].address, tid, n));
  const parties: Record<string, Record<string, number>> = {
    '@К-01': { 't-o2': 14, 't-c3h8': 5, 't-eur': 12 },
    '@К-02': { 't-o2': 22, 't-mix': 18, 't-ar': 4, 't-c3h8': 8, 't-eur': 20 },
    '@К-03': { 't-o2': 6, 't-c2h2': 3, 't-ar': 6, 't-eur': 4 },
    '@К-04': { 't-reel': 5, 't-eur': 6 },
    '@К-05': { 't-drum': 4, 't-eur': 9 },
    '@П:Газы': { 't-o2': 24, 't-c3h8': 6, 't-ar': 6, 't-mix': 12, 't-co2': 4, 't-c2h2': 2 },
    '@П:Кабель': { 't-reel': 9 },
    '@П:Металл': { 't-cass': 4 },
  };
  for (const [place, items] of Object.entries(parties))
    for (const [tid, n] of Object.entries(items)) addTare(b.inv.tare, place, tid, n);
}

/** Журнал движений за 30 дней и дата последнего движения по ячейкам. */
function fillJournal(b: Builder, days = 30) {
  const occupied = Object.keys(b.inv.stock).filter((a) => b.byAddress.has(a));
  if (!occupied.length) return;
  // «Горячие» ячейки — выдача, нижние ярусы мезонина, баллоны, кабель: к ним обращаются чаще
  const weight = (a: string): number => {
    const c = b.byAddress.get(a)!;
    const code = b.rackById.get(c.rackId)?.code ?? '';
    if (c.reservedFor || /^Б/.test(code)) return 12;
    if (/^М[12]/.test(code) && c.tier <= 3) return 6;
    if (/^(Н|Л|К\d)/.test(code)) return 3;
    if (/^(КР|ПК)/.test(code)) return 0;
    return c.tier <= 2 ? 2 : 0.6;
  };
  const weights = occupied.map(weight);
  const total = weights.reduce((s, v) => s + v, 0);
  const pickCell = () => {
    let x = b.rand() * total;
    for (let i = 0; i < occupied.length; i++) {
      x -= weights[i];
      if (x <= 0) return occupied[i];
    }
    return occupied[occupied.length - 1];
  };
  const consumersOf = (p?: Product) => CONSUMER_BY_GROUP[p?.group ?? 'general'] ?? b.ctx.consumers.map((c) => c.code);
  const events: OpEvent[] = [];
  const today = startOfDay(b.now);
  for (let d = days - 1; d >= 0; d--) {
    const day = today - d * DAY;
    const wd = new Date(day).getDay();
    const n = wd === 0 || wd === 6 ? 4 + Math.floor(b.rand() * 8) : 28 + Math.floor(b.rand() * 30);
    const times = Array.from({ length: n }, () => day + (7.5 + b.rand() * 9) * 3600000)
      .filter((t) => t < b.now)
      .sort((a, c) => a - c);
    for (const at of times) {
      const address = pickCell();
      const keys = Object.keys(b.inv.stock[address] ?? {});
      if (!keys.length) continue;
      const [pid, bid] = splitKey(pick(keys, b.rand));
      const p = b.ctx.products.get(pid);
      if (!p) continue;
      const step = qtyStep(p.unit);
      const have = b.inv.stock[address][skey(pid, bid)] ?? 0;
      const part = isCount(p.unit)
        ? Math.max(1, Math.round(have * 0.2 * b.rand()))
        : Math.max(step, floorTo(have * 0.25 * b.rand(), step));
      const x = b.rand();
      const type: OpType = x < 0.5 ? 'issue' : x < 0.75 ? 'receipt' : x < 0.88 ? 'move' : x < 0.95 ? 'return' : 'count';
      const e: OpEvent = {
        id: `ev${(b.seq++).toString(36)}`,
        at,
        type,
        productId: pid,
        batchId: bid,
        qty: part,
        user: pick(USERS, b.rand),
      };
      if (type === 'issue') {
        e.from = address;
        e.party = `@${pick(consumersOf(p), b.rand)}`;
      } else if (type === 'receipt') {
        e.to = address;
        e.party = p.group === 'metal' ? 'Металлобаза' : p.group === 'gas' ? 'Поставщик газов' : 'Поставщик';
      } else if (type === 'return') {
        e.to = address;
        e.party = `@${pick(consumersOf(p), b.rand)}`;
      } else if (type === 'move') {
        const other = occupied.find(
          (a) => a !== address && Object.keys(b.inv.stock[a] ?? {}).some((k) => splitKey(k)[0] === pid),
        );
        if (other) {
          e.from = other;
          e.to = address;
        } else {
          e.type = 'issue';
          e.from = address;
          e.party = `@${pick(consumersOf(p), b.rand)}`;
        }
      } else {
        e.to = address;
        e.qty = b.rand() < 0.5 ? step : -step;
      }
      if (p.group === 'gas' && p.tareTypeId && type === 'issue') {
        // Обмен баллонов: кладовая сдаёт пустые
        events.push(e, {
          id: `ev${(b.seq++).toString(36)}`,
          at: at + 60000,
          type: 'tare',
          tareTypeId: p.tareTypeId,
          qty: part,
          from: e.party,
          to: address,
          user: e.user,
          note: 'Возврат пустых баллонов',
        });
        continue;
      }
      events.push(e);
    }
  }
  b.inv.events = events;
  const last: Record<string, number> = {};
  for (const e of events)
    for (const a of [e.from, e.to]) if (a && !a.startsWith('@') && (last[a] ?? 0) < e.at) last[a] = e.at;
  for (const a of occupied) {
    if (last[a]) continue;
    const code = b.rackById.get(b.byAddress.get(a)!.rackId)?.code ?? '';
    const idle = /^(КР|ПК)/.test(code) || b.rand() < 0.05;
    last[a] = b.now - (idle ? 95 + b.rand() * 160 : 31 + b.rand() * 55) * DAY;
  }
  b.inv.lastMove = last;
}

/** История заполнения: сглаженный рост к текущему значению с небольшим шумом. */
function fillHistory(b: Builder, days = 60) {
  const usage = cellUsage(b.inv, b.ctx.products, b.byAddress, b.ctx.tareTypes);
  const s = locationStats(b.cells, usage, b.ctx.products).all;
  const now = historyPoint(b.now, s);
  const out = [];
  for (let d = days - 1; d >= 1; d--) {
    const k = 1 - d * 0.0028 + (b.rand() - 0.5) * 0.03;
    out.push({
      at: startOfDay(b.now) - d * DAY,
      cells: now.cells,
      occupied: Math.min(now.cells, Math.round(now.occupied * k)),
      places: now.places,
      usedPlaces: Math.min(now.places, Math.round(now.usedPlaces * k)),
      weight: Math.round(now.weight * (k + (b.rand() - 0.5) * 0.02) * 10) / 10,
    });
  }
  out.push(now);
  b.inv.history = out;
}

function builder(w: Warehouse, ctx: DemoCtx, now: number, seed: number): Builder {
  const cells = buildCells(w);
  return {
    w,
    ctx,
    cells,
    byAddress: new Map(cells.map((c) => [c.address, c])),
    rackById: new Map(w.racks.map((r) => [r.id, r])),
    inv: emptyInventory(),
    rand: seeded(seed),
    now,
    secLoad: new Map(),
    rackLoad: new Map(),
    seq: 1,
  };
}

/** Срез остатков физического склада: ячейки заполнены по назначению зон, плюс нарушения, тара, журнал. */
export function demoSnapshot(w: Warehouse, ctx: DemoCtx, now = Date.now(), seed = 7): Inventory {
  if (w.kind === 'virtual') return demoVirtualSnapshot(w, ctx, now, seed);
  const b = builder(w, ctx, now, seed);
  const products = [...ctx.products.values()];
  for (const r of w.racks) {
    const candidates = products.filter((p) => homeOf(p).test(r.code));
    if (!candidates.length) continue;
    const occ = OCCUPANCY.find(([re]) => re.test(r.code))?.[1] ?? 0.65;
    fillRack(b, r, candidates, occ);
  }
  fillService(b);
  addViolations(b);
  fillTare(b);
  fillJournal(b);
  b.inv.updatedAt = now;
  fillHistory(b);
  return b.inv;
}

/** Виртуальный IT-склад: оборудование по местам учёта с серийными номерами. */
export function demoVirtualSnapshot(w: Warehouse, ctx: DemoCtx, now = Date.now(), seed = 11): Inventory {
  const b = builder(w, ctx, now, seed);
  const plan: [string, Record<string, number>][] = [
    ['p-nb', { 'IT-СКЛ': 9, 'IT-ОГТ': 8, 'IT-БУХ': 6, 'IT-Ц07': 5, 'IT-СКЛ1': 2, 'IT-РЕМ': 2, 'IT-ПУТЬ': 4 }],
    ['p-mon', { 'IT-СКЛ': 7, 'IT-ОГТ': 8, 'IT-БУХ': 6, 'IT-Ц07': 3, 'IT-ПУТЬ': 6 }],
    ['p-mfp', { 'IT-СКЛ': 1, 'IT-ОГТ': 2, 'IT-БУХ': 2, 'IT-Ц07': 1, 'IT-СКЛ1': 1, 'IT-РЕМ': 1 }],
    ['p-sw', { 'IT-СКЛ': 2, 'IT-ЦОД': 6, 'IT-Ц07': 2 }],
    ['p-srv', { 'IT-ЦОД': 5, 'IT-РЕМ': 1 }],
    ['p-ups', { 'IT-СКЛ': 1, 'IT-ЦОД': 4, 'IT-БУХ': 1 }],
    ['p-tsd', { 'IT-СКЛ': 2, 'IT-СКЛ1': 10, 'IT-РЕМ': 2 }],
    ['p-cart', { 'IT-СКЛ': 26, 'IT-БУХ': 4 }],
    ['p-phone', { 'IT-СКЛ': 6, 'IT-ОГТ': 8, 'IT-БУХ': 6, 'IT-Ц07': 4 }],
  ];
  for (const [pid, at] of plan) {
    const p = ctx.products.get(pid);
    if (!p) continue;
    for (const [code, n] of Object.entries(at)) {
      const c = b.byAddress.get(code);
      if (c) put(b, c, p, n);
    }
  }
  // Журнал: выдача сотрудникам, возвраты, ремонт, поступления
  const events: OpEvent[] = [];
  const places = w.places.map((pl) => pl.code);
  const today = startOfDay(now);
  for (let d = 29; d >= 0; d--) {
    const n = 1 + Math.floor(b.rand() * 6);
    for (let i = 0; i < n; i++) {
      const at = today - d * DAY + (9 + b.rand() * 8) * 3600000;
      if (at > now) continue;
      const from = pick(places, b.rand);
      const keys = Object.keys(b.inv.stock[from] ?? {});
      if (!keys.length) continue;
      const [pid, bid] = splitKey(pick(keys, b.rand));
      const to = pick(
        places.filter((x) => x !== from),
        b.rand,
      );
      events.push({
        id: `ev${(b.seq++).toString(36)}`,
        at,
        type: 'move',
        productId: pid,
        batchId: bid,
        qty: 1,
        from,
        to,
        user: 'Инженер IT Козлов Р.',
      });
    }
  }
  b.inv.events = events.sort((x, y) => x.at - y.at);
  const last: Record<string, number> = {};
  for (const e of b.inv.events) for (const a of [e.from, e.to]) if (a && (last[a] ?? 0) < e.at) last[a] = e.at;
  b.inv.lastMove = last;
  b.inv.updatedAt = now;
  fillHistory(b);
  return b.inv;
}

// ---------- Демо-поток: имитация движений в учётной системе ----------

export interface TickInput {
  w: Warehouse;
  cells: Cell[];
  byAddress: Map<string, Cell>;
  ctx: DemoCtx;
  now?: number;
  rand?: () => number;
}

/**
 * Одна «порция» изменений от учётной системы: выдача на кладовые, приход, размещение с приёмки,
 * обмен баллонов, инвентаризация. Меняет переданный срез (подходит для immer-черновика).
 * Возвращает новые события журнала.
 */
export function demoTick(inv: Inventory, x: TickInput): OpEvent[] {
  const now = x.now ?? Date.now();
  const rand = x.rand ?? Math.random;
  const { products, tareTypes } = x.ctx;
  const out: OpEvent[] = [];
  const rackCode = new Map(x.w.racks.map((r) => [r.id, r.code]));
  const usage = (a: string) =>
    cellUsage(
      { stock: inv.stock[a] ? { [a]: inv.stock[a] } : {}, tare: inv.tare[a] ? { [a]: inv.tare[a] } : {} },
      products,
      x.byAddress,
      tareTypes,
    ).get(a);
  const id = () => `ev${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
  const user = pick(USERS, rand);
  const ev = (e: Omit<OpEvent, 'id' | 'at' | 'user'>) => {
    const full: OpEvent = { id: id(), at: now, user, ...e };
    out.push(full);
    for (const a of [e.from, e.to]) if (a && !a.startsWith('@')) inv.lastMove[a] = now;
  };
  const occupied = Object.keys(inv.stock).filter((a) => x.byAddress.has(a));
  const virtual = x.w.kind === 'virtual';
  const r = rand();

  if (virtual) {
    // IT: перемещение единицы оборудования между местами учёта
    const from = pick(occupied, rand);
    const keys = Object.keys(inv.stock[from] ?? {});
    if (!from || !keys.length) return out;
    const k = pick(keys, rand);
    const [pid, bid] = splitKey(k);
    const to = pick(
      x.cells.map((c) => c.address).filter((a) => a !== from),
      rand,
    );
    if (!to) return out;
    addStock(inv.stock, from, k, -1);
    addStock(inv.stock, to, k, 1);
    ev({ type: 'move', productId: pid, batchId: bid, qty: 1, from, to });
  } else if (r < 0.45 && occupied.length) {
    // Выдача на кладовую производства
    const from = pick(occupied, rand);
    const keys = Object.keys(inv.stock[from] ?? {});
    const k = pick(keys, rand);
    const [pid, bid] = splitKey(k);
    const p = products.get(pid);
    if (p && /^(ПР|КР)/.test(rackCode.get(x.byAddress.get(from)!.rackId) ?? '') === false) {
      const have = inv.stock[from][k];
      const step = qtyStep(p.unit);
      let q: number;
      if (p.group === 'gas') q = Math.min(have, 1 + Math.floor(rand() * 4));
      else if (p.perTare && have >= p.perTare * 1.5) q = p.perTare;
      else if (isCount(p.unit)) q = Math.max(1, Math.round(have * (0.1 + 0.3 * rand())));
      else q = Math.max(step, floorTo(have * (0.1 + 0.3 * rand()), step));
      q = Math.min(q, have);
      const consumer = `@${pick(CONSUMER_BY_GROUP[p.group] ?? x.ctx.consumers.map((c) => c.code), rand)}`;
      addStock(inv.stock, from, k, -q);
      ev({ type: 'issue', productId: pid, batchId: bid, qty: q, from, party: consumer });
      if (p.group === 'gas' && p.tareTypeId) {
        // Полные баллоны ушли в кладовую, пустые возвращаются на склад
        addTare(inv.tare, consumer, p.tareTypeId, q);
        const back = Math.min(inv.tare[consumer]?.[p.tareTypeId] ?? 0, Math.round(q * (0.5 + rand() * 0.7)));
        const c = x.byAddress.get(from)!;
        const free = c.places - (usage(from)?.places ?? 0);
        const n = Math.min(back, Math.max(0, free));
        if (n > 0) {
          addTare(inv.tare, consumer, p.tareTypeId, -n);
          addTare(inv.tare, from, p.tareTypeId, n);
          ev({
            type: 'tare',
            tareTypeId: p.tareTypeId,
            qty: n,
            from: consumer,
            to: from,
            note: 'Возврат пустых баллонов',
          });
        }
      }
    }
  } else if (r < 0.7) {
    // Приход: товар уже хранится на складе — пополняем его ячейку или кладём в свободную по назначению
    const present = [...new Set(occupied.flatMap((a) => Object.keys(inv.stock[a]).map((k) => splitKey(k)[0])))]
      .map((pid) => products.get(pid))
      .filter((p): p is Product => !!p && p.group !== 'it');
    const p = present.length ? pick(present, rand) : undefined;
    if (p) {
      const home = homeOf(p);
      const toReceiving =
        !p.hazard && p.storage !== 'long' && p.storage !== 'bulk' && p.storage !== 'cylinder' && rand() < 0.3;
      const candidates = x.cells.filter((c) => {
        const code = rackCode.get(c.rackId) ?? '';
        return toReceiving ? code === 'ПР1' : home.test(code);
      });
      const withSame = candidates.filter((c) =>
        Object.keys(inv.stock[c.address] ?? {}).some((k) => splitKey(k)[0] === p.id),
      );
      const pool = withSame.length && rand() < 0.6 ? withSame : candidates;
      for (let tries = 0; tries < 12 && pool.length; tries++) {
        const c = pick(pool, rand);
        const fit = unitsFit(c, usage(c.address), p);
        if (fit <= 0) continue;
        const q = chooseQty(p, fit, rand, 0.2, 0.6);
        const batch: Batch | undefined =
          p.tracking === 'batch'
            ? {
                id: `b-${p.id.slice(2)}-${now.toString(36)}`,
                productId: p.id,
                number: `П-${pad(Math.floor(rand() * 99999), 5)}`,
                receivedAt: now,
              }
            : undefined;
        if (batch && p.shelfLife) batch.expiry = startOfDay(now + p.shelfLife * DAY);
        if (batch && p.group === 'metal') {
          batch.heat = `${pick(['2Т', '4Б', '1К'], rand)}-${pad(Math.floor(rand() * 99999), 5)}`;
          batch.cert = `Серт. № ${Math.floor(1000 + rand() * 8000)} от ${dateStr(now)}`;
        }
        if (batch) inv.batches[batch.id] = batch;
        const k = skey(
          p.id,
          batch?.id ?? (p.tracking === 'serial' ? `b-${p.id.slice(2)}-${now.toString(36)}` : undefined),
        );
        if (p.tracking === 'serial' && !inv.batches[splitKey(k)[1]!])
          inv.batches[splitKey(k)[1]!] = {
            id: splitKey(k)[1]!,
            productId: p.id,
            number: `ЗН-${pad(Math.floor(rand() * 999999), 6)}`,
            receivedAt: now,
          };
        const qty = p.tracking === 'serial' ? 1 : q;
        addStock(inv.stock, c.address, k, qty);
        ev({
          type: 'receipt',
          productId: p.id,
          batchId: splitKey(k)[1],
          qty,
          to: c.address,
          party: p.group === 'metal' ? 'Металлобаза' : 'Поставщик',
        });
        if (p.group === 'gas' && p.tareTypeId) {
          // Пустые баллоны уезжают на заправку
          const empty = inv.tare[c.address]?.[p.tareTypeId] ?? 0;
          if (empty > 0) {
            addTare(inv.tare, c.address, p.tareTypeId, -empty);
            addTare(inv.tare, '@П:Газы', p.tareTypeId, empty);
            ev({
              type: 'tare',
              tareTypeId: p.tareTypeId,
              qty: empty,
              from: c.address,
              to: '@П:Газы',
              note: 'Пустые баллоны на заправку',
            });
          }
        }
        break;
      }
    }
  } else if (r < 0.85) {
    // Размещение с приёмки по месту хранения
    const recv = occupied.filter((a) => rackCode.get(x.byAddress.get(a)!.rackId) === 'ПР1');
    const from = recv.length ? pick(recv, rand) : undefined;
    if (from) {
      const k = pick(Object.keys(inv.stock[from]), rand);
      const [pid, bid] = splitKey(k);
      const p = products.get(pid);
      const qty = inv.stock[from][k];
      if (p) {
        const home = homeOf(p);
        const pool = x.cells.filter((c) => home.test(rackCode.get(c.rackId) ?? '') && rackCode.get(c.rackId) !== 'ПР1');
        for (let tries = 0; tries < 15 && pool.length; tries++) {
          const c = pick(pool, rand);
          if (unitsFit(c, usage(c.address), p) + 1e-9 < qty) continue;
          addStock(inv.stock, from, k, -qty);
          addStock(inv.stock, c.address, k, qty);
          ev({ type: 'move', productId: pid, batchId: bid, qty, from, to: c.address, note: 'Размещение с приёмки' });
          break;
        }
      }
    }
  } else if (r < 0.95) {
    // Возвратная тара: поддоны из кладовых, барабаны и кассеты поставщикам
    const consumers = Object.keys(inv.tare).filter((a) => a.startsWith('@К'));
    const place = consumers.length ? pick(consumers, rand) : undefined;
    const tare = place
      ? Object.entries(inv.tare[place]).filter(([tid]) => tareTypes.get(tid)?.kind !== 'cylinder')
      : [];
    if (place && tare.length) {
      const [tid, n] = pick(tare, rand);
      const q = Math.min(n, 1 + Math.floor(rand() * 4));
      const t = tareTypes.get(tid);
      // Место, где после возврата не будет занято больше мест, чем есть
      const target = t
        ? x.cells.find((c) => {
            if (!/^Т\d$/.test(rackCode.get(c.rackId) ?? '')) return false;
            const u = usage(c.address);
            const have = u?.tare[tid] ?? 0;
            return (
              (u?.places ?? 0) - tarePlaces(t, have) + tarePlaces(t, have + q) <= c.places &&
              (u?.weight ?? 0) + t.weight * q <= c.maxLoad
            );
          })
        : undefined;
      if (target && q > 0) {
        addTare(inv.tare, place, tid, -q);
        addTare(inv.tare, target.address, tid, q);
        ev({
          type: 'tare',
          tareTypeId: tid,
          qty: q,
          from: place,
          to: target.address,
          note: 'Возврат тары из кладовой',
        });
      }
    }
  } else if (occupied.length) {
    // Инвентаризация: небольшое расхождение
    const a = pick(occupied, rand);
    const k = pick(Object.keys(inv.stock[a]), rand);
    const [pid, bid] = splitKey(k);
    const p = products.get(pid);
    if (p) {
      const d = isCount(p.unit)
        ? rand() < 0.5
          ? -1
          : 1
        : (rand() < 0.5 ? -1 : 1) * Math.max(qtyStep(p.unit), floorTo(inv.stock[a][k] * 0.02, qtyStep(p.unit)));
      const fit = d > 0 ? unitsFit(x.byAddress.get(a)!, usage(a), p) : Infinity;
      if (fit >= d) {
        addStock(inv.stock, a, k, d);
        ev({ type: 'count', productId: pid, batchId: bid, qty: d, to: a, note: 'Пересчёт' });
      }
    }
  }
  inv.events.push(...out);
  if (inv.events.length > 6000) inv.events.splice(0, inv.events.length - 6000);
  inv.updatedAt = now;
  return out;
}
