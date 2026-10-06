import type { Inventory, OpEvent, Product } from '../types';
import { productTotals } from './inventory';

export const DAY = 24 * 3600 * 1000;

export const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Изменение общего остатка, которое вносит операция. */
export function stockDelta(e: OpEvent): number {
  if (e.type === 'receipt') return e.qty;
  if (e.type === 'shipment') return -e.qty;
  if (e.type === 'count') return e.qty;
  return 0;
}

export interface DayPoint {
  day: number;
  receipts: number;
  shipments: number;
  /** Остаток на конец дня, шт */
  stock: number;
}

/** Ряд по дням: приход, расход и остаток на конец дня (восстанавливается из журнала). */
export function dailySeries(inv: Inventory | undefined, days = 30, now = Date.now()): DayPoint[] {
  const today = startOfDay(now);
  const points: DayPoint[] = Array.from({ length: days }, (_, i) => ({
    day: today - (days - 1 - i) * DAY,
    receipts: 0,
    shipments: 0,
    stock: 0,
  }));
  if (!inv) return points;
  let total = 0;
  productTotals(inv).forEach((t) => (total += t.qty));
  const first = points[0].day;
  const deltaByDay = new Map<number, number>();
  for (const e of inv.events) {
    const d = startOfDay(e.at);
    if (d < first) continue;
    const p = points[Math.round((d - first) / DAY)];
    if (!p) continue;
    if (e.type === 'receipt') p.receipts += e.qty;
    if (e.type === 'shipment') p.shipments += e.qty;
    deltaByDay.set(d, (deltaByDay.get(d) ?? 0) + stockDelta(e));
  }
  // Идём от текущего остатка назад во времени
  for (let i = points.length - 1; i >= 0; i--) {
    points[i].stock = total;
    total -= deltaByDay.get(points[i].day) ?? 0;
  }
  return points;
}

export interface Kpis {
  totalQty: number;
  skuCount: number;
  stockValue: number;
  receipts7: number;
  receiptsPrev7: number;
  shipments7: number;
  shipmentsPrev7: number;
  receiptDocs7: number;
  orderDocs7: number;
}

export function kpis(inv: Inventory | undefined, products: Product[], now = Date.now()): Kpis {
  const totals = productTotals(inv);
  const byId = new Map(products.map((p) => [p.id, p]));
  let totalQty = 0;
  let stockValue = 0;
  totals.forEach((t, pid) => {
    totalQty += t.qty;
    stockValue += t.qty * (byId.get(pid)?.price ?? 0);
  });
  const k: Kpis = {
    totalQty,
    skuCount: [...totals.values()].filter((t) => t.qty > 0).length,
    stockValue,
    receipts7: 0,
    receiptsPrev7: 0,
    shipments7: 0,
    shipmentsPrev7: 0,
    receiptDocs7: 0,
    orderDocs7: 0,
  };
  if (!inv) return k;
  const t7 = now - 7 * DAY;
  const t14 = now - 14 * DAY;
  for (const e of inv.events) {
    if (e.at < t14) continue;
    const cur = e.at >= t7;
    if (e.type === 'receipt') cur ? (k.receipts7 += e.qty) : (k.receiptsPrev7 += e.qty);
    if (e.type === 'shipment') cur ? (k.shipments7 += e.qty) : (k.shipmentsPrev7 += e.qty);
  }
  for (const d of inv.docs) {
    if (d.status !== 'done' || !d.doneAt || d.doneAt < t7) continue;
    if (d.kind === 'receipt') k.receiptDocs7++;
    else k.orderDocs7++;
  }
  return k;
}

/** Изменение в процентах; null — если сравнивать не с чем. */
export const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);

export interface CategoryShare {
  category: string;
  qty: number;
  value: number;
}

/** Остатки по категориям: крупнейшие 4 + «Прочее». */
export function categoryShares(inv: Inventory | undefined, products: Product[], top = 4): CategoryShare[] {
  const totals = productTotals(inv);
  const m = new Map<string, CategoryShare>();
  for (const p of products) {
    const q = totals.get(p.id)?.qty ?? 0;
    if (!q) continue;
    const c = m.get(p.category) ?? { category: p.category, qty: 0, value: 0 };
    c.qty += q;
    c.value += q * p.price;
    m.set(p.category, c);
  }
  const list = [...m.values()].sort((a, b) => b.value - a.value);
  if (list.length <= top + 1) return list;
  const rest = list
    .slice(top)
    .reduce((s, c) => ({ category: 'Прочее', qty: s.qty + c.qty, value: s.value + c.value }), {
      category: 'Прочее',
      qty: 0,
      value: 0,
    });
  return [...list.slice(0, top), rest];
}

export interface Turnover {
  product: Product;
  shipped: number;
  value: number;
  stock: number;
  abc: 'A' | 'B' | 'C';
}

/** Оборот товаров за период и ABC-класс по выручке (80 / 15 / 5 %). */
export function turnover(inv: Inventory | undefined, products: Product[], days = 30, now = Date.now()): Turnover[] {
  const totals = productTotals(inv);
  const shipped = new Map<string, number>();
  for (const e of inv?.events ?? []) {
    if (e.type === 'shipment' && e.at >= now - days * DAY)
      shipped.set(e.productId, (shipped.get(e.productId) ?? 0) + e.qty);
  }
  const list = products
    .map((p) => {
      const q = shipped.get(p.id) ?? 0;
      return {
        product: p,
        shipped: q,
        value: q * p.price,
        stock: totals.get(p.id)?.qty ?? 0,
        abc: 'C' as 'A' | 'B' | 'C',
      };
    })
    .sort((a, b) => b.value - a.value);
  const sum = list.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  for (const x of list) {
    acc += x.value;
    x.abc = acc / sum <= 0.8 || x === list[0] ? 'A' : acc / sum <= 0.95 ? 'B' : 'C';
  }
  return list;
}

export const fmtInt = (v: number) => Math.round(v).toLocaleString('ru-RU');

export function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млрд ₽`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} тыс ₽`;
  return `${fmtInt(v)} ₽`;
}

export function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс`;
  return fmtInt(v);
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  if (startOfDay(ts) === startOfDay(now))
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export interface EventGroup {
  key: string;
  type: OpEvent['type'];
  at: number;
  title: string;
  sub: string;
  user: string;
  docId?: string;
  addresses: string[];
}

/** Лента событий: операции одного документа объединяются в одну запись. */
export function eventFeed(inv: Inventory | undefined, products: Map<string, Product>, limit = 20): EventGroup[] {
  if (!inv) return [];
  const docs = new Map(inv.docs.map((d) => [d.id, d]));
  const out: EventGroup[] = [];
  const byDoc = new Map<string, EventGroup & { items: Set<string>; qty: number }>();
  for (let i = inv.events.length - 1; i >= 0 && out.length < limit; i--) {
    const e = inv.events[i];
    const p = products.get(e.productId);
    if (e.docId) {
      let g = byDoc.get(e.docId);
      if (!g) {
        const d = docs.get(e.docId);
        g = {
          key: `d${e.docId}`,
          type: e.type,
          at: e.at,
          title: `${e.type === 'receipt' ? 'Поступление' : 'Отгрузка'} ${d?.number ?? ''}`.trim(),
          sub: '',
          user: e.user,
          docId: e.docId,
          addresses: [],
          items: new Set(),
          qty: 0,
        };
        byDoc.set(e.docId, g);
        out.push(g);
      }
      g.items.add(e.productId);
      g.qty += e.qty;
      const addr = e.to ?? e.from;
      if (addr) g.addresses.push(addr);
      g.sub = `${g.items.size} поз. · ${fmtInt(g.qty)} ед.${docs.get(e.docId)?.partner ? ` · ${docs.get(e.docId)!.partner}` : ''}`;
      continue;
    }
    if (e.type === 'move')
      out.push({
        key: e.id,
        type: e.type,
        at: e.at,
        title: `Перемещение ${e.from} → ${e.to}`,
        sub: `${p?.name ?? ''} · ${fmtInt(e.qty)} ${p?.unit ?? ''}`,
        user: e.user,
        addresses: [e.from!, e.to!],
      });
    else if (e.type === 'count')
      out.push({
        key: e.id,
        type: e.type,
        at: e.at,
        title: `Инвентаризация ${e.to}`,
        sub: `${p?.name ?? ''}: ${e.qty > 0 ? '+' : ''}${fmtInt(e.qty)} ${p?.unit ?? ''}`,
        user: e.user,
        addresses: [e.to!],
      });
    else
      out.push({
        key: e.id,
        type: e.type,
        at: e.at,
        title: e.type === 'receipt' ? `Поступление в ${e.to}` : `Отгрузка из ${e.from}`,
        sub: `${p?.name ?? ''} · ${fmtInt(e.qty)} ${p?.unit ?? ''}`,
        user: e.user,
        addresses: [(e.to ?? e.from)!],
      });
  }
  return out;
}
