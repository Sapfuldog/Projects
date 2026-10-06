import type { Cell, CellType, HistoryPoint, Inventory, MaterialGroup, OpEvent, OpType, Product } from '../types';
import { cellFill, splitKey, type CellUse } from './inventory';
import { fmtQty } from './materials';

export const DAY = 24 * 3600 * 1000;

export const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// ---------- Показатели по местам хранения ----------

/** Границы гистограммы заполнения: пустые, 1–25, 26–50, 51–75, 76–99, полные. */
export const HIST_LABELS = ['0%', '1–25%', '26–50%', '51–75%', '76–99%', '100%'];

export function histBucket(f: number): number {
  if (f <= 0) return 0;
  if (f >= 0.995) return 5;
  return Math.min(4, 1 + Math.floor(f * 4 - 1e-9));
}

export interface TypeStats {
  cells: number;
  occupied: number;
  places: number;
  used: number;
}

export interface LocStats {
  cells: number;
  occupied: number;
  free: number;
  blocked: number;
  reserved: number;
  /** Места (паллеты, короба, баллоны): всего и занято */
  places: number;
  usedPlaces: number;
  /** Вес груза и сумма допустимых нагрузок ячеек, кг */
  weight: number;
  capacity: number;
  /** Средняя заполненность доступных ячеек 0..1 */
  fill: number;
  hist: number[];
  byType: Partial<Record<CellType, TypeStats>>;
  /** Занятых ячеек по группе основного товара */
  groups: Partial<Record<MaterialGroup, number>>;
}

export const emptyLoc = (): LocStats => ({
  cells: 0,
  occupied: 0,
  free: 0,
  blocked: 0,
  reserved: 0,
  places: 0,
  usedPlaces: 0,
  weight: 0,
  capacity: 0,
  fill: 0,
  hist: [0, 0, 0, 0, 0, 0],
  byType: {},
  groups: {},
});

function add(s: LocStats, c: Cell, u: CellUse | undefined, products: Map<string, Product>, ext?: number) {
  s.cells++;
  const f = Math.max(cellFill(c, u), ext ?? 0);
  const occupied = (!!u && (u.qty > 0 || Object.keys(u.tare).length > 0)) || f > 0;
  if (c.blocked) s.blocked++;
  if (c.reservedFor) s.reserved++;
  if (occupied) s.occupied++;
  else if (!c.blocked) s.free++;
  s.places += c.places;
  s.usedPlaces += Math.min(c.places, u?.places ?? 0);
  s.weight += u?.weight ?? 0;
  s.capacity += c.maxLoad;
  s.fill += f;
  s.hist[histBucket(f)]++;
  const t = (s.byType[c.cellType] ??= { cells: 0, occupied: 0, places: 0, used: 0 });
  t.cells++;
  if (occupied) t.occupied++;
  t.places += c.places;
  t.used += Math.min(c.places, u?.places ?? 0);
  const main = u ? Object.keys(u.byProduct)[0] : undefined;
  const g = main ? products.get(main)?.group : undefined;
  if (g) s.groups[g] = (s.groups[g] ?? 0) + 1;
}

export interface LocationStats {
  all: LocStats;
  byFloor: Map<string, LocStats>;
  byRoom: Map<string, LocStats>;
  byZone: Map<string, LocStats>;
  byRack: Map<string, LocStats>;
}

/**
 * Заполнение, места и нагрузка по складу, этажам, помещениям, зонам и стеллажам.
 * `ext` — заполненность из учётной системы для ячеек без содержимого.
 */
export function locationStats(
  cells: Cell[],
  usage: Map<string, CellUse>,
  products: Map<string, Product>,
  ext?: Record<string, number>,
): LocationStats {
  const all = emptyLoc();
  const byFloor = new Map<string, LocStats>();
  const byRoom = new Map<string, LocStats>();
  const byZone = new Map<string, LocStats>();
  const byRack = new Map<string, LocStats>();
  const get = (m: Map<string, LocStats>, k: string) => {
    let v = m.get(k);
    if (!v) m.set(k, (v = emptyLoc()));
    return v;
  };
  for (const c of cells) {
    const u = usage.get(c.address);
    const e = ext?.[c.address];
    add(all, c, u, products, e);
    if (c.floorId) add(get(byFloor, c.floorId), c, u, products, e);
    if (c.roomId) add(get(byRoom, c.roomId), c, u, products, e);
    if (c.zoneId) add(get(byZone, c.zoneId), c, u, products, e);
    if (c.rackId) add(get(byRack, c.rackId), c, u, products, e);
  }
  const fin = (s: LocStats) => {
    s.fill = s.cells - s.blocked > 0 ? s.fill / (s.cells - s.blocked || 1) : 0;
  };
  fin(all);
  [byFloor, byRoom, byZone, byRack].forEach((m) => m.forEach(fin));
  return { all, byFloor, byRoom, byZone, byRack };
}

/** Точка истории для текущего среза. */
export function historyPoint(at: number, s: LocStats): HistoryPoint {
  return {
    at: startOfDay(at),
    cells: s.cells,
    occupied: s.occupied,
    places: s.places,
    usedPlaces: s.usedPlaces,
    weight: Math.round(s.weight / 100) / 10,
  };
}

/** Добавить или обновить точку истории за день (не больше `limit` дней). */
export function pushHistory(history: HistoryPoint[], point: HistoryPoint, limit = 180): HistoryPoint[] {
  const out = history.length && history[history.length - 1].at === point.at ? history.slice(0, -1) : history.slice();
  out.push(point);
  return out.length > limit ? out.slice(out.length - limit) : out;
}

// ---------- Активность ячеек ----------

export interface DayMoves {
  day: number;
  in: number;
  out: number;
  move: number;
}

const IN: OpType[] = ['receipt', 'return'];
const OUT: OpType[] = ['issue', 'shipment', 'writeoff'];

/** Число движений по дням: поступило, выдано/отгружено, перемещено. */
export function movesByDay(events: OpEvent[], days = 30, now = Date.now()): DayMoves[] {
  const today = startOfDay(now);
  const first = today - (days - 1) * DAY;
  const out: DayMoves[] = Array.from({ length: days }, (_, i) => ({ day: first + i * DAY, in: 0, out: 0, move: 0 }));
  for (const e of events) {
    const i = Math.round((startOfDay(e.at) - first) / DAY);
    const d = out[i];
    if (!d) continue;
    if (IN.includes(e.type)) d.in++;
    else if (OUT.includes(e.type)) d.out++;
    else if (e.type === 'move') d.move++;
  }
  return out;
}

export interface CellActivity {
  address: string;
  ops: number;
  abc: 'A' | 'B' | 'C';
}

/** Обращаемость ячеек за период и ABC-класс: A — 80% обращений, B — следующие 15%, C — остальные. */
export function cellActivity(events: OpEvent[], days = 30, now = Date.now()): Map<string, CellActivity> {
  const since = now - days * DAY;
  const count = new Map<string, number>();
  for (const e of events) {
    if (e.at < since || e.type === 'tare') continue;
    for (const a of [e.from, e.to]) if (a && !a.startsWith('@')) count.set(a, (count.get(a) ?? 0) + 1);
  }
  const list = [...count.entries()].sort((a, b) => b[1] - a[1]);
  const total = list.reduce((s, [, n]) => s + n, 0) || 1;
  const out = new Map<string, CellActivity>();
  let acc = 0;
  for (const [address, ops] of list) {
    acc += ops;
    out.set(address, {
      address,
      ops,
      abc: acc / total <= 0.8 || out.size === 0 ? 'A' : acc / total <= 0.95 ? 'B' : 'C',
    });
  }
  return out;
}

/** Дата последнего движения по ячейке: из среза или из журнала. */
export function lastMoves(inv: Inventory | undefined): Record<string, number> {
  const out: Record<string, number> = { ...(inv?.lastMove ?? {}) };
  for (const e of inv?.events ?? []) {
    for (const a of [e.from, e.to]) if (a && !a.startsWith('@') && (out[a] ?? 0) < e.at) out[a] = e.at;
  }
  return out;
}

// ---------- Лента событий ----------

export interface FeedItem {
  key: string;
  type: OpType;
  at: number;
  title: string;
  sub: string;
  addresses: string[];
}

const OP_SHORT: Record<OpType, string> = {
  receipt: 'Приход',
  shipment: 'Отгрузка',
  issue: 'Выдача',
  return: 'Возврат',
  move: 'Перемещение',
  count: 'Инвентаризация',
  writeoff: 'Списание',
  tare: 'Тара',
};

/** Последние движения из учётной системы — для ленты на главной. */
export function eventFeed(
  inv: Inventory | undefined,
  products: Map<string, Product>,
  partyName: (code: string) => string,
  limit = 20,
): FeedItem[] {
  const out: FeedItem[] = [];
  const ev = inv?.events ?? [];
  for (let i = ev.length - 1; i >= 0 && out.length < limit; i--) {
    const e = ev[i];
    const p = e.productId ? products.get(e.productId) : undefined;
    const what = p ? `${p.name} · ${fmtQty(Math.abs(e.qty), p.unit)}` : `${Math.abs(e.qty)} шт`;
    const party = e.party ? partyName(e.party) : '';
    let title = OP_SHORT[e.type];
    if (e.type === 'move') title += ` ${e.from} → ${e.to}`;
    else if (e.type === 'issue') title += ` ${party ? `→ ${party}` : ''} из ${e.from}`;
    else if (e.type === 'return') title += ` ${party ? `от ${party}` : ''} в ${e.to}`;
    else if (e.type === 'receipt') title += ` в ${e.to}`;
    else if (e.type === 'count') title += ` ${e.to}`;
    else if (e.from) title += ` из ${e.from}`;
    out.push({
      key: e.id,
      type: e.type,
      at: e.at,
      title,
      sub: `${what}${e.user ? ` · ${e.user}` : ''}`,
      addresses: [e.from, e.to].filter((a): a is string => !!a && !a.startsWith('@')),
    });
  }
  return out;
}

/** Остатки по группам ТМЦ (вес, т) — для структуры хранения. */
export function weightByGroup(
  inv: Inventory | undefined,
  products: Map<string, Product>,
): Partial<Record<MaterialGroup, number>> {
  const out: Partial<Record<MaterialGroup, number>> = {};
  for (const items of Object.values(inv?.stock ?? {})) {
    for (const [k, q] of Object.entries(items)) {
      const p = products.get(splitKey(k)[0]);
      if (p) out[p.group] = (out[p.group] ?? 0) + (q * p.weight) / 1000;
    }
  }
  return out;
}

// ---------- Форматирование ----------

export const fmtInt = (v: number) => Math.round(v).toLocaleString('ru-RU');

export function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс`;
  return fmtInt(v);
}

export const fmtTons = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т` : `${fmtInt(kg)} кг`;

export const pctOf = (a: number, b: number) => (b > 0 ? a / b : 0);

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (startOfDay(ts) === startOfDay(now))
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Изменение в процентах; null — если сравнивать не с чем. */
export const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);
