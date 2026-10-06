import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { Section } from '../../types';
import { Icon, type IconName } from '../icons';
import { useCells, useFills, useInventory, useProducts } from '../../lib/derived';
import { buildAlerts, type Alert } from '../../lib/alerts';
import { timeAgo } from '../../lib/analytics';

export const NAV: { id: Section; title: string; icon: IconName }[] = [
  { id: 'home', title: 'Главная', icon: 'home' },
  { id: 'warehouse', title: 'Склад', icon: 'warehouse' },
  { id: 'stock', title: 'Остатки', icon: 'boxes' },
  { id: 'inbound', title: 'Поставки', icon: 'inbound' },
  { id: 'orders', title: 'Заказы', icon: 'orders' },
  { id: 'analytics', title: 'Аналитика', icon: 'chart' },
  { id: 'settings', title: 'Настройки', icon: 'settings' },
];

export function useAlerts(): Alert[] {
  const inv = useInventory();
  const products = useProducts();
  const { cells } = useCells();
  const fills = useFills();
  const sync = useStore((s) => (s.currentId ? s.sync[s.currentId] : undefined));
  return useMemo(() => buildAlerts(inv, products, cells, fills, sync), [inv, products, cells, fills, sync]);
}

export function NavRail() {
  const section = useStore((s) => s.section);
  const theme = useStore((s) => s.theme);
  const st = useStore.getState;
  const alerts = useAlerts();
  const ok = !alerts.some((a) => a.level !== 'info');
  return (
    <aside className="nav">
      <div className="nav-brand">
        <span className="nav-logo">
          <Icon name="cube" size={20} />
        </span>
        <span>Склад 3D</span>
      </div>
      <nav className="nav-items">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${section === n.id ? 'active' : ''}`}
            onClick={() => st().setSection(n.id)}
          >
            <Icon name={n.icon} />
            <span>{n.title}</span>
          </button>
        ))}
      </nav>
      <div className="nav-footer">
        <button className={`nav-status ${ok ? 'ok' : 'warn'}`} onClick={() => st().setSection(ok ? 'home' : 'stock')}>
          <i />
          {ok ? 'Склад в норме' : `Требует внимания: ${alerts.filter((a) => a.level !== 'info').length}`}
        </button>
        <button className="nav-item small" onClick={() => st().setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
        </button>
      </div>
    </aside>
  );
}

export function MobileTabs() {
  const section = useStore((s) => s.section);
  const st = useStore.getState;
  const items = NAV.filter((n) => ['home', 'warehouse', 'stock', 'orders', 'analytics'].includes(n.id));
  return (
    <nav className="mobile-tabs">
      {items.map((n) => (
        <button key={n.id} className={section === n.id ? 'active' : ''} onClick={() => st().setSection(n.id)}>
          <Icon name={n.icon} size={20} />
          <span>{n.title}</span>
        </button>
      ))}
    </nav>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

function WarehouseSwitcher() {
  const warehouses = useStore((s) => s.warehouses);
  const w = useWarehouse();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const st = useStore.getState;
  return (
    <div className="wh-switch" ref={ref}>
      <button className="wh-btn" onClick={() => setOpen(!open)}>
        <span className="wh-name">{w?.name ?? 'Нет объектов'}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="dropdown">
          {warehouses.map((x) => (
            <button
              key={x.id}
              className={`dropdown-item ${x.id === w?.id ? 'active' : ''}`}
              onClick={() => {
                st().setCurrent(x.id);
                setOpen(false);
              }}
            >
              <Icon name="warehouse" size={16} />
              <span className="grow">{x.name}</span>
              {x.id === w?.id && <Icon name="check" size={16} />}
            </button>
          ))}
          <div className="dropdown-sep" />
          <button
            className="dropdown-item"
            onClick={() => {
              st().createWarehouse('empty');
              st().setSection('warehouse', 'rooms');
              setOpen(false);
            }}
          >
            <Icon name="plus" size={16} /> Новый склад
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              st().createWarehouse('demo');
              setOpen(false);
            }}
          >
            <Icon name="plus" size={16} /> Демо-склад
          </button>
          <button
            className="dropdown-item"
            onClick={() => {
              st().setSection('settings');
              setOpen(false);
            }}
          >
            <Icon name="settings" size={16} /> Управление объектами
          </button>
        </div>
      )}
    </div>
  );
}

interface SearchHit {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  go: () => void;
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const products = useProducts();
  const inv = useInventory();
  const { cells } = useCells();
  const st = useStore.getState;

  const hits = useMemo<SearchHit[]>(() => {
    const t = q.trim().toUpperCase();
    if (t.length < 2) return [];
    const out: SearchHit[] = [];
    for (const p of products) {
      if ([p.name, p.sku, p.barcode ?? ''].some((v) => v.toUpperCase().includes(t)))
        out.push({
          key: `p${p.id}`,
          icon: 'boxes',
          title: p.name,
          sub: `Товар · ${p.sku}`,
          go: () => {
            st().setSection('stock');
            st().openProduct(p.id);
          },
        });
      if (out.length >= 6) break;
    }
    for (const d of inv?.docs ?? []) {
      if (d.number.toUpperCase().includes(t) || d.partner.toUpperCase().includes(t))
        out.push({
          key: `d${d.id}`,
          icon: d.kind === 'receipt' ? 'inbound' : 'orders',
          title: d.number,
          sub: `${d.kind === 'receipt' ? 'Поставка' : 'Заказ'} · ${d.partner}`,
          go: () => {
            st().setSection(d.kind === 'receipt' ? 'inbound' : 'orders');
            st().openDoc(d.id);
          },
        });
      if (out.length >= 10) break;
    }
    let n = 0;
    for (const c of cells) {
      if (!c.address.toUpperCase().includes(t)) continue;
      out.push({
        key: `c${c.key}`,
        icon: 'cells',
        title: c.address,
        sub: `Ячейка · ярус ${c.tier}`,
        go: () => st().showCell(c.address),
      });
      if (++n >= 6) break;
    }
    return out;
  }, [q, products, inv, cells, st]);

  return (
    <div className="gsearch" ref={ref}>
      <Icon name="search" size={16} />
      <input
        placeholder="Поиск по товарам, ячейкам, заказам…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) {
            hits[0].go();
            setOpen(false);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="dropdown search-results">
          {!hits.length && <div className="dropdown-empty">Ничего не найдено</div>}
          {hits.map((h) => (
            <button
              key={h.key}
              className="dropdown-item"
              onClick={() => {
                h.go();
                setOpen(false);
              }}
            >
              <Icon name={h.icon} size={16} />
              <span className="grow">
                <b>{h.title}</b>
                <span className="muted small"> {h.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LEVEL_ICON: Record<Alert['level'], IconName> = { critical: 'alert', warning: 'alert', info: 'info' };

function Notifications() {
  const alerts = useAlerts();
  const seen = useStore((s) => s.notifSeenAt);
  const inv = useInventory();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const st = useStore.getState;
  const fresh = (inv?.events ?? []).filter((e) => e.at > seen).length;
  const count = alerts.filter((a) => a.level !== 'info').length + (fresh > 0 ? 1 : 0);
  return (
    <div className="notif" ref={ref}>
      <button
        className="icon-round"
        title="Уведомления"
        onClick={() => {
          setOpen(!open);
          if (!open) st().markNotificationsSeen();
        }}
      >
        <Icon name="bell" />
        {count > 0 && <span className="badge-dot">{count}</span>}
      </button>
      {open && (
        <div className="dropdown notif-list">
          <div className="dropdown-title">Уведомления</div>
          {!alerts.length && <div className="dropdown-empty">Всё в порядке</div>}
          {alerts.map((a) => (
            <button
              key={a.id}
              className={`notif-item ${a.level}`}
              onClick={() => {
                if (a.section) st().setSection(a.section);
                if (a.productId) st().openProduct(a.productId);
                if (a.cell) st().showCell(a.cell);
                setOpen(false);
              }}
            >
              <Icon name={LEVEL_ICON[a.level]} size={16} />
              <span className="grow">
                <b>{a.title}</b>
                <span>{a.text}</span>
              </span>
              {a.at && <span className="muted small">{timeAgo(a.at)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserBadge() {
  const user = useStore((s) => s.user);
  const initials = user.name
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <button className="user" onClick={() => useStore.getState().setSection('settings')}>
      <span className="avatar">{initials}</span>
      <span className="user-text">
        <b>{user.name}</b>
        <span>{user.role}</span>
      </span>
    </button>
  );
}

export function TopBar() {
  return (
    <header className="topbar">
      <WarehouseSwitcher />
      <div className="grow" />
      <GlobalSearch />
      <Notifications />
      <UserBadge />
    </header>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => useStore.getState().dismissToast(t.id)}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check'} size={16} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
