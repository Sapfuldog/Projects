import { useStore, useWarehouse } from '../store';
import { useMonitor, useProductsMap } from '../lib/derived';
import { PLACE_KINDS } from '../lib/demo';
import { GROUPS, fmtQty } from '../lib/materials';
import { timeAgo } from '../lib/analytics';
import type { PlaceKind } from '../types';
import { Icon, type IconName } from './icons';

const KIND_ICON: Record<PlaceKind, IconName> = {
  storage: 'boxes',
  person: 'user',
  room: 'building',
  transit: 'truck',
  repair: 'wrench',
  contractor: 'people',
};

/** Виртуальный склад: доска мест учёта вместо 3D (кабинеты, сотрудники, ремонт, в пути). */
export function VirtualBoard() {
  const w = useWarehouse();
  const m = useMonitor();
  const products = useProductsMap();
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  if (!w || !m) return null;
  return (
    <div className="vboard">
      <div className="vboard-head">
        <Icon name="virtual" size={20} />
        <div>
          <b>{w.name}</b>
          <div className="muted small">
            Виртуальный склад: учёт по местам без адресного хранения. {w.places.length} мест учёта.
          </div>
        </div>
      </div>
      <div className="vboard-grid">
        {w.places.map((pl) => {
          const c = m.idx.byAddress.get(pl.code);
          const u = m.usage.get(pl.code);
          const items = Object.entries(u?.byProduct ?? {}).sort((a, b) => b[1] - a[1]);
          const units = items.reduce((s, [, q]) => s + q, 0);
          const sel = selection?.kind === 'cell' && c && selection.id === c.key;
          const lm = m.lastMove[pl.code];
          return (
            <button
              key={pl.id}
              className={`vplace kind-${pl.kind} ${sel ? 'active' : ''}`}
              onClick={() => c && st().select({ kind: 'cell', id: c.key, rackId: '' })}
            >
              <div className="vplace-head">
                <span className="vplace-icon">
                  <Icon name={KIND_ICON[pl.kind]} size={18} />
                </span>
                <span className="grow">
                  <b>{pl.name}</b>
                  <span className="muted small">
                    {pl.code} · {PLACE_KINDS[pl.kind]}
                    {pl.note ? ` · ${pl.note}` : ''}
                  </span>
                </span>
                <span className="vplace-count">{Math.round(units)}</span>
              </div>
              <div className="vplace-items">
                {items.slice(0, 5).map(([pid, q]) => {
                  const p = products.get(pid);
                  return (
                    <span key={pid}>
                      <i style={{ background: p ? GROUPS[p.group].color : '#94a3b8' }} />
                      <span className="grow">{p?.name ?? pid}</span>
                      <b>{fmtQty(q, p?.unit ?? 'шт')}</b>
                    </span>
                  );
                })}
                {!items.length && <span className="muted small">Пусто</span>}
                {items.length > 5 && <span className="muted small">ещё {items.length - 5} позиций…</span>}
              </div>
              {lm && <div className="muted small">Последнее движение: {timeAgo(lm)}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
