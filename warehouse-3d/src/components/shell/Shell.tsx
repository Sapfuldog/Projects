import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { Section } from '../../types';
import { Icon, type IconName } from '../icons';
import { useInventory, useMonitor, useProducts } from '../../lib/derived';
import { buildAlerts, type Alert } from '../../lib/alerts';
import { timeAgo } from '../../lib/analytics';
import { fmtQty } from '../../lib/materials';
import { fold, searchCells } from '../../lib/search';

export const NAV: { id: Section; title: string; icon: IconName; hint: string }[] = [
  { id: 'home', title: 'Обзор', icon: 'home', hint: 'Склады, помещения и ячейки: заполнение и состояние' },
  { id: 'cells', title: 'Ячейки', icon: 'grid', hint: 'Карта ячеек стеллажей, свойства и содержимое' },
  { id: 'items', title: 'ТМЦ', icon: 'boxes', hint: 'Где лежат ТМЦ: партии, плавки, сроки' },
  { id: 'tare', title: 'Тара', icon: 'cylinder', hint: 'Поддоны, барабаны, газовые баллоны' },
  { id: 'control', title: 'Контроль', icon: 'shield', hint: 'Нарушения правил хранения' },
  { id: 'analytics', title: 'Аналитика', icon: 'chart', hint: 'Графики заполнения и обращаемости' },
  { id: 'warehouse', title: 'Конструктор', icon: 'warehouse', hint: 'Здания, этажи, зоны, стеллажи, мезонины' },
  { id: 'settings', title: 'Настройки', icon: 'settings', hint: 'Объекты, подключение к учётной системе, справочники' },
];

export function useAlerts(): Alert[] {
  const w = useWarehouse();
  const m = useMonitor();
  const sync = useStore((s) => (s.currentId ? s.sync[s.currentId] : undefined));
  return useMemo(() => buildAlerts(w, m, sync), [w, m, sync]);
}

export function NavRail() {
  const section = useStore((s) => s.section);
  const theme = useStore((s) => s.theme);
  const st = useStore.getState;
  const alerts = useAlerts();
  const critical = alerts.filter((a) => a.level === 'critical').length;
  const warning = alerts.filter((a) => a.level === 'warning').length;
  return (
    <aside className="nav">
      <div className="nav-brand">
        <span className="nav-logo">
          <Icon name="cube" size={20} />
        </span>
        <span>
          Склад 3D
          <em>мониторинг ТМЦ</em>
        </span>
      </div>
      <nav className="nav-items">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${section === n.id ? 'active' : ''}`}
            onClick={() => st().setSection(n.id)}
            title={n.hint}
          >
            <Icon name={n.icon} />
            <span>{n.title}</span>
            {n.id === 'control' && critical + warning > 0 && (
              <span className={`nav-count ${critical ? 'bad' : 'warn'}`}>{critical + warning}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="nav-footer">
        <button
          className={`nav-status ${critical ? 'bad' : warning ? 'warn' : 'ok'}`}
          onClick={() => st().setSection('control')}
        >
          <i />
          {critical ? `Критично: ${critical}` : warning ? `Внимание: ${warning}` : 'Нарушений нет'}
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
  const items = NAV.filter((n) => ['home', 'cells', 'items', 'control', 'analytics'].includes(n.id));
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
        <Icon name={w?.kind === 'virtual' ? 'virtual' : 'warehouse'} size={18} />
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
              <Icon name={x.kind === 'virtual' ? 'virtual' : 'warehouse'} size={16} />
              <span className="grow">
                {x.name}
                <span className="muted small"> {x.kind === 'virtual' ? '· виртуальный' : ''}</span>
              </span>
              {x.id === w?.id && <Icon name="check" size={16} />}
            </button>
          ))}
          <div className="dropdown-sep" />
          <button
            className="dropdown-item"
            onClick={() => {
              st().setLevel('warehouses');
              st().setSection('home');
              setOpen(false);
            }}
          >
            <Icon name="grid" size={16} /> Все объекты
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

/**
 * Поиск по адресу ячейки (можно сканером штрихкода) и по номенклатуре: ТМЦ, артикул, партия, плавка.
 * Запрос общий с разделом «Ячейки»: найденные ячейки подсвечиваются на 3D и выводятся списком.
 */
function GlobalSearch() {
  const q = useStore((s) => s.search);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const products = useProducts();
  const m = useMonitor();
  const st = useStore.getState;

  // Где лежит каждый ТМЦ: ячеек и количество
  const stock = useMemo(() => {
    const out = new Map<string, { cells: number; qty: number }>();
    for (const u of m?.usage.values() ?? []) {
      for (const [pid, qty] of Object.entries(u.byProduct)) {
        const e = out.get(pid) ?? { cells: 0, qty: 0 };
        e.cells++;
        e.qty += qty;
        out.set(pid, e);
      }
    }
    return out;
  }, [m]);

  const hits = useMemo<SearchHit[]>(() => {
    const t = q.trim();
    if (t.length < 2 || !m) return [];
    const f = fold(t);
    const inCells = (text: string) => () => {
      st().setSearch(text);
      st().setSection('cells');
    };
    const out: SearchHit[] = [];
    const exact = m.idx.cells.find((c) => fold(c.address) === f);
    if (exact)
      out.push({
        key: `x${exact.key}`,
        icon: 'scan',
        title: exact.address,
        sub: 'Ячейка — открыть карточку',
        go: () => st().openCell(exact.address),
      });
    const found = searchCells(m, t);
    if (found.size)
      out.push({
        key: 'all',
        icon: 'cells',
        title: `«${t}» в ячейках`,
        sub: `${found.size.toLocaleString('ru-RU')} яч. — список номенклатуры по ячейкам`,
        go: inCells(t),
      });
    let n = 0;
    for (const p of products) {
      if (![p.name, p.sku, p.barcode ?? '', p.attrs?.drawing ?? ''].some((v) => fold(String(v)).includes(f))) continue;
      const e = stock.get(p.id);
      out.push({
        key: `p${p.id}`,
        icon: 'boxes',
        title: p.name,
        sub: e ? `${p.sku} · ${e.cells} яч. · ${fmtQty(e.qty, p.unit)}` : `${p.sku} · нет на складе`,
        go: e
          ? inCells(p.sku)
          : () => {
              st().setSection('items');
              st().openProduct(p.id);
            },
      });
      if (++n >= 6) break;
    }
    // Партии и плавки
    n = 0;
    for (const b of Object.values(m.inv?.batches ?? {})) {
      const key = [b.number, b.heat, b.cert, b.order].find((v) => v && fold(v).includes(f));
      if (!key) continue;
      const where = searchCells(m, key).size;
      if (!where) continue;
      const p = m.pm.get(b.productId);
      out.push({
        key: `b${b.id}`,
        icon: 'target',
        title: b.heat ? `Плавка ${b.heat}` : `Партия ${b.number}`,
        sub: `${p?.name ?? ''} · ${where} яч.`,
        go: inCells(key),
      });
      if (++n >= 4) break;
    }
    // Ячейки по части адреса
    n = 0;
    for (const c of m.idx.cells) {
      if (c === exact || !fold(c.address).includes(f)) continue;
      out.push({
        key: `c${c.key}`,
        icon: 'grid',
        title: c.address,
        sub: c.virtual ? 'Место учёта' : `Ячейка · ярус ${c.tier}`,
        go: () => st().openCell(c.address),
      });
      if (++n >= 4) break;
    }
    return out;
  }, [q, products, m, stock, st]);

  return (
    <div className="gsearch" ref={ref}>
      <Icon name="search" size={16} />
      <input
        id="global-search"
        placeholder="Адрес ячейки, ТМЦ, партия, плавка…"
        value={q}
        onChange={(e) => {
          st().setSearch(e.target.value);
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
      {q && (
        <button
          className="icon-btn small"
          onClick={() => {
            st().setSearch('');
            setOpen(false);
          }}
          title="Сбросить поиск"
        >
          <Icon name="close" size={13} />
        </button>
      )}
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const st = useStore.getState;
  const count = alerts.filter((a) => a.level !== 'info').length;
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

/** Состояние обмена с учётной системой. */
function SyncChip() {
  const w = useWarehouse();
  const sync = useStore((s) => (s.currentId ? s.sync[s.currentId] : undefined));
  const inv = useInventory();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  if (!w) return null;
  const conn = w.connection;
  const live = conn.active && conn.type !== 'none' && conn.type !== 'file';
  const at = inv?.updatedAt || sync?.at;
  const label =
    conn.type === 'demo'
      ? 'Демо-поток'
      : conn.type === 'rest'
        ? 'REST'
        : conn.type === 'ws'
          ? 'WebSocket'
          : conn.type === 'file'
            ? 'Файл'
            : 'Нет источника';
  return (
    <button
      className={`sync-chip ${sync?.error ? 'bad' : live ? 'live' : ''}`}
      onClick={() => useStore.getState().setSection('settings')}
      title="Источник данных: учётная система"
    >
      <i />
      <span>
        {label}
        {at ? ` · ${timeAgo(at)}` : ''}
      </span>
    </button>
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
      <SyncChip />
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

/** Диалог подтверждения действия. */
export function ConfirmDialog() {
  const dialog = useStore((s) => s.dialog);
  const st = useStore.getState;
  if (!dialog) return null;
  return (
    <div className="modal-back" onClick={() => st().closeDialog()}>
      <div className="modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p>{dialog.text}</p>
        <div className="row">
          <button
            className={`btn ${dialog.danger ? 'danger' : 'primary'}`}
            autoFocus
            onClick={() => {
              dialog.onYes();
              st().closeDialog();
            }}
          >
            {dialog.action}
          </button>
          <button className="btn" onClick={() => st().closeDialog()}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
