import type { Cell, Product, Rack } from '../types';
import { useStore, useWarehouse } from '../store';
import { useConsumers, useMonitor, useProductsMap, useTareMap, usePartyName } from '../lib/derived';
import { CELL_TYPES, GROUPS, STORAGE_UNITS, fmtQty, fmtQtyFull } from '../lib/materials';
import { cellVolume, splitKey, OP_TITLE } from '../lib/inventory';
import { VIOLATIONS, LEVEL_ORDER } from '../lib/control';
import { DAY, timeAgo } from '../lib/analytics';
import { LEVEL_COLOR, fillColor, loadColor } from '../lib/colors';
import { RACK_SPEC, rackCellCount, rackContext, rackDepth, rackHeight, rackLength, rackWarnings } from '../lib/rack';
import { Icon } from './icons';
import { pct } from './ui';

const kg = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} кг`;
const t = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т` : kg(v));
const date = (v?: number) => (v ? new Date(v).toLocaleDateString('ru-RU') : '—');

export function Meter({ value, label, color, sub }: { value: number; label?: string; color?: string; sub?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="meter">
      {label && (
        <div className="meter-head">
          <span>{label}</span>
          <b>{sub ?? pct(value)}</b>
        </div>
      )}
      <div className="meter-bar">
        <i style={{ width: `${Math.round(v * 100)}%`, background: color ?? fillColor(v) }} />
        {value > 1 && <em style={{ left: `${100 / value}%` }} />}
      </div>
    </div>
  );
}

function expiryClass(expiry: number | undefined, now: number) {
  if (!expiry) return '';
  if (expiry < now) return 'bad';
  if (expiry < now + 30 * DAY) return 'warn';
  return '';
}

/** Карточка ячейки: где находится, тип и размеры, заполнение, нагрузка, содержимое с партиями, тара, нарушения, движения. */
export function CellDetails({ cell, compact = false }: { cell: Cell; compact?: boolean }) {
  const w = useWarehouse();
  const m = useMonitor();
  const products = useProductsMap();
  const tare = useTareMap();
  const consumers = useConsumers();
  const party = usePartyName();
  const st = useStore.getState;
  if (!w || !m) return null;
  const u = m.usage.get(cell.address);
  const fill = m.fill.get(cell.address) ?? 0;
  const rack = w.racks.find((r) => r.id === cell.rackId);
  const ctx = rack ? rackContext(w, rack) : undefined;
  const spec = CELL_TYPES[cell.cellType];
  const violations = [...(m.violationsAt.get(cell.address) ?? [])].sort(
    (a, b) => LEVEL_ORDER[VIOLATIONS[a.kind].level] - LEVEL_ORDER[VIOLATIONS[b.kind].level],
  );
  const reserved = cell.reservedFor ? consumers.find((c) => c.id === cell.reservedFor) : undefined;
  const act = m.activity.get(cell.address);
  const lm = m.lastMove[cell.address];
  const now = Date.now();
  const events = (m.inv?.events ?? [])
    .filter((e) => e.from === cell.address || e.to === cell.address)
    .slice(-6)
    .reverse();
  const items = Object.entries(u?.items ?? {}).map(([k, q]) => {
    const [pid, bid] = splitKey(k);
    return { k, p: products.get(pid), pid, b: bid ? m.inv?.batches[bid] : undefined, q };
  });
  const mainProduct = items[0]?.p;
  const place = cell.virtual ? w.places.find((p) => p.code === cell.address) : undefined;

  return (
    <div className={`cellcard ${compact ? 'compact' : ''}`}>
      <div className="cc-head">
        <span className="cc-type" style={{ background: spec.color }} title={spec.title}>
          {spec.short}
        </span>
        <div className="grow">
          <div className="cc-address mono">{cell.address}</div>
          <div className="muted small">
            {cell.virtual
              ? (place?.name ?? cell.note)
              : `${ctx?.room?.name ?? ''} › ${ctx?.zone?.name ?? ''} › ${rack?.code ?? ''} · секция ${cell.section} · ярус ${cell.tier} · место ${cell.pos}`}
          </div>
        </div>
      </div>
      <div className="cc-badges">
        {cell.blocked && <span className="badge bad">Заблокирована{cell.note ? `: ${cell.note}` : ''}</span>}
        {reserved && <span className="badge info">Закреплена за {reserved.code}</span>}
        {cell.hazard && <span className="badge warn">Зона ЛВЖ</span>}
        {ctx?.mezz && <span className="badge">Мезонин, уровень {(rack?.deck ?? 1) + 1}</span>}
        {act && (
          <span className={`badge abc-${act.abc}`}>
            Класс {act.abc} · {act.ops} обращ. за 30 дн.
          </span>
        )}
      </div>
      {!cell.virtual && (
        <>
          <Meter
            value={fill}
            label="Заполнение"
            sub={`${pct(fill)}${cell.places > 0 ? ` · ${Math.min(u?.places ?? 0, 999)} из ${cell.places} ${spec.placeUnit}` : ''}`}
          />
          {cell.maxLoad > 0 && (
            <Meter
              value={(u?.weight ?? 0) / cell.maxLoad}
              label="Нагрузка"
              color={loadColor((u?.weight ?? 0) / cell.maxLoad)}
              sub={`${kg(u?.weight ?? 0)} из ${kg(cell.maxLoad)}`}
            />
          )}
          <div className="cc-props">
            <span>
              <em>Ш × Г × В</em>
              <b>
                {cell.width} × {cell.depth} × {cell.height} мм
              </b>
            </span>
            <span>
              <em>Объём</em>
              <b>{Math.round(cellVolume(cell)).toLocaleString('ru-RU')} л</b>
            </span>
            <span>
              <em>Отметка низа</em>
              <b>+{cell.bottom.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} м</b>
            </span>
            <span>
              <em>Принимает</em>
              <b>{spec.accepts.length > 3 ? 'любые' : spec.accepts.map((x) => STORAGE_UNITS[x].short).join(', ')}</b>
            </span>
            <span>
              <em>Движение</em>
              <b>{lm ? timeAgo(lm) : '—'}</b>
            </span>
          </div>
        </>
      )}

      {violations.length > 0 && (
        <div className="cc-violations">
          {violations.map((v, i) => (
            <div key={i} className={`viol ${VIOLATIONS[v.kind].level}`}>
              <i style={{ background: LEVEL_COLOR[VIOLATIONS[v.kind].level] }} />
              <span className="grow">
                <b>{VIOLATIONS[v.kind].title}</b>
                <span>{v.text}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="cc-section">
        <div className="cc-title">Содержимое {items.length > 0 && <span className="muted">· {items.length}</span>}</div>
        {!items.length && !Object.keys(u?.tare ?? {}).length && <div className="muted small">Ячейка свободна</div>}
        {items.slice(0, compact ? 5 : 50).map(({ k, p, pid, b, q }) => (
          <div key={k} className="cc-item">
            <i className="dot" style={{ background: p ? GROUPS[p.group].color : '#94a3b8' }} />
            <div className="grow">
              <div className="cc-item-name">
                <button className="link" onClick={() => st().openProduct(pid)}>
                  {p?.name ?? pid}
                </button>
              </div>
              <div className="muted small">
                {p?.sku}
                {b?.number && ` · партия ${b.number}`}
                {b?.heat && ` · плавка ${b.heat}`}
                {b?.cert && !compact && ` · ${b.cert}`}
                {b?.order && ` · ${b.order}`}
                {b?.expiry && <span className={`exp ${expiryClass(b.expiry, now)}`}> · годен до {date(b.expiry)}</span>}
              </div>
            </div>
            <div className="cc-qty">
              <b>{p ? fmtQtyFull(p, q) : q}</b>
              {p && p.weight > 0 && <span className="muted small">{t(q * p.weight)}</span>}
            </div>
          </div>
        ))}
        {compact && items.length > 5 && <div className="muted small">ещё {items.length - 5}…</div>}
        {Object.entries(u?.tare ?? {}).map(([tid, n]) => {
          const tt = tare.get(tid);
          return (
            <div key={tid} className="cc-item">
              <i className="dot" style={{ background: tt?.color ?? '#a16207' }} />
              <div className="grow">
                <div className="cc-item-name">Пустая тара: {tt?.name ?? tid}</div>
                <div className="muted small">{tt?.returnable ? 'возвратная' : 'невозвратная'}</div>
              </div>
              <div className="cc-qty">
                <b>{n} шт</b>
              </div>
            </div>
          );
        })}
      </div>

      {!compact && events.length > 0 && (
        <div className="cc-section">
          <div className="cc-title">Последние движения</div>
          {events.map((e) => {
            const p = e.productId ? products.get(e.productId) : undefined;
            return (
              <div key={e.id} className="cc-event">
                <span className={`op op-${e.type}`}>{OP_TITLE[e.type]}</span>
                <span className="grow small">
                  {p?.name ?? (e.tareTypeId ? tare.get(e.tareTypeId)?.name : '')} ·{' '}
                  {p ? fmtQty(Math.abs(e.qty), p.unit) : `${e.qty} шт`}
                  {e.party && ` · ${party(e.party)}`}
                  {e.from && e.from !== cell.address && !e.from.startsWith('@') && ` · из ${e.from}`}
                  {e.to && e.to !== cell.address && !e.to.startsWith('@') && ` · в ${e.to}`}
                </span>
                <span className="muted small">{timeAgo(e.at)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="row wrap cc-actions">
        {compact ? (
          <button className="btn small primary" onClick={() => st().openCell(cell.address)}>
            <Icon name="cells" size={15} /> Открыть в «Ячейках»
          </button>
        ) : (
          !cell.virtual && (
            <button className="btn small primary" onClick={() => st().showCell(cell.address)}>
              <Icon name="cube" size={15} /> Показать на 3D
            </button>
          )
        )}
        {mainProduct && (
          <button
            className="btn small"
            title="Подсветить все ячейки с этим ТМЦ"
            onClick={() => {
              const list = [...m.usage.entries()].filter(([, x]) => x.byProduct[mainProduct.id]).map(([a]) => a);
              st().setHighlight(list);
              st().toast(`${mainProduct.name}: ${list.length} мест хранения`, 'info');
            }}
          >
            <Icon name="target" size={15} /> Где ещё лежит
          </button>
        )}
      </div>
    </div>
  );
}

/** Сводка по стеллажу: габариты, ячейки, заполнение, нагрузка на стеллаж и секции. */
export function RackSummary({ rack, compact = false }: { rack: Rack; compact?: boolean }) {
  const w = useWarehouse();
  const m = useMonitor();
  if (!w || !m) return null;
  const s = m.stats.byRack.get(rack.id);
  const load = m.loads.get(rack.id);
  const ctx = rackContext(w, rack);
  const warnings = rackWarnings(w, rack);
  const capacity = rack.maxLoad ?? rack.sections * rack.tiers.reduce((sum, x) => sum + x.cells * x.maxLoad, 0);
  const viol = m.violations.filter((v) => v.rackId === rack.id);
  return (
    <div className="racksum">
      <div className="cc-head">
        <span className="cc-type rack">{rack.code}</span>
        <div className="grow">
          <b>
            {RACK_SPEC[rack.kind].title} стеллаж {rack.code}
          </b>
          <div className="muted small">
            {ctx.room?.name} › {ctx.zone?.name}
            {ctx.mezz ? ` › ${ctx.mezz.name}, уровень ${(rack.deck ?? 1) + 1}` : ''}
          </div>
        </div>
      </div>
      <div className="cc-props">
        <span>
          <em>Д × Г × В</em>
          <b>
            {(rackLength(rack) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ×{' '}
            {(rackDepth(rack) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ×{' '}
            {(rackHeight(rack) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м
          </b>
        </span>
        <span>
          <em>Секций × ярусов</em>
          <b>
            {rack.sections} × {rack.tiers.length}
          </b>
        </span>
        <span>
          <em>Ячеек</em>
          <b>{rackCellCount(rack)}</b>
        </span>
        <span>
          <em>Основание</em>
          <b>+{ctx.base.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м</b>
        </span>
      </div>
      {s && <Meter value={s.fill} label="Заполнение" sub={`${pct(s.fill)} · занято ${s.occupied} из ${s.cells}`} />}
      <Meter
        value={(load?.total ?? 0) / (capacity || 1)}
        label="Нагрузка на стеллаж"
        color={loadColor((load?.total ?? 0) / (capacity || 1))}
        sub={`${t(load?.total ?? 0)} из ${t(capacity)}`}
      />
      {rack.sectionLoad && !compact && (
        <div className="sections-load">
          <div className="cc-title">Нагрузка на секции (допустимо {t(rack.sectionLoad)})</div>
          <div className="sl-bars">
            {Array.from({ length: rack.sections }, (_, i) => {
              const v = load?.sections.get(i + 1) ?? 0;
              const r = v / rack.sectionLoad!;
              return (
                <span key={i} title={`Секция ${i + 1}: ${t(v)}`}>
                  <i style={{ height: `${Math.min(100, r * 100)}%`, background: loadColor(r) }} />
                  <em>{i + 1}</em>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {(warnings.length > 0 || viol.length > 0) && (
        <div className="cc-violations">
          {viol.slice(0, compact ? 3 : 20).map((v, i) => (
            <div key={i} className={`viol ${VIOLATIONS[v.kind].level}`}>
              <i style={{ background: LEVEL_COLOR[VIOLATIONS[v.kind].level] }} />
              <span className="grow">
                <b>{VIOLATIONS[v.kind].title}</b>
                <span>
                  {v.address} · {v.text}
                </span>
              </span>
            </div>
          ))}
          {warnings.map((x) => (
            <div key={x} className="viol warning">
              <i style={{ background: LEVEL_COLOR.warning }} />
              <span className="grow">{x}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const groupDot = (p?: Product) => (p ? GROUPS[p.group].color : '#94a3b8');
