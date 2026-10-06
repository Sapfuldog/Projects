import type { Cell, CellFill, Inventory, Product, Section, SyncStatus } from '../types';
import { productTotals, stockStatus } from './inventory';

export type AlertLevel = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  text: string;
  at?: number;
  section?: Section;
  productId?: string;
  cell?: string;
}

/** Уведомления: дефицит товара, перегруз ячеек, ошибки подключения, документы в работе. */
export function buildAlerts(
  inv: Inventory | undefined,
  products: Product[],
  cells: Cell[],
  fills: Record<string, CellFill>,
  sync?: SyncStatus,
): Alert[] {
  const out: Alert[] = [];
  const totals = productTotals(inv);
  for (const p of products) {
    const q = totals.get(p.id)?.qty ?? 0;
    const st = stockStatus(p, q);
    if (st === 'out' && p.min > 0)
      out.push({
        id: `out-${p.id}`,
        level: 'critical',
        title: 'Нет в наличии',
        text: `${p.name} (${p.sku})`,
        section: 'stock',
        productId: p.id,
      });
    if (st === 'low')
      out.push({
        id: `low-${p.id}`,
        level: 'warning',
        title: 'Низкий остаток',
        text: `${p.name}: ${q.toLocaleString('ru-RU')} ${p.unit} при минимуме ${p.min.toLocaleString('ru-RU')}`,
        section: 'stock',
        productId: p.id,
      });
  }
  const overloaded = cells.filter((c) => {
    const f = fills[c.address];
    return f?.weight !== undefined && c.maxLoad > 0 && f.weight > c.maxLoad;
  });
  if (overloaded.length)
    out.push({
      id: 'overload',
      level: 'critical',
      title: 'Перегруз ячеек',
      text: `${overloaded.length} яч. тяжелее допустимой нагрузки Г: ${overloaded
        .slice(0, 3)
        .map((c) => c.address)
        .join(', ')}${overloaded.length > 3 ? '…' : ''}`,
      section: 'analytics',
      cell: overloaded[0].address,
    });
  if (sync?.error)
    out.push({
      id: 'sync',
      level: 'critical',
      title: 'Ошибка подключения',
      text: sync.error,
      at: sync.at,
      section: 'settings',
    });
  const newReceipts =
    inv?.docs.filter((d) => d.kind === 'receipt' && d.status !== 'done' && d.status !== 'cancelled') ?? [];
  if (newReceipts.length)
    out.push({
      id: 'receipts',
      level: 'info',
      title: 'Ожидают приёмки',
      text: `Поставок: ${newReceipts.length} (${newReceipts.map((d) => d.number).join(', ')})`,
      at: Math.max(...newReceipts.map((d) => d.createdAt)),
      section: 'inbound',
    });
  const openOrders =
    inv?.docs.filter((d) => d.kind === 'order' && d.status !== 'done' && d.status !== 'cancelled') ?? [];
  if (openOrders.length)
    out.push({
      id: 'orders',
      level: 'info',
      title: 'Заказы к сборке',
      text: `Заказов: ${openOrders.length} (${openOrders.map((d) => d.number).join(', ')})`,
      at: Math.max(...openOrders.map((d) => d.createdAt)),
      section: 'orders',
    });
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
