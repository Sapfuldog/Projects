import { useMemo, useState } from 'react';
import { useStore, useWarehouse } from '../store';
import type { MaterialGroup, Product } from '../types';
import { useMonitor, useProducts, useProductsMap, useTareMap } from '../lib/derived';
import { GROUPS, STORAGE_UNITS, fmtQty, fmtQtyFull, tareCount } from '../lib/materials';
import { batchStock, splitKey } from '../lib/inventory';
import { DAY, fmtTons } from '../lib/analytics';
import { Icon } from '../components/icons';

interface Row {
  p: Product;
  qty: number;
  weight: number;
  cells: string[];
  batches: number;
  expired: number;
  expiring: number;
  rooms: string[];
}

const attrLine = (p: Product) =>
  Object.entries(p.attrs ?? {})
    .filter(([k]) => !['kgPerM', 'class', 'mass', 'length'].includes(k))
    .map(([, v]) => v)
    .slice(0, 4)
    .join(' · ');

function ProductDrawer({ p, row }: { p: Product; row?: Row }) {
  const m = useMonitor();
  const w = useWarehouse();
  const tare = useTareMap();
  const st = useStore.getState;
  if (!m || !w) return null;
  const batches = batchStock(m.inv, p.id);
  const now = Date.now();
  const g = GROUPS[p.group];
  const t = p.tareTypeId ? tare.get(p.tareTypeId) : undefined;
  const cells = row?.cells ?? [];
  return (
    <aside className="card drawer2">
      <div className="drawer-head">
        <span className="cc-type" style={{ background: g.color }}>
          {g.short}
        </span>
        <div className="grow">
          <b>{p.name}</b>
          <div className="muted small">
            {p.sku} · {g.title} · {p.category}
          </div>
        </div>
        <button className="icon-btn small" onClick={() => st().openProduct(null)} title="Закрыть">
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="cc-props">
        <span>
          <em>Остаток</em>
          <b>{row ? fmtQtyFull(p, row.qty) : '—'}</b>
        </span>
        <span>
          <em>Вес</em>
          <b>{row ? fmtTons(row.weight) : '—'}</b>
        </span>
        <span>
          <em>Хранение</em>
          <b>{STORAGE_UNITS[p.storage].title}</b>
        </span>
        <span>
          <em>Учёт</em>
          <b>{p.tracking === 'batch' ? 'по партиям' : p.tracking === 'serial' ? 'по номерам' : 'количественный'}</b>
        </span>
        {t && (
          <span>
            <em>Тара</em>
            <b>
              {t.name}
              {p.perTare ? ` · ${p.perTare.toLocaleString('ru-RU')} ${p.unit}` : ''}
            </b>
          </span>
        )}
        {t && row && (
          <span>
            <em>Тары под товаром</em>
            <b>{tareCount(p, row.qty)} шт</b>
          </span>
        )}
        {p.shelfLife && (
          <span>
            <em>Срок годности</em>
            <b>{p.shelfLife} дн.</b>
          </span>
        )}
        {p.hazard && (
          <span>
            <em>Опасный груз</em>
            <b className="bad-text">ЛВЖ / газы</b>
          </span>
        )}
      </div>
      {p.attrs && Object.keys(p.attrs).length > 0 && (
        <div className="cc-section">
          <div className="cc-title">Характеристики</div>
          <div className="attrs">
            {Object.entries(p.attrs).map(([k, v]) => (
              <span key={k}>
                <em>{g.attrs.find((a) => a.key === k)?.label ?? k}</em>
                <b>{v}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="cc-section">
        <div className="cc-title">
          {p.tracking === 'serial' ? 'Номера' : 'Партии'} · {batches.length}
        </div>
        <div className="batches">
          {batches.map((b, i) => {
            const exp = b.batch?.expiry;
            const cls = exp ? (exp < now ? 'bad' : exp < now + 30 * DAY ? 'warn' : '') : '';
            return (
              <div key={b.batchId ?? i} className={`batch ${cls}`}>
                <div className="grow">
                  <b>{b.batch?.number ?? 'Без партии'}</b>
                  <div className="muted small">
                    {b.batch?.heat && `плавка ${b.batch.heat} · `}
                    {b.batch?.cert && `${b.batch.cert} · `}
                    {b.batch?.order && `${b.batch.order} · `}
                    {exp && (
                      <span className={`exp ${cls}`}>годен до {new Date(exp).toLocaleDateString('ru-RU')} · </span>
                    )}
                    {b.batch?.receivedAt && `приход ${new Date(b.batch.receivedAt).toLocaleDateString('ru-RU')}`}
                  </div>
                  <div className="batch-cells">
                    {b.cells.map(({ address, qty }) => (
                      <button
                        key={address}
                        className="cellchip"
                        onClick={() => st().openCell(address)}
                        title="Открыть карточку ячейки"
                      >
                        <span className="mono">{address}</span> <b>{fmtQty(qty, p.unit)}</b>
                      </button>
                    ))}
                  </div>
                </div>
                <b className="nowrap">{fmtQtyFull(p, b.qty)}</b>
              </div>
            );
          })}
          {!batches.length && <div className="muted small">Нет на складе</div>}
        </div>
      </div>
      <div className="row wrap">
        <button
          className="btn small primary"
          disabled={!cells.length}
          onClick={() => {
            st().setSearch(p.sku);
            st().setSection('cells');
          }}
        >
          <Icon name="cells" size={15} /> Ячейки с этим ТМЦ ({cells.length})
        </button>
        <button
          className="btn small"
          disabled={!cells.length}
          onClick={() => {
            st().setProductFilter(null);
            st().showCells(cells);
          }}
        >
          <Icon name="cube" size={15} /> Показать на 3D
        </button>
      </div>
    </aside>
  );
}

/** Раздел «ТМЦ»: где лежит каждая позиция — ячейки, партии, плавки, сроки годности. */
export function ItemsPage() {
  const m = useMonitor();
  const products = useProducts();
  const pmap = useProductsMap();
  const w = useWarehouse();
  const openId = useStore((s) => s.openProductId);
  const st = useStore.getState;
  const [group, setGroup] = useState<MaterialGroup | 'all'>('all');
  const [q, setQ] = useState('');
  const [onlyStock, setOnlyStock] = useState(true);

  const rows = useMemo(() => {
    const out = new Map<string, Row>();
    if (!m || !w) return out;
    const now = Date.now();
    for (const [address, items] of Object.entries(m.inv?.stock ?? {})) {
      const c = m.idx.byAddress.get(address);
      const room = c ? (w.rooms.find((r) => r.id === c.roomId)?.code ?? c.note ?? '') : '';
      for (const [k, qty] of Object.entries(items)) {
        const [pid, bid] = splitKey(k);
        const p = pmap.get(pid);
        if (!p) continue;
        let r = out.get(pid);
        if (!r) out.set(pid, (r = { p, qty: 0, weight: 0, cells: [], batches: 0, expired: 0, expiring: 0, rooms: [] }));
        r.qty += qty;
        r.weight += qty * p.weight;
        if (!r.cells.includes(address)) r.cells.push(address);
        if (room && !r.rooms.includes(room)) r.rooms.push(room);
        const b = bid ? m.inv?.batches[bid] : undefined;
        if (b) {
          r.batches++;
          if (b.expiry && b.expiry < now) r.expired++;
          else if (b.expiry && b.expiry < now + 30 * DAY) r.expiring++;
        }
      }
    }
    return out;
  }, [m, w, pmap]);

  if (!m || !w) return null;
  const groups = (Object.keys(GROUPS) as MaterialGroup[]).map((g) => {
    const list = [...rows.values()].filter((r) => r.p.group === g);
    return { g, n: list.length, weight: list.reduce((s, r) => s + r.weight, 0) };
  });
  const t = q.trim().toLowerCase();
  const list = products
    .filter((p) => group === 'all' || p.group === group)
    .filter((p) => !onlyStock || rows.has(p.id))
    .filter((p) => !t || [p.name, p.sku, attrLine(p), p.category].some((v) => v.toLowerCase().includes(t)))
    .map((p) => ({ p, r: rows.get(p.id) }))
    .sort((a, b) => (b.r?.weight ?? 0) - (a.r?.weight ?? 0));
  const open = openId ? pmap.get(openId) : undefined;

  return (
    <div className={`page items-page ${open ? 'with-drawer' : ''}`}>
      <aside className="card groups">
        <div className="groups-head">
          <h3>Группы ТМЦ</h3>
          <span className="muted small">по срезу учётной системы</span>
        </div>
        <button className={`grp ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>
          <i style={{ background: 'var(--accent)' }} />
          <span className="grow">Все группы</span>
          <b>{rows.size}</b>
        </button>
        {groups
          .filter((x) => x.n > 0)
          .map((x) => (
            <button key={x.g} className={`grp ${group === x.g ? 'active' : ''}`} onClick={() => setGroup(x.g)}>
              <i style={{ background: GROUPS[x.g].color }} />
              <span className="grow">
                {GROUPS[x.g].title}
                <em>{fmtTons(x.weight)}</em>
              </span>
              <b>{x.n}</b>
            </button>
          ))}
      </aside>
      <section className="card items-main">
        <header className="card-head">
          <div className="gsearch inline">
            <Icon name="search" size={16} />
            <input
              placeholder="Наименование, артикул, марка стали, RAL, чертёж…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} />
            <span>Только в наличии</span>
          </label>
        </header>
        <div className="table-wrap tall">
          <table className="table">
            <thead>
              <tr>
                <th>Наименование</th>
                <th className="num">Остаток</th>
                <th className="num">Вес</th>
                <th className="num">Ячеек</th>
                <th>Где</th>
                <th>Партии</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ p, r }) => (
                <tr key={p.id} className={openId === p.id ? 'active' : ''} onClick={() => st().openProduct(p.id)}>
                  <td>
                    <div className="item-name">
                      <i className="dot" style={{ background: GROUPS[p.group].color }} />
                      <span>
                        <b>{p.name}</b>
                        <span className="muted small">
                          {p.sku}
                          {attrLine(p) ? ` · ${attrLine(p)}` : ''}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="num nowrap">{r ? fmtQtyFull(p, r.qty) : '—'}</td>
                  <td className="num nowrap">{r ? fmtTons(r.weight) : '—'}</td>
                  <td className="num">{r?.cells.length ?? 0}</td>
                  <td className="small">{r?.rooms.join(', ')}</td>
                  <td className="small nowrap">
                    {r?.batches ? `${r.batches}` : '—'}
                    {r?.expired ? <span className="badge bad">просрочено {r.expired}</span> : null}
                    {r?.expiring ? <span className="badge warn">истекает {r.expiring}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <p className="muted pad">Ничего не найдено</p>}
        </div>
      </section>
      {open && <ProductDrawer p={open} row={rows.get(open.id)} />}
    </div>
  );
}
