import { useMemo, useState } from 'react';
import { useStore, useWarehouse } from '../store';
import type { CellType, MaterialGroup } from '../types';
import { useMonitor, useProductsMap, usePartyName } from '../lib/derived';
import { DAY, HIST_LABELS, fmtTons, movesByDay, weightByGroup } from '../lib/analytics';
import { CELL_TYPES, GROUPS } from '../lib/materials';
import { fillColor, loadColor } from '../lib/colors';
import { AreaLine, Columns, Donut, HBars, Histogram, Lines } from '../components/charts';
import { pct } from '../components/ui';

const PERIODS = [14, 30, 60];

/** Раздел «Аналитика»: заполнение во времени, по помещениям и типам ячеек, нагрузка стеллажей, обращаемость. */
export function AnalyticsPage() {
  const w = useWarehouse();
  const m = useMonitor();
  const products = useProductsMap();
  const party = usePartyName();
  const st = useStore.getState;
  const [days, setDays] = useState(30);

  const data = useMemo(() => {
    if (!m || !w) return null;
    const since = Date.now() - days * DAY;
    const history = (m.inv?.history ?? []).filter((h) => h.at >= since - DAY);
    const moves = movesByDay(m.inv?.events ?? [], days);
    const byGroup = weightByGroup(m.inv, products);
    const issues = new Map<string, number>();
    for (const e of m.inv?.events ?? [])
      if (e.type === 'issue' && e.at >= since && e.party) issues.set(e.party, (issues.get(e.party) ?? 0) + 1);
    const racks = w.racks
      .map((r) => {
        const cap = r.maxLoad ?? r.sections * r.tiers.reduce((s, t) => s + t.cells * t.maxLoad, 0);
        return { r, load: m.loads.get(r.id)?.total ?? 0, cap };
      })
      .filter((x) => x.cap > 0)
      .sort((a, b) => b.load / b.cap - a.load / a.cap);
    const abc = { A: 0, B: 0, C: 0 };
    for (const a of m.activity.values()) abc[a.abc]++;
    const idle = Object.entries(m.lastMove)
      .filter(([a]) => (m.usage.get(a)?.qty ?? 0) > 0 && m.idx.byAddress.has(a))
      .map(([a, t]) => ({ a, days: Math.floor((Date.now() - t) / DAY) }))
      .filter((x) => x.days > 90)
      .sort((x, y) => y.days - x.days);
    return { history, moves, byGroup, issues, racks, abc, idle };
  }, [m, w, products, days]);

  if (!m || !w || !data) return null;
  const s = m.stats.all;
  const types = Object.keys(s.byType) as CellType[];
  const groups = (Object.entries(data.byGroup) as [MaterialGroup, number][]).sort((a, b) => b[1] - a[1]);
  const top = groups.slice(0, 5);
  const rest = groups.slice(5).reduce((x, [, v]) => x + v, 0);
  const totalW = groups.reduce((x, [, v]) => x + v, 0) || 1;
  const moveTotals = data.moves.reduce((a, d) => ({ in: a.in + d.in, out: a.out + d.out, move: a.move + d.move }), {
    in: 0,
    out: 0,
    move: 0,
  });

  return (
    <div className="page analytics">
      <div className="page-head">
        <div>
          <h1>Аналитика размещения</h1>
          <p className="muted">{w.name} · заполнение, места, нагрузка и обращаемость ячеек по данным учётной системы</p>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p} className={days === p ? 'active' : ''} onClick={() => setDays(p)}>
              {p} дней
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h3>Заполнение во времени, %</h3>
            <span className="muted small">
              сейчас: ячейки {pct(s.cells ? s.occupied / s.cells : 0)} · места{' '}
              {pct(s.places ? s.usedPlaces / s.places : 0)}
            </span>
          </header>
          <Lines
            max={100}
            format={(v) => `${Math.round(v)}%`}
            series={[
              {
                label: 'Занятые ячейки',
                color: 'var(--series-1)',
                points: data.history.map((h) => ({ x: h.at, y: h.cells ? (h.occupied / h.cells) * 100 : 0 })),
              },
              {
                label: 'Занятые места',
                color: 'var(--series-2)',
                points: data.history.map((h) => ({ x: h.at, y: h.places ? (h.usedPlaces / h.places) * 100 : 0 })),
              },
            ]}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Груз на хранении, т</h3>
            <span className="muted small">сейчас {fmtTons(s.weight)}</span>
          </header>
          <AreaLine
            label="Вес, т"
            points={data.history.map((h) => ({ x: h.at, y: h.weight }))}
            format={(v) => `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т`}
          />
        </section>
      </div>

      <div className="grid-3">
        <section className="card">
          <header className="card-head">
            <h3>Заполнение по помещениям</h3>
          </header>
          <HBars
            items={w.rooms
              .filter((r) => m.stats.byRoom.has(r.id))
              .map((r) => {
                const x = m.stats.byRoom.get(r.id)!;
                return {
                  key: r.id,
                  label: r.name.split(' — ')[0],
                  sub: `${x.occupied}/${x.cells} яч.`,
                  value: x.fill,
                  display: pct(x.fill),
                  color: fillColor(x.fill),
                  onClick: () => {
                    st().setDashRoom(r.id);
                    st().setLevel('cells');
                    st().setSection('home');
                  },
                };
              })}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Типы ячеек: занято мест</h3>
          </header>
          <HBars
            items={types.map((t) => {
              const x = s.byType[t]!;
              const v = x.places ? x.used / x.places : x.cells ? x.occupied / x.cells : 0;
              return {
                key: t,
                label: CELL_TYPES[t].title,
                sub: x.places ? `${x.used}/${x.places} ${CELL_TYPES[t].placeUnit}` : `${x.occupied}/${x.cells} яч.`,
                value: v,
                display: pct(v),
                color: CELL_TYPES[t].color,
              };
            })}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Распределение заполнения ячеек</h3>
          </header>
          <Histogram
            values={s.hist}
            labels={HIST_LABELS}
            colors={['#cbd5e1', fillColor(0.12), fillColor(0.38), fillColor(0.62), fillColor(0.87), fillColor(1)]}
            height={190}
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h3>Нагрузка стеллажей</h3>
            <span className="muted small">вес груза к допустимой нагрузке стеллажа</span>
          </header>
          <HBars
            limit
            items={data.racks.slice(0, 12).map((x) => ({
              key: x.r.id,
              label: `Стеллаж ${x.r.code}`,
              sub: `${fmtTons(x.load)} из ${fmtTons(x.cap)}`,
              value: x.load / x.cap,
              display: pct(x.load / x.cap),
              color: loadColor(x.load / x.cap),
              onClick: () => {
                st().select({ kind: 'rack', id: x.r.id });
                st().setSection('cells');
              },
            }))}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Движения по ячейкам</h3>
            <span className="muted small">
              приход {moveTotals.in} · выдача {moveTotals.out} · перемещения {moveTotals.move}
            </span>
          </header>
          <Columns
            data={data.moves.map((d) => ({ x: d.day, values: [d.in, d.out, d.move] }))}
            series={['Приход', 'Выдача', 'Перемещения']}
          />
        </section>
      </div>

      <div className="grid-3">
        <section className="card">
          <header className="card-head">
            <h3>Обращаемость ячеек (ABC)</h3>
            <span className="muted small">
              A {data.abc.A} · B {data.abc.B} · C {data.abc.C}
            </span>
          </header>
          <HBars
            items={[...m.activity.values()].slice(0, 10).map((a, _i, arr) => ({
              key: a.address,
              label: a.address,
              sub: `класс ${a.abc}`,
              value: a.ops / (arr[0]?.ops || 1),
              display: `${a.ops}`,
              onClick: () => st().openCell(a.address),
            }))}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Выдача на кладовые</h3>
            <span className="muted small">операций за {days} дней</span>
          </header>
          <HBars
            items={[...data.issues.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([code, n], i, arr) => ({
                key: code,
                label: party(code),
                value: n / (arr[0]?.[1] || 1),
                display: `${n}`,
                color: `var(--series-${(i % 6) + 1})`,
              }))}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Структура хранения по весу</h3>
          </header>
          <Donut
            centerLabel="на хранении"
            centerValue={fmtTons(totalW * 1000)}
            items={[
              ...top.map(([g, v]) => ({
                label: GROUPS[g].title,
                value: v,
                display: `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т`,
              })),
              ...(rest > 0
                ? [
                    {
                      label: 'Прочие группы',
                      value: rest,
                      display: `${rest.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т`,
                    },
                  ]
                : []),
            ]}
          />
        </section>
      </div>

      <section className="card">
        <header className="card-head">
          <h3>Ячейки без движения больше 90 дней</h3>
          <button
            className="btn small"
            disabled={!data.idle.length}
            onClick={() => st().showCells(data.idle.map((x) => x.a))}
          >
            Показать на 3D ({data.idle.length})
          </button>
        </header>
        <div className="idle-grid">
          {data.idle.slice(0, 40).map((x) => {
            const u = m.usage.get(x.a);
            const pid = u ? Object.keys(u.byProduct)[0] : undefined;
            return (
              <button key={x.a} className="idle" onClick={() => st().openCell(x.a)}>
                <b className="mono">{x.a}</b>
                <span className="muted small">{pid ? products.get(pid)?.name : ''}</span>
                <em>{x.days} дн.</em>
              </button>
            );
          })}
          {!data.idle.length && <p className="muted">Все ячейки с грузом двигались за последние 90 дней.</p>}
        </div>
      </section>
    </div>
  );
}
