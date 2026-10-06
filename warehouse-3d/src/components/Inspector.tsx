import { useState } from 'react';
import { useStore, useWarehouse } from '../store';
import { useCells, useFills, useInventory, useProductsMap, useStats } from '../lib/derived';
import { fmt, polygonArea } from '../lib/geometry';
import { cellViewpoint, rackCellCount, rackContext, rackHeight, rackLength } from '../lib/rack';
import { COLOR_OVERLOAD, fillColor } from '../lib/fill';
import { ZONE_TYPES } from '../lib/demo';
import { EQUIPMENT } from '../lib/equipment';
import { cellUsage, suggestPlacement } from '../lib/inventory';
import type { Cell } from '../types';
import { Bar, pct } from './ui';
import { Icon } from './icons';

/** Перемещение и инвентаризация прямо из карточки ячейки. */
function CellOps({ c }: { c: Cell }) {
  const inv = useInventory();
  const pm = useProductsMap();
  const { cells } = useCells();
  const st = useStore.getState;
  const items = Object.entries(inv?.stock[c.address] ?? {});
  const [mode, setMode] = useState<'move' | 'count' | null>(null);
  const [pid, setPid] = useState(items[0]?.[0] ?? '');
  const [qty, setQty] = useState(items[0]?.[1] ?? 0);
  const [to, setTo] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(items));
  if (!items.length) return null;

  const suggest = () => {
    const p = pm.get(pid);
    if (!p || !inv) return;
    const usage = cellUsage(inv.stock, pm);
    const { plan } = suggestPlacement(
      cells.filter((x) => x.address !== c.address),
      usage,
      p,
      qty,
    );
    if (plan[0]) setTo(plan[0].address);
    else st().toast('Свободной ячейки не найдено', 'error');
  };
  const doMove = () => {
    const have = inv?.stock[c.address]?.[pid] ?? 0;
    if (!cells.some((x) => x.address === to)) return st().toast(`Ячейка ${to} не найдена`, 'error');
    if (qty <= 0 || qty > have) return st().toast('Неверное количество', 'error');
    st().runOps([{ type: 'move', productId: pid, qty, from: c.address, to }]);
    st().toast(`Перемещено ${qty} ${pm.get(pid)?.unit ?? 'шт'}: ${c.address} → ${to}`);
    setMode(null);
  };
  const doCount = () => {
    const ops = Object.entries(counts)
      .map(([p, actual]) => ({ p, delta: actual - (inv?.stock[c.address]?.[p] ?? 0) }))
      .filter((x) => x.delta !== 0)
      .map((x) => ({ type: 'count' as const, productId: x.p, qty: x.delta, to: c.address }));
    st().runOps(ops);
    st().toast(
      ops.length
        ? `Инвентаризация ${c.address}: расхождений ${ops.length}`
        : `Инвентаризация ${c.address}: без расхождений`,
    );
    setMode(null);
  };

  return (
    <div className="cell-ops">
      {!mode && (
        <div className="row wrap">
          <button className="btn small" onClick={() => setMode('move')}>
            <Icon name="move" size={14} /> Переместить
          </button>
          <button className="btn small" onClick={() => setMode('count')}>
            <Icon name="count" size={14} /> Инвентаризация
          </button>
        </div>
      )}
      {mode === 'move' && (
        <div className="ops-form">
          <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
            {items.map(([p, q]) => (
              <option key={p} value={p}>
                {pm.get(p)?.name ?? p} ({q})
              </option>
            ))}
          </select>
          <div className="row">
            <input
              className="input"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              title="Количество"
            />
            <input
              className="input mono"
              placeholder="Куда (адрес)"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
            />
          </div>
          <div className="row wrap">
            <button className="btn small" onClick={suggest}>
              Подобрать ячейку
            </button>
            <button className="btn small primary" onClick={doMove} disabled={!to}>
              Переместить
            </button>
            <button className="btn small" onClick={() => setMode(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {mode === 'count' && (
        <div className="ops-form">
          {items.map(([p, q]) => (
            <label key={p} className="row between">
              <span className="small">
                {pm.get(p)?.name} <span className="muted">(учёт {q})</span>
              </span>
              <input
                className="input narrow"
                type="number"
                min={0}
                value={counts[p] ?? 0}
                onChange={(e) => setCounts({ ...counts, [p]: Math.max(0, Number(e.target.value)) })}
              />
            </label>
          ))}
          <div className="row wrap">
            <button className="btn small primary" onClick={doCount}>
              Провести
            </button>
            <button className="btn small" onClick={() => setMode(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="row between">
    <span>{k}</span>
    <b>{v}</b>
  </div>
);

export function Inspector() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const { byKey } = useCells();
  const fills = useFills();
  const stats = useStats();
  const inv = useInventory();
  const pm = useProductsMap();
  const st = useStore.getState;
  if (!w || !selection) return null;

  let body: React.ReactNode = null;
  let title = '';

  if (selection.kind === 'cell') {
    const c = byKey.get(selection.id);
    if (!c) return null;
    const rack = w.racks.find((r) => r.id === c.rackId);
    const { room, zone } = rack ? rackContext(w, rack) : {};
    const f = fills[c.address];
    const over = f?.weight !== undefined && c.maxLoad > 0 && f.weight > c.maxLoad;
    const internal = w.connection.type === 'internal';
    const items = internal ? Object.entries(inv?.stock[c.address] ?? {}) : [];
    title = c.address;
    body = (
      <>
        <div className="muted small">
          {room?.name} › {zone?.name} › стеллаж {rack?.code} › секция {c.section}, ярус {c.tier}, место {c.pos}
        </div>
        <div className="dims">
          <div>
            <span>Д</span>
            <b>{c.length}</b>
          </div>
          <div>
            <span>Ш</span>
            <b>{c.width}</b>
          </div>
          <div>
            <span>В</span>
            <b>{c.height}</b>
          </div>
          <div>
            <span>Г</span>
            <b>{c.maxLoad}</b> кг
          </div>
        </div>
        {c.blocked && <div className="warn">Ячейка заблокирована{c.note ? `: ${c.note}` : ''}</div>}
        {!c.blocked && c.note && <div className="muted small">✎ {c.note}</div>}
        {f ? (
          <div className="insp-fill">
            <Row k="Заполнение" v={pct(f.fill)} />
            <Bar value={f.fill} color={fillColor(f.fill)} />
            {f.weight !== undefined && (
              <Row
                k="Вес / Г"
                v={
                  <span style={{ color: over ? COLOR_OVERLOAD : undefined }}>
                    {f.weight} / {c.maxLoad} кг {over ? '— перегруз!' : ''}
                  </span>
                }
              />
            )}
            {!items.length && (f.name || f.sku) && (
              <Row k="Товар" v={[f.sku, f.name !== f.sku ? f.name : undefined].filter(Boolean).join(' · ')} />
            )}
          </div>
        ) : (
          !c.blocked && <div className="muted small">Ячейка пустая</div>
        )}
        {items.length > 0 && (
          <div className="cell-items">
            {items.map(([pid, q]) => {
              const p = pm.get(pid);
              return (
                <button
                  key={pid}
                  className="cell-item"
                  onClick={() => {
                    st().setSection('stock');
                    st().openProduct(pid);
                  }}
                >
                  <span className="grow">
                    {p?.name ?? pid}
                    <span className="muted small"> {p?.sku}</span>
                  </span>
                  <b>
                    {q.toLocaleString('ru-RU')} {p?.unit}
                  </b>
                </button>
              );
            })}
          </div>
        )}
        <div className="row wrap">
          <button className="btn small" onClick={() => st().focusOn(c.cx, c.cy, c.cz, cellViewpoint(w, c))}>
            <Icon name="target" size={14} /> Показать
          </button>
          <button className="btn small" onClick={() => st().setSection('warehouse', 'cells')}>
            Параметры
          </button>
        </div>
        {internal && !c.blocked && <CellOps key={c.key + (items.length ? 'i' : '')} c={c} />}
      </>
    );
  } else if (selection.kind === 'rack') {
    const r = w.racks.find((x) => x.id === selection.id);
    if (!r) return null;
    const { zone } = rackContext(w, r);
    const s = stats.byRack.get(r.id);
    title = `Стеллаж ${r.code}`;
    body = (
      <>
        <div className="muted small">{zone?.name}</div>
        <Row k="Габарит" v={`${fmt(rackLength(r) / 1000)} × ${fmt(r.depth / 1000)} × ${fmt(rackHeight(r) / 1000)} м`} />
        <Row k="Секций × ярусов" v={`${r.sections} × ${r.tiers.length}`} />
        <Row k="Ячеек" v={rackCellCount(r)} />
        {s && s.withData > 0 && (
          <>
            <Row k="Заполнение" v={`${pct(s.avgFill)} · занято ${s.occupied}/${s.available}`} />
            <Bar value={s.avgFill} color={fillColor(s.avgFill)} />
          </>
        )}
        <div className="row wrap">
          <button className="btn small" onClick={() => st().setSection('warehouse', 'racks')}>
            Настроить
          </button>
          <button className="btn small" onClick={() => st().setSection('warehouse', 'cells')}>
            Ячейки
          </button>
        </div>
      </>
    );
  } else if (selection.kind === 'room') {
    const r = w.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    const s = stats.byRoom.get(r.id);
    title = r.name;
    body = (
      <>
        <Row k="Площадь" v={`${fmt(polygonArea(r.points))} м²`} />
        <Row k="Высота" v={`${r.height} м`} />
        <Row k="Зон" v={w.zones.filter((z) => z.roomId === r.id).length} />
        {s && s.available > 0 && <Row k="Заполнение" v={pct(s.avgFill)} />}
      </>
    );
  } else if (selection.kind === 'zone') {
    const z = w.zones.find((x) => x.id === selection.id);
    if (!z) return null;
    const s = stats.byZone.get(z.id);
    title = z.name;
    body = (
      <>
        <div className="muted small">
          {ZONE_TYPES[z.type]} · {z.code}
        </div>
        <Row k="Площадь" v={`${fmt(polygonArea(z.points))} м²`} />
        <Row k="Высота размещения" v={`${z.height} м`} />
        <Row k="Стеллажей" v={w.racks.filter((r) => r.zoneId === z.id).length} />
        {s && s.available > 0 && (
          <>
            <Row k="Свободно ячеек" v={`${s.free.toLocaleString('ru-RU')} / ${s.available.toLocaleString('ru-RU')}`} />
            <Row k="Загрузка" v={pct(s.avgFill)} />
            <Bar value={s.avgFill} color={fillColor(s.avgFill)} />
            <button
              className="btn small"
              onClick={() => {
                st().setZoneFilter(z.id);
                st().select(null);
              }}
            >
              Показать только эту зону
            </button>
          </>
        )}
      </>
    );
  } else if (selection.kind === 'equipment') {
    const e = w.equipment.find((x) => x.id === selection.id);
    if (!e) return null;
    const spec = EQUIPMENT[e.type];
    title = e.name;
    body = (
      <>
        <div className="muted small">{spec.title}</div>
        <Row k="Размер" v={`${fmt(e.length)} × ${fmt(e.width)} × ${fmt(e.height)} м`} />
        {(e.type === 'dock' || e.type === 'forklift' || e.type === 'gate') && (
          <label className="check">
            <input
              type="checkbox"
              checked={!!e.active}
              onChange={(ev) => st().updateEquipment(e.id, { active: ev.target.checked })}
            />
            <span>
              {e.type === 'dock' ? 'Под погрузкой (занята)' : e.type === 'gate' ? 'Ворота открыты' : 'В работе'}
            </span>
          </label>
        )}
        <div className="row wrap">
          <button
            className="btn small"
            onClick={() =>
              st().setSection(
                'warehouse',
                spec.group === 'other' ? 'other' : spec.group === 'building' ? 'rooms' : 'equipment',
              )
            }
          >
            Настроить
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              st().deleteEquipment(e.id);
              st().select(null);
            }}
          >
            Удалить
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="inspector">
      <div className="inspector-head">
        <b className={selection.kind === 'cell' ? 'mono' : undefined}>{title}</b>
        <button className="icon-btn small" onClick={() => st().select(null)} title="Закрыть">
          ×
        </button>
      </div>
      {body}
    </div>
  );
}
