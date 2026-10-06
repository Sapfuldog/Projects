import type { Cell, CellFill, Connection, FieldMapping } from '../types';

// ---------- Цвета ----------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mix(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
}

const GREEN: [number, number, number] = [46, 160, 67];
const YELLOW: [number, number, number] = [234, 179, 8];
const RED: [number, number, number] = [220, 38, 38];

/** Зелёный (мало) → жёлтый → красный (полная ячейка). */
export function fillColor(fill: number): string {
  const f = Math.max(0, Math.min(1, fill));
  return f < 0.5 ? mix(GREEN, YELLOW, f / 0.5) : mix(YELLOW, RED, (f - 0.5) / 0.5);
}

export const COLOR_EMPTY = '#94a3b8';
export const COLOR_BLOCKED = '#334155';
export const COLOR_OVERLOAD = '#c026d3';

/** Нагрузка: вес / Г. Больше 1 — перегруз. */
export function loadColor(ratio: number): string {
  if (ratio > 1) return COLOR_OVERLOAD;
  return fillColor(ratio);
}

export function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 65%, 52%)`;
}

// ---------- Разбор входящих данных ----------

export const normAddr = (a: unknown) =>
  String(a ?? '')
    .trim()
    .toUpperCase();

/** Достаёт значение по пути вида `data.items` или `a.b.0.c`. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? n : undefined;
}

export interface FillRecord {
  address: string;
  data: CellFill;
}

/** Превращает одну запись источника в данные о заполнении по настройкам сопоставления полей. */
export function mapRecord(row: Record<string, unknown>, m: FieldMapping, now = Date.now()): FillRecord | null {
  const address = getPath(row, m.address);
  if (address == null || address === '') return null;
  const rawFill = m.fill ? num(getPath(row, m.fill)) : undefined;
  const qty = m.qty ? num(getPath(row, m.qty)) : undefined;
  const capacity = m.capacity ? num(getPath(row, m.capacity)) : undefined;
  const weight = m.weight ? num(getPath(row, m.weight)) : undefined;
  let fill: number;
  if (rawFill !== undefined) {
    const asPercent = typeof getPath(row, m.fill) === 'string' && String(getPath(row, m.fill)).includes('%');
    fill = asPercent || rawFill > 1 ? rawFill / 100 : rawFill;
  } else if (qty !== undefined && capacity) {
    fill = qty / capacity;
  } else if (qty !== undefined) {
    fill = qty > 0 ? 1 : 0;
  } else {
    fill = 0;
  }
  const sku = m.sku ? getPath(row, m.sku) : undefined;
  const name = m.name ? getPath(row, m.name) : undefined;
  return {
    address: String(address).trim(),
    data: {
      fill: Math.max(0, Math.min(1, fill)),
      qty,
      weight,
      sku: sku != null && sku !== '' ? String(sku) : undefined,
      name: name != null && name !== '' ? String(name) : undefined,
      updatedAt: now,
    },
  };
}

/** Извлекает массив записей из ответа API/файла. */
export function extractRows(payload: unknown, path: string): Record<string, unknown>[] {
  let v = getPath(payload, path);
  if (v && !Array.isArray(v) && typeof v === 'object') {
    // Поддерживаем словарь { "A01-01-01-01": {...} }
    const obj = v as Record<string, unknown>;
    const looksLikeMap = Object.values(obj).every((x) => x && typeof x === 'object' && !Array.isArray(x));
    v = looksLikeMap ? Object.entries(obj).map(([k, x]) => ({ address: k, ...(x as object) })) : [obj];
  }
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
}

export interface ApplyResult {
  fills: Record<string, CellFill>;
  received: number;
  matched: number;
  unmatched: string[];
}

/** Сопоставляет записи с ячейками по адресу (без учёта регистра и пробелов по краям). */
export function matchRecords(
  rows: Record<string, unknown>[],
  conn: Pick<Connection, 'mapping'>,
  cells: Cell[],
): ApplyResult {
  const byAddr = new Map(cells.map((c) => [normAddr(c.address), c.address]));
  const fills: Record<string, CellFill> = {};
  const unmatched: string[] = [];
  let received = 0;
  const now = Date.now();
  for (const row of rows) {
    const rec = mapRecord(row, conn.mapping, now);
    if (!rec) continue;
    received++;
    const addr = byAddr.get(normAddr(rec.address));
    if (!addr) {
      if (unmatched.length < 50) unmatched.push(rec.address);
      continue;
    }
    const prev = fills[addr];
    // Несколько записей на одну ячейку (разные SKU) — суммируем
    fills[addr] = prev
      ? {
          ...rec.data,
          fill: Math.min(1, prev.fill + rec.data.fill),
          weight: (prev.weight ?? 0) + (rec.data.weight ?? 0) || undefined,
          qty: (prev.qty ?? 0) + (rec.data.qty ?? 0) || undefined,
          sku:
            prev.sku && rec.data.sku && prev.sku !== rec.data.sku
              ? `${prev.sku}, ${rec.data.sku}`
              : (prev.sku ?? rec.data.sku),
        }
      : rec.data;
  }
  return { fills, received, matched: Object.keys(fills).length, unmatched };
}

// ---------- CSV ----------

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

// ---------- Статистика ----------

export interface FillStats {
  total: number;
  blocked: number;
  available: number;
  occupied: number;
  free: number;
  withData: number;
  /** Средняя заполненность доступных ячеек 0..1 */
  avgFill: number;
  weight: number;
  capacity: number;
  overloaded: number;
}

export const emptyStats = (): FillStats => ({
  total: 0,
  blocked: 0,
  available: 0,
  occupied: 0,
  free: 0,
  withData: 0,
  avgFill: 0,
  weight: 0,
  capacity: 0,
  overloaded: 0,
});

function addCell(s: FillStats, c: Cell, f: CellFill | undefined) {
  s.total++;
  if (c.blocked) {
    s.blocked++;
    return;
  }
  s.available++;
  s.capacity += c.maxLoad;
  if (f) {
    s.withData++;
    s.avgFill += f.fill;
    s.weight += f.weight ?? 0;
    if (f.weight && c.maxLoad && f.weight > c.maxLoad) s.overloaded++;
  }
  if (f && f.fill > 0) s.occupied++;
  else s.free++;
}

function finish(s: FillStats) {
  s.avgFill = s.available ? s.avgFill / s.available : 0;
  return s;
}

export function computeStats(
  cells: Cell[],
  fills: Record<string, CellFill>,
): { all: FillStats; byZone: Map<string, FillStats>; byRack: Map<string, FillStats>; byRoom: Map<string, FillStats> } {
  const all = emptyStats();
  const byZone = new Map<string, FillStats>();
  const byRack = new Map<string, FillStats>();
  const byRoom = new Map<string, FillStats>();
  const get = (m: Map<string, FillStats>, k: string) => {
    let v = m.get(k);
    if (!v) m.set(k, (v = emptyStats()));
    return v;
  };
  for (const c of cells) {
    const f = fills[c.address];
    addCell(all, c, f);
    addCell(get(byZone, c.zoneId), c, f);
    addCell(get(byRack, c.rackId), c, f);
    addCell(get(byRoom, c.roomId), c, f);
  }
  finish(all);
  byZone.forEach(finish);
  byRack.forEach(finish);
  byRoom.forEach(finish);
  return { all, byZone, byRack, byRoom };
}

// ---------- Демо-симулятор ----------

/** Генерирует правдоподобное заполнение: склад заполнен «пятнами», верхние ярусы реже. */
export function simulateFill(
  cells: Cell[],
  prev: Record<string, CellFill>,
  target: number,
  changeShare = 0.06,
): Record<string, CellFill> {
  const now = Date.now();
  const out: Record<string, CellFill> = {};
  const skus = [
    'Вода 0,5л',
    'Крупа 1кг',
    'Бытовая химия',
    'Консервы',
    'Сахар 5кг',
    'Шины R16',
    'Бумага А4',
    'Электроника',
    'Корма',
    'Напитки',
  ];
  for (const c of cells) {
    if (c.blocked) continue;
    const old = prev[c.address];
    if (old && Math.random() > changeShare) {
      out[c.address] = old;
      continue;
    }
    const tierPenalty = 1 - (c.tier - 1) * 0.06;
    const occupied = Math.random() < target * tierPenalty * 1.1;
    if (!occupied) {
      out[c.address] = { fill: 0, qty: 0, weight: 0, updatedAt: now };
      continue;
    }
    const fill = Math.min(1, 0.25 + Math.random() * 0.85);
    const sku = skus[(c.section * 7 + c.tier * 3 + Math.floor(Math.random() * 3)) % skus.length];
    const weight = Math.round(c.maxLoad * fill * (0.4 + Math.random() * 0.75));
    out[c.address] = { fill, qty: Math.round(fill * 40), weight, sku, name: sku, updatedAt: now };
  }
  return out;
}
