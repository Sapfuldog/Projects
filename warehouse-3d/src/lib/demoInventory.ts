import type { Doc, DocKind, Inventory, OpEvent, Product, Warehouse } from '../types';
import { buildCells } from './rack';
import { DAY, startOfDay } from './analytics';
import {
  applyOp,
  cellUsage,
  cellVolume,
  emptyInventory,
  isBulky,
  suggestPicking,
  suggestPlacement,
  unitsFit,
  type OpInput,
} from './inventory';

/** Демо-каталог. Объём — л на единицу, вес — кг, цена — ₽. Норма (max) подбирается под ёмкость склада. */
export const DEMO_PRODUCTS: Product[] = [
  {
    id: 'p-tv55',
    sku: 'TV-55U',
    name: 'Телевизор 55"',
    category: 'Электроника',
    unit: 'шт',
    weight: 22,
    volume: 150,
    min: 0,
    max: 0,
    price: 54990,
  },
  {
    id: 'p-mon27',
    sku: 'MON-27Q',
    name: 'Монитор 27"',
    category: 'Электроника',
    unit: 'шт',
    weight: 7.5,
    volume: 45,
    min: 0,
    max: 0,
    price: 24990,
  },
  {
    id: 'p-mfp',
    sku: 'MFP-L420',
    name: 'МФУ лазерное',
    category: 'Электроника',
    unit: 'шт',
    weight: 15,
    volume: 70,
    min: 0,
    max: 0,
    price: 32990,
  },
  {
    id: 'p-micro',
    sku: 'MW-20L',
    name: 'Микроволновая печь',
    category: 'Бытовая техника',
    unit: 'шт',
    weight: 12,
    volume: 55,
    min: 0,
    max: 0,
    price: 9490,
  },
  {
    id: 'p-vac',
    sku: 'VC-900',
    name: 'Пылесос',
    category: 'Бытовая техника',
    unit: 'шт',
    weight: 8,
    volume: 48,
    min: 0,
    max: 0,
    price: 12990,
  },
  {
    id: 'p-coffee',
    sku: 'CM-15B',
    name: 'Кофемашина',
    category: 'Бытовая техника',
    unit: 'шт',
    weight: 9,
    volume: 40,
    min: 0,
    max: 0,
    price: 27990,
  },
  {
    id: 'p-kettle',
    sku: 'KT-17',
    name: 'Чайник электрический',
    category: 'Бытовая техника',
    unit: 'шт',
    weight: 1.6,
    volume: 16,
    min: 0,
    max: 0,
    price: 2490,
  },
  {
    id: 'p-paper',
    sku: 'A4-500x5',
    name: 'Бумага А4 (кор. 5 пачек)',
    category: 'Канцтовары',
    unit: 'кор',
    weight: 12.5,
    volume: 16,
    min: 0,
    max: 0,
    price: 1890,
  },
  {
    id: 'p-film',
    sku: 'STR-500',
    name: 'Стрейч-плёнка 500 мм',
    category: 'Упаковка',
    unit: 'рул',
    weight: 2.5,
    volume: 15,
    min: 0,
    max: 0,
    price: 690,
  },
  {
    id: 'p-laptop',
    sku: 'NB-PRO15',
    name: 'Ноутбук Pro 15',
    category: 'Электроника',
    unit: 'шт',
    weight: 2.4,
    volume: 8,
    min: 0,
    max: 0,
    price: 89990,
  },
  {
    id: 'p-tablet',
    sku: 'TB-10',
    name: 'Планшет 10"',
    category: 'Электроника',
    unit: 'шт',
    weight: 0.7,
    volume: 3,
    min: 0,
    max: 0,
    price: 29990,
  },
  {
    id: 'p-phone',
    sku: 'SP-X12',
    name: 'Смартфон X12',
    category: 'Электроника',
    unit: 'шт',
    weight: 0.4,
    volume: 1.2,
    min: 0,
    max: 0,
    price: 49990,
  },
  {
    id: 'p-kbd',
    sku: 'KB-MX',
    name: 'Клавиатура MX',
    category: 'Аксессуары',
    unit: 'шт',
    weight: 0.9,
    volume: 3,
    min: 0,
    max: 0,
    price: 6990,
  },
  {
    id: 'p-mouse',
    sku: 'MS-W2',
    name: 'Мышь беспроводная',
    category: 'Аксессуары',
    unit: 'шт',
    weight: 0.2,
    volume: 0.8,
    min: 0,
    max: 0,
    price: 1990,
  },
  {
    id: 'p-cable',
    sku: 'CB-USBC',
    name: 'Кабель USB-C',
    category: 'Аксессуары',
    unit: 'шт',
    weight: 0.06,
    volume: 0.3,
    min: 0,
    max: 0,
    price: 590,
  },
  {
    id: 'p-head',
    sku: 'HP-BT7',
    name: 'Наушники Bluetooth',
    category: 'Аксессуары',
    unit: 'шт',
    weight: 0.4,
    volume: 2,
    min: 0,
    max: 0,
    price: 7990,
  },
  {
    id: 'p-ssd',
    sku: 'SSD-1TB',
    name: 'SSD 1 ТБ',
    category: 'Комплектующие',
    unit: 'шт',
    weight: 0.1,
    volume: 0.3,
    min: 0,
    max: 0,
    price: 8990,
  },
  {
    id: 'p-psu',
    sku: 'PSU-65W',
    name: 'Блок питания 65W',
    category: 'Комплектующие',
    unit: 'шт',
    weight: 0.35,
    volume: 1.2,
    min: 0,
    max: 0,
    price: 2490,
  },
  {
    id: 'p-kit',
    sku: 'FX-KIT',
    name: 'Крепёжный комплект',
    category: 'Комплектующие',
    unit: 'шт',
    weight: 0.5,
    volume: 0.6,
    min: 0,
    max: 0,
    price: 390,
  },
];

const SUPPLIERS = ['ООО «ТехноПоставка»', 'АО «Электромир»', 'ООО «БытТехника»', 'ИП Смирнов А. В.', 'ООО «ОфисСнаб»'];
const CUSTOMERS = [
  'ООО «Ритейл Плюс»',
  'Магазин «Электрон»',
  'ООО «Офис-Сервис»',
  'Интернет-магазин «Быстро»',
  'ООО «Домашний»',
  'ТЦ «Город»',
];
const USERS = ['Иванов А.', 'Петрова М.', 'Сидоров К.', 'Козлова Е.'];

export const docNumber = (kind: DocKind, n: number) =>
  `${kind === 'receipt' ? 'П' : 'З'}-${String(n).padStart(5, '0')}`;

/** Детерминированный генератор случайных чисел — демо всегда одинаковое. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Генерирует историю за 30 дней: первичное размещение, ежедневные поставки, заказы,
 * перемещения и инвентаризации. Возвращает инвентарь и каталог с нормами под ёмкость склада.
 */
export function generateDemoInventory(
  w: Warehouse,
  catalog = DEMO_PRODUCTS,
  now = Date.now(),
): { inventory: Inventory; products: Product[] } {
  const r = rng(20261006);
  const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
  const cells = buildCells(w).filter((c) => !c.blocked);
  const capBig = cells.filter((c) => cellVolume(c) >= 300).reduce((s, c) => s + cellVolume(c) * 0.9, 0);
  const capSmall = cells.filter((c) => cellVolume(c) < 300).reduce((s, c) => s + cellVolume(c) * 0.9, 0);
  const bulkyCount = catalog.filter(isBulky).length || 1;
  const smallCount = catalog.length - bulkyCount || 1;
  const products = catalog.map((p) => {
    const share = isBulky(p) ? capBig / bulkyCount : (capSmall || capBig * 0.05) / smallCount;
    // Тяжёлый товар ограничен грузоподъёмностью, а не объёмом
    const densityFactor = Math.min(1, 1000 / 1683 / (p.weight / p.volume));
    const max = Math.max(10, Math.round(((share * 0.62) / p.volume) * densityFactor));
    return { ...p, max, min: Math.round(max * 0.18) };
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const inv = emptyInventory();
  let usage = cellUsage(inv.stock, byId);
  const total = (pid: string) => Object.values(inv.stock).reduce((s, items) => s + (items[pid] ?? 0), 0);

  // Время событий не убывает: операции идут в том же порядке, в каком применялись к остаткам
  let clock = 0;
  const push = (op: OpInput, at: number, user: string) => {
    applyOp(inv.stock, op);
    clock = Math.max(clock + 1000, at);
    const e: OpEvent = { id: `ev${inv.events.length + 1}`, at: clock, user, ...op };
    inv.events.push(e);
  };

  const receive = (doc: Doc, at: number, user: string) => {
    for (const line of doc.lines) {
      const p = byId.get(line.productId)!;
      const { plan } = suggestPlacement(cells, usage, p, line.qty);
      plan.forEach((pl) =>
        push({ type: 'receipt', productId: p.id, qty: pl.qty, to: pl.address, docId: doc.id }, at, user),
      );
      usage = cellUsage(inv.stock, byId);
    }
  };
  const ship = (doc: Doc, at: number, user: string) => {
    for (const line of doc.lines) {
      const { plan } = suggestPicking(inv.stock, line.productId, line.qty);
      plan.forEach((pl) =>
        push({ type: 'shipment', productId: line.productId, qty: pl.qty, from: pl.address, docId: doc.id }, at, user),
      );
    }
    usage = cellUsage(inv.stock, byId);
  };
  const newDoc = (
    kind: DocKind,
    partner: string,
    lines: Doc['lines'],
    createdAt: number,
    status: Doc['status'],
  ): Doc => {
    const n = inv.seq++;
    const d: Doc = { id: `d${n}`, kind, number: docNumber(kind, n), status, partner, createdAt, lines };
    inv.docs.push(d);
    return d;
  };

  const today = startOfDay(now);
  const start = today - 30 * DAY;
  // Первичное размещение
  const lowStock = new Set(['p-head', 'p-kettle']);
  const initLines = products.map((p) => ({
    productId: p.id,
    qty: Math.round(p.max * (lowStock.has(p.id) ? 0.22 : 0.55 + r() * 0.25)),
  }));
  const init = newDoc('receipt', SUPPLIERS[0], initLines, start + 8 * 3600e3, 'done');
  receive(init, start + 9 * 3600e3, USERS[0]);
  init.doneAt = clock + 600e3;

  for (let d = 29; d >= 0; d--) {
    const day = today - d * DAY;
    const at = (h: number) => day + h * 3600e3;
    // Операции дня выполняются строго в порядке времени, чтобы журнал был причинно согласован
    const jobs: { t: number; run: (t: number) => void }[] = [];
    const nRec = 1 + Math.floor(r() * 2);
    for (let i = 0; i < nRec; i++) {
      const lines = Array.from({ length: 2 + Math.floor(r() * 3) }, () => pick(products))
        .filter((p, idx, arr) => arr.indexOf(p) === idx && !lowStock.has(p.id))
        .map((p) => ({ productId: p.id, qty: Math.max(1, Math.round(p.max * (0.05 + r() * 0.07))) }));
      const partner = pick(SUPPLIERS);
      const user = pick(USERS);
      jobs.push({
        t: at(8 + r() * 4),
        run: (t) => {
          const doc = newDoc('receipt', partner, lines, t - 3600e3, 'done');
          receive(doc, t, user);
          doc.doneAt = clock + 600e3;
        },
      });
    }
    const nOrd = 3 + Math.floor(r() * 4);
    for (let i = 0; i < nOrd; i++) {
      const wanted = Array.from({ length: 1 + Math.floor(r() * 4) }, () => pick(products))
        .filter((p, idx, arr) => arr.indexOf(p) === idx)
        .map((p) => ({ p, qty: Math.max(1, Math.round(p.max * (0.015 + r() * 0.035))) }));
      const partner = pick(CUSTOMERS);
      const user = pick(USERS);
      jobs.push({
        t: at(10 + r() * 9),
        run: (t) => {
          const lines = wanted
            .map((x) => ({ productId: x.p.id, qty: Math.min(total(x.p.id), x.qty) }))
            .filter((l) => l.qty > 0);
          if (!lines.length) return;
          const doc = newDoc('order', partner, lines, t - 2 * 3600e3, 'done');
          ship(doc, t, user);
          doc.doneAt = clock + 600e3;
        },
      });
    }
    if (r() < 0.8) {
      const k = r();
      const user = pick(USERS);
      jobs.push({
        t: at(15 + r() * 2),
        run: (t) => {
          const addresses = Object.keys(inv.stock);
          const from = addresses[Math.floor(k * addresses.length)];
          const [pid, q] = Object.entries(inv.stock[from])[0];
          const emptyCells = cells.filter((c) => !usage.get(c.address));
          const { plan } = suggestPlacement(emptyCells, usage, byId.get(pid)!, q);
          if (plan[0]) push({ type: 'move', productId: pid, qty: plan[0].qty, from, to: plan[0].address }, t, user);
          usage = cellUsage(inv.stock, byId);
        },
      });
    }
    if (d % 3 === 0) {
      const k = r();
      const k2 = r();
      const user = pick(USERS);
      jobs.push({
        t: at(18),
        run: (t) => {
          const addresses = Object.keys(inv.stock);
          const addr = addresses[Math.floor(k * addresses.length)];
          const [pid, q] = Object.entries(inv.stock[addr])[0];
          const cell = cells.find((c) => c.address === addr);
          const room = cell ? unitsFit(cell, usage.get(addr), byId.get(pid)!) : 0;
          const delta = Math.min(room, Math.max(-q, Math.round((k2 - 0.6) * 4)));
          if (delta !== 0) push({ type: 'count', productId: pid, qty: delta, to: addr }, t, user);
          usage = cellUsage(inv.stock, byId);
        },
      });
    }
    for (const j of jobs.filter((x) => x.t < now - 3600e3).sort((a, b) => a.t - b.t)) j.run(j.t);
  }

  // Документы в работе: ожидают приёмки и сборки
  const t0 = now - 2 * 3600e3;
  newDoc(
    'receipt',
    SUPPLIERS[1],
    [
      { productId: 'p-head', qty: Math.round(byId.get('p-head')!.max * 0.5) },
      { productId: 'p-laptop', qty: Math.round(byId.get('p-laptop')!.max * 0.1) },
    ],
    t0,
    'new',
  );
  newDoc(
    'receipt',
    SUPPLIERS[2],
    [{ productId: 'p-kettle', qty: Math.round(byId.get('p-kettle')!.max * 0.5) }],
    t0 + 1800e3,
    'new',
  );
  newDoc(
    'order',
    CUSTOMERS[0],
    [
      { productId: 'p-mon27', qty: 24 },
      { productId: 'p-kbd', qty: 40 },
      { productId: 'p-mouse', qty: 60 },
    ],
    now - 3600e3,
    'new',
  );
  newDoc(
    'order',
    CUSTOMERS[3],
    [
      { productId: 'p-phone', qty: 30 },
      { productId: 'p-cable', qty: 120 },
    ],
    now - 2400e3,
    'progress',
  );
  newDoc(
    'order',
    CUSTOMERS[4],
    [
      { productId: 'p-micro', qty: 12 },
      { productId: 'p-vac', qty: 8 },
    ],
    now - 900e3,
    'new',
  );

  return { inventory: inv, products };
}
