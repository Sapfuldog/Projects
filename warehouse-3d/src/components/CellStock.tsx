import { useMemo, useState, type ReactNode } from 'react';
import type { Cell } from '../types';
import type { Monitor } from '../lib/monitor';
import { stockLines, type StockLine } from '../lib/inventory';
import { fold, lineText } from '../lib/search';
import { CELL_TYPES, GROUPS, fmtQtyFull } from '../lib/materials';
import { LEVEL_COLOR } from '../lib/colors';
import { DAY, fmtTons } from '../lib/analytics';
import { Icon } from './icons';
import { pct } from './ui';

type Show = 'busy' | 'all' | 'free';

const SHOW: { value: Show; label: string }[] = [
  { value: 'busy', label: 'С содержимым' },
  { value: 'all', label: 'Все' },
  { value: 'free', label: 'Свободные' },
];

const PAGE = 200;

/** Количество: основная единица и пересчёт во вторую строку («12,48 т» / «1 395 м»). */
function Qty({ text }: { text: string }) {
  const [main, alt] = text.split(' · ');
  return (
    <span className="cs-qty">
      <b>{main}</b>
      {alt && <span>{alt}</span>}
    </span>
  );
}

/**
 * Регистр «Номенклатура в ячейках»: что лежит в каждой ячейке — ТМЦ, артикул, партия, плавка, срок годности,
 * количество и вес, пустая тара. Данные — срез учётной системы; щелчок по строке открывает карточку ячейки.
 */
export function CellStockTable({
  cells,
  m,
  q,
  onReset,
  selectedKey,
  onPick,
  title,
  extra,
}: {
  cells: Cell[];
  m: Monitor;
  /** Поисковый запрос: показываются только совпавшие строки */
  q: string;
  onReset: () => void;
  selectedKey?: string;
  onPick: (c: Cell) => void;
  title: string;
  extra?: ReactNode;
}) {
  const [show, setShow] = useState<Show>('busy');
  const [limit, setLimit] = useState(PAGE);
  const now = Date.now();

  const sorted = useMemo(
    () => [...cells].sort((a, b) => a.address.localeCompare(b.address, 'ru', { numeric: true })),
    [cells],
  );
  const byAddress = useMemo(() => new Map(sorted.map((c) => [c.address, c])), [sorted]);

  const lines = useMemo(() => {
    const filled = (a: string) => (m.fill.get(a) ?? 0) > 0;
    const all = stockLines(
      sorted.map((c) => c.address),
      m.usage,
      'add',
    );
    if (show === 'all') return all;
    if (show === 'free') return all.filter((l) => !l.productId && !l.tareTypeId && !filled(l.address));
    return all.filter((l) => l.productId || l.tareTypeId || filled(l.address));
  }, [sorted, m, show]);

  const texts = useMemo(() => lines.map((l) => lineText(l, m)), [lines, m]);
  const f = fold(q.trim());
  const shown = useMemo(() => (f ? lines.filter((_, i) => texts[i].includes(f)) : lines), [lines, texts, f]);

  // Итоги по показанным строкам
  const totals = useMemo(() => {
    let positions = 0;
    let weight = 0;
    const withContent = new Set<string>();
    for (const l of shown) {
      const p = l.productId ? m.pm.get(l.productId) : undefined;
      if (p) {
        positions++;
        weight += l.qty * p.weight;
      }
      if (l.productId || l.tareTypeId || (m.fill.get(l.address) ?? 0) > 0) withContent.add(l.address);
    }
    return { positions, weight, cells: new Set(shown.map((l) => l.address)).size, withContent: withContent.size };
  }, [shown, m]);

  // Строки по ячейкам, не больше limit строк
  const groups = useMemo(() => {
    const out: { cell: Cell; lines: StockLine[] }[] = [];
    let n = 0;
    for (const l of shown) {
      if (n >= limit) break;
      const last = out[out.length - 1];
      if (last && last.cell.address === l.address) last.lines.push(l);
      else {
        const cell = byAddress.get(l.address);
        if (!cell) continue;
        out.push({ cell, lines: [l] });
      }
      n++;
    }
    return { list: out, n };
  }, [shown, limit, byAddress]);

  return (
    <div className="cstock">
      <div className="cstock-head">
        <div className="cstock-title">
          <h3>{title}</h3>
          <span className="muted small">
            {f ? (
              <>
                Найдено по «<b>{q.trim()}</b>»: {totals.positions.toLocaleString('ru-RU')} поз. в{' '}
                {totals.cells.toLocaleString('ru-RU')} яч.
              </>
            ) : (
              <>
                {totals.positions.toLocaleString('ru-RU')} поз. · занято {totals.withContent.toLocaleString('ru-RU')} из{' '}
                {cells.length.toLocaleString('ru-RU')} яч.
              </>
            )}
            {totals.weight > 0 && ` · ${fmtTons(totals.weight)}`}
          </span>
        </div>
        <div className="cstock-tools">
          {extra}
          {f && (
            <button className="btn small" onClick={onReset}>
              <Icon name="close" size={13} /> Сбросить поиск
            </button>
          )}
          <div className="seg small">
            {SHOW.map((x) => (
              <button
                key={x.value}
                className={show === x.value ? 'active' : ''}
                onClick={() => {
                  setShow(x.value);
                  setLimit(PAGE);
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="cstock-wrap">
        <table className="table cstock-table">
          <thead>
            <tr>
              <th>{cells[0]?.virtual ? 'Место' : 'Ячейка'}</th>
              <th>Номенклатура</th>
              <th className="num">Количество</th>
              <th className="num">Вес</th>
            </tr>
          </thead>
          <tbody>
            {groups.list.map(({ cell, lines: ls }) => {
              const fill = m.fill.get(cell.address) ?? 0;
              const u = m.usage.get(cell.address);
              const lvl = m.worst.get(cell.address);
              const spec = CELL_TYPES[cell.cellType];
              const active = cell.key === selectedKey;
              return ls.map((l, i) => {
                const p = l.productId ? m.pm.get(l.productId) : undefined;
                const b = l.batchId ? m.inv?.batches[l.batchId] : undefined;
                const t = l.tareTypeId ? m.tm.get(l.tareTypeId) : undefined;
                const exp = b?.expiry;
                const expCls = exp ? (exp < now ? 'bad' : exp < now + 30 * DAY ? 'warn' : '') : '';
                const cls = [active ? 'active' : '', i === ls.length - 1 ? 'last' : ''].join(' ');
                return (
                  <tr key={`${cell.key}|${i}`} className={cls} onClick={() => onPick(cell)}>
                    {i === 0 && (
                      <td rowSpan={ls.length} className={`cs-cell ${cell.virtual ? 'virtual' : ''}`}>
                        <b className="mono">
                          {lvl && lvl !== 'info' && <i className="dot" style={{ background: LEVEL_COLOR[lvl] }} />}
                          {cell.address}
                        </b>
                        <span className="cs-sub">
                          {cell.virtual ? (
                            cell.note
                          ) : (
                            <>
                              <i className="dot" style={{ background: spec.color }} />
                              {spec.short}
                              {cell.blocked ? ' · блок' : ` · ${pct(fill)}`}
                              {cell.places > 0 && ` · ${Math.min(u?.places ?? 0, 999)}/${cell.places}`}
                            </>
                          )}
                        </span>
                      </td>
                    )}
                    <td className="cs-item">
                      {p ? (
                        <>
                          <span className="cs-name">
                            <i className="dot" style={{ background: GROUPS[p.group].color }} />
                            {p.name}
                          </span>
                          <span className="cs-sub">
                            {p.sku}
                            {b?.number && ` · партия ${b.number}`}
                            {b?.heat && ` · плавка ${b.heat}`}
                            {b?.order && ` · ${b.order}`}
                            {exp && (
                              <span className={`exp ${expCls}`}>
                                {' '}
                                · годен до {new Date(exp).toLocaleDateString('ru-RU')}
                              </span>
                            )}
                          </span>
                        </>
                      ) : t ? (
                        <>
                          <span className="cs-name">
                            <i className="dot" style={{ background: t.color ?? '#a16207' }} />
                            Пустая тара: {t.name}
                          </span>
                          <span className="cs-sub">
                            {t.code} · {t.returnable ? 'возвратная' : 'невозвратная'}
                          </span>
                        </>
                      ) : l.productId ? (
                        <span className="cs-name">{l.productId}</span>
                      ) : fill > 0 ? (
                        <span className="muted">Заполнена на {pct(fill)}, состав не передан</span>
                      ) : (
                        <span className="muted">{cell.blocked ? 'Заблокирована' : 'Свободна'}</span>
                      )}
                    </td>
                    <td className="num nowrap">{p ? <Qty text={fmtQtyFull(p, l.qty)} /> : t ? `${l.qty} шт` : ''}</td>
                    <td className="num nowrap muted">
                      {p && p.weight > 0 ? fmtTons(l.qty * p.weight) : t ? fmtTons(l.qty * t.weight) : ''}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
        {!shown.length && (
          <p className="muted pad">
            {f ? `Ничего не найдено по «${q.trim()}»` : show === 'free' ? 'Свободных ячеек нет' : 'Ячейки пусты'}
          </p>
        )}
      </div>
      {shown.length > groups.n && (
        <button className="btn small cstock-more" onClick={() => setLimit((x) => x + PAGE)}>
          Показать ещё · осталось {(shown.length - groups.n).toLocaleString('ru-RU')} строк
        </button>
      )}
    </div>
  );
}
