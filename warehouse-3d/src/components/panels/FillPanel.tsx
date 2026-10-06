import { useMemo } from 'react';
import { useStore, useWarehouse } from '../../store';
import { useCells, useFills, useStats } from '../../lib/derived';
import { cellViewpoint } from '../../lib/rack';
import { COLOR_BLOCKED, COLOR_OVERLOAD, fillColor, hashColor, type FillStats } from '../../lib/fill';
import type { Cell, ColorMode } from '../../types';
import { Bar, Hint, Section, Stat, pct } from '../ui';

const MODES: { value: ColorMode; label: string }[] = [
  { value: 'fill', label: 'Заполненность' },
  { value: 'load', label: 'Нагрузка (вес / Г)' },
  { value: 'sku', label: 'Товар (SKU)' },
  { value: 'zone', label: 'Зона' },
];

function StatRow({ title, s, onClick, color }: { title: string; s: FillStats; onClick?: () => void; color?: string }) {
  return (
    <button className="stat-row" onClick={onClick}>
      <span className="grow">
        {color && <span className="swatch" style={{ background: color }} />}
        {title}
      </span>
      <span className="stat-row-bar">
        <Bar value={s.avgFill} color={fillColor(s.avgFill)} />
      </span>
      <span className="small mono">{pct(s.avgFill)}</span>
      <span className="small muted" title="занято / доступно">
        {s.occupied}/{s.available}
      </span>
    </button>
  );
}

export function FillPanel() {
  const w = useWarehouse();
  const { cells } = useCells();
  const fills = useFills();
  const stats = useStats();
  const colorMode = useStore((s) => s.colorMode);
  const tierFilter = useStore((s) => s.tierFilter);
  const search = useStore((s) => s.search);
  const sync = useStore((s) => (s.currentId ? s.sync[s.currentId] : undefined));
  const st = useStore.getState;

  const maxTier = useMemo(() => Math.max(0, ...(w?.racks.map((r) => r.tiers.length) ?? [0])), [w]);
  const results = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (q.length < 2) return [];
    const out: Cell[] = [];
    for (const c of cells) {
      const f = fills[c.address];
      if (
        c.address.toUpperCase().includes(q) ||
        f?.sku?.toUpperCase().includes(q) ||
        f?.name?.toUpperCase().includes(q)
      ) {
        out.push(c);
        if (out.length >= 100) break;
      }
    }
    return out;
  }, [search, cells, fills]);

  const skuLegend = useMemo(() => {
    if (colorMode !== 'sku') return [];
    const m = new Map<string, number>();
    Object.values(fills).forEach((f) => f.sku && f.fill > 0 && m.set(f.sku, (m.get(f.sku) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [colorMode, fills]);

  if (!w) return null;
  const a = stats.all;
  const pick = (c: Cell) => {
    st().select({ kind: 'cell', id: c.key, rackId: c.rackId });
    st().focusOn(c.cx, c.cy, c.cz, cellViewpoint(w, c));
  };

  return (
    <>
      <Section title="Заполнение склада">
        {!Object.keys(fills).length && (
          <div className="note">
            Нет данных о заполнении.{' '}
            <button className="link" onClick={() => st().setStep('connect')}>
              Настройте подключение
            </button>{' '}
            или включите демо-симулятор.
          </div>
        )}
        <div className="stats">
          <Stat label="средняя заполненность" value={pct(a.avgFill)} />
          <Stat
            label="занято ячеек"
            value={a.occupied.toLocaleString('ru-RU')}
            sub={`из ${a.available.toLocaleString('ru-RU')}`}
          />
          <Stat
            label="свободно"
            value={a.free.toLocaleString('ru-RU')}
            sub={a.available ? pct(a.free / a.available) : ''}
          />
          <Stat label="заблокировано" value={a.blocked} />
          <Stat
            label="вес, т"
            value={(a.weight / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
            sub={`Г: ${(a.capacity / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} т`}
          />
          <Stat
            label="перегруз (вес > Г)"
            value={<span style={{ color: a.overloaded ? COLOR_OVERLOAD : undefined }}>{a.overloaded}</span>}
          />
        </div>
        {sync && !sync.error && (
          <div className="muted small">
            Обновлено: {new Date(sync.at).toLocaleTimeString('ru-RU')} · {sync.source}
          </div>
        )}
        {sync?.error && <div className="warn">⚠ {sync.error}</div>}
      </Section>

      <Section title="Отображение">
        <div className="seg modes">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={colorMode === m.value ? 'active' : ''}
              onClick={() => st().setColorMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(colorMode === 'fill' || colorMode === 'load') && (
          <div className="legend">
            <div className="legend-grad" />
            <div className="legend-labels">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <div className="legend-items">
              <span>
                <i style={{ background: COLOR_BLOCKED }} /> заблокирована
              </span>
              {colorMode === 'load' && (
                <span>
                  <i style={{ background: COLOR_OVERLOAD }} /> перегруз
                </span>
              )}
              <span>
                <i className="empty" /> пустая
              </span>
            </div>
          </div>
        )}
        {colorMode === 'sku' && (
          <div className="legend-items">
            {skuLegend.map(([sku, n]) => (
              <span key={sku}>
                <i style={{ background: hashColor(sku) }} /> {sku} ({n})
              </span>
            ))}
          </div>
        )}
        <div className="tier-filter">
          <span className="muted small">Ярус:</span>
          <button className={tierFilter === null ? 'active' : ''} onClick={() => st().setTierFilter(null)}>
            все
          </button>
          {Array.from({ length: maxTier }, (_, i) => (
            <button key={i} className={tierFilter === i + 1 ? 'active' : ''} onClick={() => st().setTierFilter(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
        <Hint>Высота цветного блока в ячейке — доля заполнения. Наведите курсор на ячейку, чтобы увидеть адрес.</Hint>
      </Section>

      <Section title="Поиск ячейки или товара">
        <input
          className="search"
          placeholder="Адрес, SKU или наименование…"
          value={search}
          onChange={(e) => st().setSearch(e.target.value)}
        />
        {results.length > 0 && (
          <div className="list compact results">
            {results.map((c) => {
              const f = fills[c.address];
              return (
                <button key={c.key} className="list-item" onClick={() => pick(c)}>
                  <span className="mono">{c.address}</span>
                  <span className="grow muted small">{f?.name ?? f?.sku ?? (c.blocked ? 'заблокирована' : '')}</span>
                  <span className="small">{f ? pct(f.fill) : '—'}</span>
                </button>
              );
            })}
          </div>
        )}
        {search.trim().length >= 2 && !results.length && <p className="muted small">Ничего не найдено</p>}
      </Section>

      <Section title="По помещениям и зонам">
        {w.rooms.map((r) => {
          const rs = stats.byRoom.get(r.id);
          if (!rs) return null;
          return (
            <div key={r.id} className="group">
              <StatRow title={r.name} s={rs} color={r.color} onClick={() => st().select({ kind: 'room', id: r.id })} />
              {w.zones
                .filter((z) => z.roomId === r.id)
                .map((z) => {
                  const zs = stats.byZone.get(z.id);
                  if (!zs) return null;
                  return (
                    <div key={z.id} className="nested">
                      <StatRow title={z.name} s={zs} color={z.color} />
                      <div className="nested">
                        {w.racks
                          .filter((k) => k.zoneId === z.id)
                          .map((k) => {
                            const ks = stats.byRack.get(k.id);
                            return ks ? (
                              <StatRow
                                key={k.id}
                                title={`Стеллаж ${k.code}`}
                                s={ks}
                                onClick={() => st().select({ kind: 'rack', id: k.id })}
                              />
                            ) : null;
                          })}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </Section>
    </>
  );
}
