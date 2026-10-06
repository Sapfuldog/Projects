import { useMemo } from 'react';
import { useStore } from '../store';
import { useInventory, useProducts, useProductsMap, useProductTotals, useStats } from '../lib/derived';
import { change, eventFeed, fmtCompact, fmtInt, kpis, timeAgo, type EventGroup } from '../lib/analytics';
import { stockStatus } from '../lib/inventory';
import { fillColor } from '../lib/fill';
import { Viewport } from '../components/Viewport';
import { Icon, type IconName } from '../components/icons';
import { useAlerts } from '../components/shell/Shell';
import type { OpType } from '../types';

export function Delta({ v, invert = false }: { v: number | null; invert?: boolean }) {
  if (v === null || !Number.isFinite(v)) return null;
  const good = invert ? v < 0 : v >= 0;
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      {v >= 0 ? '+' : '−'}
      {Math.abs(Math.round(v * 100))}%
    </span>
  );
}

export function KpiTile({
  icon,
  label,
  value,
  sub,
  delta,
  progress,
}: {
  icon: IconName;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
  progress?: number;
}) {
  return (
    <div className="kpi card">
      <span className="kpi-icon">
        <Icon name={icon} size={20} />
      </span>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {progress !== undefined ? (
          <div className="kpi-progress">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : (
          <div className="kpi-sub">
            <span>{sub}</span>
            {delta}
          </div>
        )}
      </div>
    </div>
  );
}

export const OP_ICON: Record<OpType, IconName> = {
  receipt: 'inbound',
  shipment: 'shipment',
  move: 'move',
  count: 'count',
};

export function EventRow({ g }: { g: EventGroup }) {
  const st = useStore.getState;
  return (
    <button
      className="event"
      onClick={() => {
        if (g.addresses.length) {
          st().setHighlight([...new Set(g.addresses)]);
          st().showCell(g.addresses[0]);
        }
      }}
      title="Показать ячейки на складе"
    >
      <span className={`event-icon ${g.type}`}>
        <Icon name={OP_ICON[g.type]} size={16} />
      </span>
      <span className="grow">
        <b>{g.title}</b>
        <span>{g.sub}</span>
      </span>
      <span className="event-time">{timeAgo(g.at)}</span>
    </button>
  );
}

function StockCard() {
  const products = useProducts();
  const totals = useProductTotals();
  const alerts = useAlerts();
  const st = useStore.getState;
  const top = useMemo(
    () =>
      products
        .map((p) => ({ p, qty: totals.get(p.id)?.qty ?? 0 }))
        .sort((a, b) => b.qty * b.p.price - a.qty * a.p.price)
        .slice(0, 7),
    [products, totals],
  );
  const problems = alerts.filter((a) => a.level !== 'info');
  return (
    <div className="card stock-card">
      <div className="card-head">
        <h3>Остатки по складу</h3>
        <button className="link" onClick={() => st().setSection('stock')}>
          Все
        </button>
      </div>
      {!top.length && <p className="muted small">Нет товаров. Добавьте их в разделе «Остатки».</p>}
      <div className="stock-list">
        {top.map(({ p, qty }) => {
          const ratio = p.max ? qty / p.max : 0;
          const status = stockStatus(p, qty);
          return (
            <button
              key={p.id}
              className="stock-row"
              onClick={() => {
                st().setSection('stock');
                st().openProduct(p.id);
              }}
            >
              <span className="stock-icon">
                <Icon name="boxes" size={18} />
              </span>
              <span className="grow">
                <b>{p.name}</b>
                <span>
                  {fmtInt(qty)} {p.unit}
                </span>
              </span>
              <span className={`stock-pct ${status}`}>{Math.round(ratio * 100)}%</span>
            </button>
          );
        })}
      </div>
      <button className={`stock-status ${problems.length ? 'warn' : 'ok'}`} onClick={() => st().setSection('stock')}>
        <i />
        {problems.length ? `Требует внимания: ${problems.length}` : 'Склад в норме'}
      </button>
    </div>
  );
}

function EventsCard() {
  const inv = useInventory();
  const pm = useProductsMap();
  const st = useStore.getState;
  const feed = useMemo(() => eventFeed(inv, pm, 14), [inv, pm]);
  const pending = (inv?.docs ?? []).filter((d) => d.status === 'new' || d.status === 'progress');
  return (
    <div className="card events-card">
      <div className="card-head">
        <h3>Последние события</h3>
      </div>
      {pending.length > 0 && (
        <div className="pending">
          {pending.slice(0, 4).map((d) => (
            <button
              key={d.id}
              className="pending-row"
              onClick={() => {
                st().setSection(d.kind === 'receipt' ? 'inbound' : 'orders');
                st().openDoc(d.id);
              }}
            >
              <Icon name={d.kind === 'receipt' ? 'inbound' : 'orders'} size={15} />
              <span className="grow">
                {d.kind === 'receipt' ? 'Ожидает приёмки' : d.status === 'progress' ? 'Собирается' : 'Новый заказ'}{' '}
                {d.number}
              </span>
              <span className={`badge ${d.status}`}>{d.lines.length} поз.</span>
            </button>
          ))}
        </div>
      )}
      <div className="events">
        {!feed.length && <p className="muted small">Операций пока не было.</p>}
        {feed.map((g) => (
          <EventRow key={g.key} g={g} />
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const inv = useInventory();
  const products = useProducts();
  const stats = useStats();
  const k = useMemo(() => kpis(inv, products), [inv, products]);
  const occ = stats.all.available ? stats.all.occupied / stats.all.available : 0;
  return (
    <div className="page home">
      <div className="kpis">
        <KpiTile
          icon="boxes"
          label="Общий остаток"
          value={fmtCompact(k.totalQty)}
          sub={`${k.skuCount} SKU`}
          delta={<Delta v={change(k.totalQty, k.totalQty - k.receipts7 + k.shipments7)} />}
        />
        <KpiTile icon="warehouse" label="Занятость склада" value={`${Math.round(occ * 100)}%`} progress={occ} />
        <KpiTile
          icon="inbound"
          label="Поступления (7 дн.)"
          value={fmtCompact(k.receipts7)}
          sub={`${k.receiptDocs7} док.`}
          delta={<Delta v={change(k.receipts7, k.receiptsPrev7)} />}
        />
        <KpiTile
          icon="shipment"
          label="Отгрузки (7 дн.)"
          value={fmtCompact(k.shipments7)}
          sub={`${k.orderDocs7} заказов`}
          delta={<Delta v={change(k.shipments7, k.shipmentsPrev7)} />}
        />
      </div>
      <div className="home-grid">
        <StockCard />
        <div className="card home-view">
          <Viewport monitor />
          <div className="fill-legend">
            <span>Заполнение</span>
            <i style={{ background: `linear-gradient(90deg, ${fillColor(0)}, ${fillColor(0.5)}, ${fillColor(1)})` }} />
            <span>0–100%</span>
          </div>
        </div>
        <EventsCard />
      </div>
    </div>
  );
}
