import type { Batch, Cell, FieldMapping, Inventory, MaterialGroup, Product, TareType, Warehouse } from '../types';
import { GROUPS } from './materials';
import { addStock, addTare, emptyInventory, skey, splitKey } from './inventory';
import { rackContext } from './rack';
import { uid } from './id';

// Приём среза остатков из учётной системы (1С, WMS): JSON или CSV, поля сопоставляются по настройкам.
// Одна строка = товар (партия) в ячейке; пустая тара — строка без товара с видом и количеством тары;
// если система отдаёт только заполненность — строка с адресом и процентом.

export const normAddr = (a: unknown) =>
  String(a ?? '')
    .trim()
    .toUpperCase();

/** Значение по пути вида `data.items` или `a.b.0.c`. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? n : undefined;
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());

/** Дата: ISO, «дд.мм.гггг», метка времени (мс или с). */
export function parseDate(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return v < 1e11 ? v * 1000 : v;
  const s = String(v).trim();
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (ru) {
    const y = Number(ru[3]) < 100 ? 2000 + Number(ru[3]) : Number(ru[3]);
    return new Date(y, Number(ru[2]) - 1, Number(ru[1]), Number(ru[4] ?? 0), Number(ru[5] ?? 0)).getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

/** Массив записей из ответа API или файла. Поддерживается и словарь `{ "адрес": {...} }`. */
export function extractRows(payload: unknown, path: string): Record<string, unknown>[] {
  let v = getPath(payload, path);
  if (v && !Array.isArray(v) && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const looksLikeMap = Object.values(obj).every((x) => x && typeof x === 'object' && !Array.isArray(x));
    v = looksLikeMap ? Object.entries(obj).map(([k, x]) => ({ address: k, ...(x as object) })) : [obj];
  }
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
}

export function parseCSV(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCSV(header: string[], rows: (string | number | undefined)[][]): string {
  const esc = (v: string | number | undefined) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM и «;» — чтобы Excel сразу открыл файл в правильной кодировке и по колонкам
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

/** JSON или CSV. */
export function parsePayload(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
  return parseCSV(text);
}

export function parseHeaders(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  const v = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Заголовки должны быть JSON-объектом');
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
}

const GROUP_WORDS: [RegExp, MaterialGroup][] = [
  [/полуфабр|узел|секци|деталь корп/, 'semi'],
  [/готов|издели/, 'finished'],
  [/прокат|лист|труб|уголок|швеллер|двутавр|металл|круг/, 'metal'],
  [/свар|электрод|проволок|флюс/, 'welding'],
  [/лкм|краск|эмал|грунт|лак/, 'paint'],
  [/газ|баллон|кислород|пропан|аргон/, 'gas'],
  [/армат|клапан|задвиж|фланец|отвод|кран/, 'valves'],
  [/метиз|крепёж|крепеж|болт|гайк|шайб/, 'hardware'],
  [/кабел|провод/, 'cable'],
  [/электро|светил|автомат/, 'electro'],
  [/инструмент/, 'tools'],
  [/расход|абразив|круг/, 'consumables'],
  [/сиз|спецод|перчат/, 'ppe'],
  [/запчаст|комплектующ/, 'parts'],
  [/оборудован/, 'equipment'],
  [/гсм|масл|растворит|хими/, 'chem'],
  [/it|компьют|ноутбук|монитор/, 'it'],
];

/** Группа ТМЦ по коду или названию из учётной системы. */
export function groupOf(v: unknown): MaterialGroup | undefined {
  const s = str(v).toLowerCase();
  if (!s) return undefined;
  for (const [k, g] of Object.entries(GROUPS))
    if (k === s || g.title.toLowerCase() === s || g.short.toLowerCase() === s) return k as MaterialGroup;
  return GROUP_WORDS.find(([re]) => re.test(s))?.[1];
}

function tareOf(v: unknown, tareTypes: TareType[]): TareType | undefined {
  const s = str(v).toLowerCase();
  if (!s) return undefined;
  return tareTypes.find((t) => t.id.toLowerCase() === s || t.code.toLowerCase() === s || t.name.toLowerCase() === s);
}

export interface ImportResult {
  inventory: Inventory;
  /** Товары, которых не было в каталоге (созданы по строкам среза) */
  newProducts: Product[];
  received: number;
  matched: number;
  unmatched: string[];
  skipped: number;
}

export interface ImportOptions {
  /** true — срез целиком заменяет остатки; false — обновляет только пришедшие ячейки */
  replace: boolean;
  now?: number;
}

/** Строит остатки склада из записей учётной системы. */
export function importSnapshot(
  rows: Record<string, unknown>[],
  m: FieldMapping,
  cells: Cell[],
  products: Product[],
  tareTypes: TareType[],
  prev: Inventory | undefined,
  opts: ImportOptions,
): ImportResult {
  const now = opts.now ?? Date.now();
  const base = prev ?? emptyInventory();
  const inv: Inventory = opts.replace
    ? { ...emptyInventory(), events: base.events, history: base.history, batches: {}, lastMove: { ...base.lastMove } }
    : {
        ...base,
        stock: { ...base.stock },
        tare: { ...base.tare },
        batches: { ...base.batches },
        lastMove: { ...base.lastMove },
        fills: { ...(base.fills ?? {}) },
      };
  inv.fills ??= {};
  const byNorm = new Map(cells.map((c) => [normAddr(c.address), c.address]));
  const bySku = new Map(products.map((p) => [normAddr(p.sku), p]));
  const newProducts: Product[] = [];
  const unmatched: string[] = [];
  const touched = new Set<string>();
  let received = 0;
  let skipped = 0;
  const get = (row: Record<string, unknown>, field: keyof FieldMapping) =>
    m[field] ? getPath(row, m[field]) : undefined;

  for (const row of rows) {
    const raw = get(row, 'address');
    if (raw == null || raw === '') {
      skipped++;
      continue;
    }
    received++;
    const address = byNorm.get(normAddr(raw));
    if (!address) {
      if (unmatched.length < 50 && !unmatched.includes(str(raw))) unmatched.push(str(raw));
      continue;
    }
    if (!opts.replace && !touched.has(address)) {
      // Частичное обновление: пришедшая ячейка описывается заново
      delete inv.stock[address];
      delete inv.tare[address];
      delete inv.fills![address];
    }
    touched.add(address);
    const lm = parseDate(get(row, 'lastMove'));
    if (lm && (inv.lastMove[address] ?? 0) < lm) inv.lastMove[address] = lm;
    const fillRaw = get(row, 'fill');
    const fill = num(fillRaw);
    if (fill !== undefined)
      inv.fills![address] = Math.max(0, Math.min(1, String(fillRaw).includes('%') || fill > 1 ? fill / 100 : fill));

    const sku = str(get(row, 'sku'));
    const qty = num(get(row, 'qty'));
    const tare = tareOf(get(row, 'tare'), tareTypes);
    const tareCount = num(get(row, 'tareCount'));
    if (!sku) {
      // Пустая тара в ячейке
      const n = tareCount ?? qty;
      if (tare && n) addTare(inv.tare, address, tare.id, n);
      else if (fill === undefined) skipped++;
      continue;
    }
    if (!qty || qty <= 0) {
      skipped++;
      continue;
    }
    let p = bySku.get(normAddr(sku));
    if (!p) {
      const group = groupOf(get(row, 'group')) ?? 'general';
      const g = GROUPS[group];
      const w = num(get(row, 'weight'));
      p = {
        id: uid('p'),
        sku,
        name: str(get(row, 'name')) || sku,
        group,
        category: str(get(row, 'group')) || g.title,
        unit: str(get(row, 'unit')) || g.unit,
        weight: w && qty ? Math.round((w / qty) * 1000) / 1000 : 0,
        volume: 1,
        storage: g.storage,
        tracking: g.tracking,
        hazard: g.hazard,
        tareTypeId: tare?.id,
        perTare: tare && tareCount ? Math.max(1, Math.round(qty / tareCount)) : undefined,
        min: 0,
        max: 0,
        price: 0,
      };
      bySku.set(normAddr(sku), p);
      newProducts.push(p);
    }
    const batchNo = str(get(row, 'batch'));
    const heat = str(get(row, 'heat'));
    const cert = str(get(row, 'cert'));
    const order = str(get(row, 'order'));
    const expiry = parseDate(get(row, 'expiry'));
    let batchId: string | undefined;
    if (batchNo || heat || cert || order || expiry) {
      const key = normAddr(batchNo || heat || cert || order || String(expiry)).replace(/[^\p{L}\p{N}]+/gu, '');
      batchId = `b-${p.id}-${key}`;
      const prevBatch = inv.batches[batchId] ?? base.batches[batchId];
      const b: Batch = {
        id: batchId,
        productId: p.id,
        number: batchNo || heat || cert || order || '—',
        receivedAt: prevBatch?.receivedAt ?? now,
        ...(heat ? { heat } : {}),
        ...(cert ? { cert } : {}),
        ...(order ? { order } : {}),
        ...(expiry ? { expiry } : {}),
      };
      inv.batches[batchId] = b;
    }
    addStock(inv.stock, address, skey(p.id, batchId), qty);
  }
  // Партии, которые остались только в прежнем срезе, при частичном обновлении сохраняем
  if (!opts.replace)
    for (const items of Object.values(inv.stock))
      for (const k of Object.keys(items)) {
        const bid = splitKey(k)[1];
        if (bid && !inv.batches[bid] && base.batches[bid]) inv.batches[bid] = base.batches[bid];
      }
  inv.updatedAt = now;
  return { inventory: inv, newProducts, received, matched: touched.size, unmatched, skipped };
}

export const SNAPSHOT_FIELDS: { key: keyof FieldMapping; title: string; hint: string }[] = [
  { key: 'address', title: 'Адрес ячейки', hint: 'обязательно: адрес места хранения' },
  { key: 'sku', title: 'Артикул / код ТМЦ', hint: 'пусто — строка про тару или заполненность' },
  { key: 'name', title: 'Наименование', hint: 'для новых позиций' },
  { key: 'group', title: 'Группа ТМЦ', hint: 'металлопрокат, ЛКМ, газы…' },
  { key: 'unit', title: 'Единица', hint: 'т, кг, м, шт, л' },
  { key: 'qty', title: 'Количество', hint: 'в базовой единице' },
  { key: 'batch', title: 'Партия / серийный №', hint: '' },
  { key: 'heat', title: 'Плавка', hint: 'для металлопроката' },
  { key: 'cert', title: 'Сертификат', hint: '' },
  { key: 'expiry', title: 'Годен до', hint: 'для ЛКМ, ГСМ' },
  { key: 'order', title: 'Заказ / строительный №', hint: 'для полуфабрикатов и изделий' },
  { key: 'weight', title: 'Вес, кг', hint: 'общий вес строки' },
  { key: 'tare', title: 'Тара', hint: 'код вида тары, напр. EUR, Б40-О₂' },
  { key: 'tareCount', title: 'Кол-во тары', hint: 'шт' },
  { key: 'lastMove', title: 'Последнее движение', hint: 'дата' },
  { key: 'fill', title: 'Заполненность', hint: '0..1 или %, если нет содержимого' },
];

/** Текущий срез в формате обмена (CSV) — образец для настройки выгрузки из учётной системы. */
export function snapshotRows(
  inv: Inventory | undefined,
  products: Map<string, Product>,
  tareTypes: Map<string, TareType>,
) {
  const header = [
    'address',
    'sku',
    'name',
    'group',
    'unit',
    'qty',
    'batch',
    'heat',
    'cert',
    'expiry',
    'order',
    'weight',
    'tare',
    'tareCount',
    'lastMove',
  ];
  const rows: (string | number | undefined)[][] = [];
  const d = (t?: number) => (t ? new Date(t).toLocaleDateString('ru-RU') : '');
  for (const [address, items] of Object.entries(inv?.stock ?? {})) {
    for (const [k, q] of Object.entries(items)) {
      const [pid, bid] = splitKey(k);
      const p = products.get(pid);
      const b = bid ? inv?.batches[bid] : undefined;
      const tare = p?.tareTypeId ? tareTypes.get(p.tareTypeId) : undefined;
      rows.push([
        address,
        p?.sku ?? pid,
        p?.name ?? '',
        p ? p.group : '',
        p?.unit ?? '',
        String(q).replace('.', ','),
        b?.number ?? '',
        b?.heat ?? '',
        b?.cert ?? '',
        d(b?.expiry),
        b?.order ?? '',
        p ? String(Math.round(q * p.weight * 10) / 10).replace('.', ',') : '',
        tare?.code ?? '',
        tare && p?.perTare ? Math.ceil(q / p.perTare - 1e-9) : '',
        d(inv?.lastMove[address]),
      ]);
    }
  }
  for (const [place, items] of Object.entries(inv?.tare ?? {})) {
    if (place.startsWith('@')) continue;
    for (const [tid, n] of Object.entries(items))
      rows.push([
        place,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        tareTypes.get(tid)?.code ?? tid,
        n,
        d(inv?.lastMove[place]),
      ]);
  }
  return { header, rows };
}

/** Структура мест хранения для выгрузки в учётную систему (адреса, типы, размеры, нагрузки). */
export function structurePayload(w: Warehouse, cells: Cell[]) {
  const rackById = new Map(w.racks.map((r) => [r.id, r]));
  return {
    warehouse: { id: w.id, name: w.name, kind: w.kind, address: w.address },
    generatedAt: new Date().toISOString(),
    cells: cells.map((c) => {
      const rack = rackById.get(c.rackId);
      const ctx = rack ? rackContext(w, rack) : undefined;
      return {
        address: c.address,
        room: ctx?.room?.code,
        zone: ctx?.zone?.code,
        rack: rack?.code,
        section: c.section,
        tier: c.tier,
        cell: c.pos,
        type: c.cellType,
        width: c.width,
        depth: c.depth,
        height: c.height,
        maxLoad: c.maxLoad,
        places: c.places,
        blocked: c.blocked,
        reservedFor: c.reservedFor,
        hazard: c.hazard,
        name: c.virtual ? c.note : undefined,
      };
    }),
  };
}
