import type { Cell, Rack } from '../types';
import type { Monitor } from '../lib/monitor';
import { CELL_TYPES } from '../lib/materials';
import { RACK_SPEC, tierBases } from '../lib/rack';
import { LEVEL_COLOR, ageColor, fillColor, loadColor } from '../lib/colors';
import { DAY } from '../lib/analytics';
import { pct } from './ui';

export type MapMode = 'fill' | 'control' | 'load' | 'age' | 'type';

export const MAP_MODES: { value: MapMode; label: string }[] = [
  { value: 'fill', label: 'Заполнение' },
  { value: 'control', label: 'Контроль' },
  { value: 'load', label: 'Нагрузка' },
  { value: 'age', label: 'Движение' },
  { value: 'type', label: 'Тип ячейки' },
];

/** Цвет ячейки на карте стеллажа. */
export function cellTone(c: Cell, m: Monitor, mode: MapMode): string {
  const u = m.usage.get(c.address);
  const f = m.fill.get(c.address) ?? 0;
  switch (mode) {
    case 'control':
      return m.worst.has(c.address) ? LEVEL_COLOR[m.worst.get(c.address)!] : f > 0 ? LEVEL_COLOR.ok : 'transparent';
    case 'load':
      return u && c.maxLoad ? loadColor(u.weight / c.maxLoad) : 'transparent';
    case 'age': {
      const t = m.lastMove[c.address];
      return f > 0 && t ? ageColor((Date.now() - t) / DAY) : 'transparent';
    }
    case 'type':
      return CELL_TYPES[c.cellType].color;
    default:
      return f > 0 ? fillColor(f) : 'transparent';
  }
}

/**
 * Фасад стеллажа: секции по горизонтали, ярусы по вертикали (верхний ярус сверху).
 * Для напольного и консольного хранения ячейки в секции — ряды/стороны.
 */
export function RackFacade({
  rack,
  cells,
  m,
  mode,
  selectedKey,
  onPick,
  compact = false,
  highlight,
}: {
  rack: Rack;
  cells: Cell[];
  m: Monitor;
  mode: MapMode;
  selectedKey?: string;
  onPick?: (c: Cell) => void;
  compact?: boolean;
  highlight?: Set<string>;
}) {
  const byKey = new Map(cells.map((c) => [`${c.section}.${c.tier}.${c.pos}`, c]));
  const bases = tierBases(rack);
  const across = RACK_SPEC[rack.kind].across;
  const tiers = rack.tiers.map((t, i) => ({ t, i })).reverse();
  const load = m.loads.get(rack.id);
  return (
    <div className={`facade2 ${compact ? 'compact' : ''} kind-${rack.kind}`}>
      {!compact && (
        <div className="f2-row f2-head">
          <span className="f2-tier" />
          {Array.from({ length: rack.sections }, (_, s) => {
            const v = load?.sections.get(s + 1) ?? 0;
            const r = rack.sectionLoad ? v / rack.sectionLoad : 0;
            return (
              <span
                key={s}
                className="f2-sec"
                title={
                  rack.sectionLoad ? `Секция ${s + 1}: ${Math.round(v)} из ${rack.sectionLoad} кг` : `Секция ${s + 1}`
                }
              >
                {s + 1}
                {rack.sectionLoad && (
                  <i className="f2-secload">
                    <u style={{ width: `${Math.min(100, r * 100)}%`, background: loadColor(r) }} />
                  </i>
                )}
              </span>
            );
          })}
        </div>
      )}
      {tiers.map(({ t, i }) => (
        <div
          key={i}
          className="f2-row"
          style={compact ? undefined : { minHeight: Math.max(30, Math.min(64, t.height / 28)) }}
        >
          {!compact && (
            <span
              className="f2-tier"
              title={`Ярус ${i + 1}: низ +${(bases[i] / 1000).toFixed(2)} м, высота ${t.height} мм`}
            >
              <b>{i + 1}</b>
              <em>+{(bases[i] / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</em>
            </span>
          )}
          {Array.from({ length: rack.sections }, (_, s) => (
            <span key={s} className={`f2-sec-cells ${across ? 'across' : ''}`}>
              {Array.from({ length: t.cells }, (_, p) => {
                const c = byKey.get(`${s + 1}.${i + 1}.${p + 1}`);
                if (!c) return <i key={p} className="f2-cell none" />;
                const f = m.fill.get(c.address) ?? 0;
                const u = m.usage.get(c.address);
                const tone = cellTone(c, m, mode);
                const lvl = m.worst.get(c.address);
                const cls = [
                  'f2-cell',
                  c.blocked ? 'blocked' : '',
                  c.reservedFor ? 'reserved' : '',
                  selectedKey === c.key ? 'sel' : '',
                  lvl ? `lv-${lvl}` : '',
                  highlight?.has(c.address) ? 'hl' : '',
                ].join(' ');
                return (
                  <button
                    key={p}
                    className={cls}
                    onClick={onPick ? () => onPick(c) : undefined}
                    title={`${c.address} · ${CELL_TYPES[c.cellType].title} · ${pct(f)}${c.places ? ` · мест ${Math.min(u?.places ?? 0, 999)}/${c.places}` : ''}${c.blocked ? ' · заблокирована' : ''}`}
                  >
                    <i
                      className="f2-fill"
                      style={{
                        height: mode === 'fill' ? `${Math.max(f > 0 ? 12 : 0, f * 100)}%` : '100%',
                        background: tone,
                      }}
                    />
                    {!compact && (
                      <span className="f2-label">
                        {c.blocked
                          ? '✕'
                          : c.places > 1
                            ? `${Math.min(u?.places ?? 0, 99)}/${c.places}`
                            : c.places === 0 && f > 0
                              ? pct(f)
                              : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </span>
          ))}
        </div>
      ))}
      {!compact && <div className="f2-floor" />}
    </div>
  );
}
