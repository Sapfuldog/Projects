import { useMemo } from 'react';
import { useStore } from '../store';
import { useConsumers, useMonitor, useProductsMap, useTareTypes, usePartyName } from '../lib/derived';
import { tareBalances, type TareBalance } from '../lib/inventory';
import { TARE_KINDS } from '../lib/materials';
import { SUPPLIERS } from '../lib/catalog';
import { timeAgo } from '../lib/analytics';
import { Kpi } from './HomePage';
import { Icon } from '../components/icons';

const EMPTY: TareBalance = { underGoods: 0, empty: 0, atConsumers: 0, atSuppliers: 0, parties: {} };
const total = (b: TareBalance) => b.underGoods + b.empty + b.atConsumers + b.atSuppliers;

function Cylinder({ color, empty }: { color: string; empty?: boolean }) {
  return (
    <svg width="22" height="46" viewBox="0 0 22 46" aria-hidden className="cyl-icon">
      <rect
        x="3"
        y="7"
        width="16"
        height="37"
        rx="7"
        fill={color}
        opacity={empty ? 0.45 : 1}
        stroke="rgba(0,0,0,.25)"
      />
      <rect x="7" y="1" width="8" height="7" rx="2" fill="#475569" opacity={empty ? 0.4 : 1} />
      <rect x="3" y="15" width="16" height="3" fill="rgba(255,255,255,.35)" />
    </svg>
  );
}

/** Раздел «Тара»: поддоны, барабаны, кассеты и газовые баллоны — на складе, у кладовых, у поставщиков. */
export function TarePage() {
  const m = useMonitor();
  const products = useProductsMap();
  const tareTypes = useTareTypes();
  const consumers = useConsumers();
  const party = usePartyName();
  const st = useStore.getState;
  const balances = useMemo(() => tareBalances(m?.inv, products), [m, products]);
  if (!m) return null;
  const bal = (id: string) => balances.get(id) ?? EMPTY;
  const cylinders = tareTypes.filter((t) => t.kind === 'cylinder');
  const others = tareTypes.filter((t) => t.kind !== 'cylinder');
  const sum = (list: typeof tareTypes, f: (b: TareBalance) => number) => list.reduce((s, t) => s + f(bal(t.id)), 0);
  const pallets = tareTypes.filter((t) => t.kind === 'pallet');
  const emptyCells = Object.entries(m.inv?.tare ?? {})
    .filter(([place]) => !place.startsWith('@'))
    .flatMap(([place, items]) => Object.entries(items).map(([tid, n]) => ({ place, tid, n })))
    .sort((a, b) => b.n - a.n);
  const parties = [...consumers.map((c) => `@${c.code}`), ...Object.keys(SUPPLIERS)];
  const lastTare = (m.inv?.events ?? [])
    .filter((e) => e.type === 'tare')
    .slice(-8)
    .reverse();

  return (
    <div className="page tare-page">
      <div className="page-head">
        <div>
          <h1>Тара</h1>
          <p className="muted">
            Возвратная тара по срезу учётной системы: под товаром, пустая на складе, у кладовых производства и у
            поставщиков
          </p>
        </div>
      </div>
      <div className="kpis">
        <Kpi
          icon="cylinder"
          label="Газовые баллоны, всего"
          value={sum(cylinders, total)}
          sub={`полных на складе ${sum(cylinders, (b) => b.underGoods)} · пустых ${sum(cylinders, (b) => b.empty)}`}
        />
        <Kpi
          icon="issue"
          label="Баллоны у кладовых"
          value={sum(cylinders, (b) => b.atConsumers)}
          sub="в цехах, на постах сварки и резки"
          tone="info"
        />
        <Kpi
          icon="truck"
          label="Баллоны на заправке"
          value={sum(cylinders, (b) => b.atSuppliers)}
          sub="у поставщика газов"
          tone="warn"
        />
        <Kpi
          icon="pallet"
          label="Поддоны"
          value={sum(pallets, total)}
          sub={`под товаром ${sum(pallets, (b) => b.underGoods)} · пустых ${sum(pallets, (b) => b.empty)} · у кладовых ${sum(pallets, (b) => b.atConsumers)}`}
        />
        <Kpi
          icon="refresh"
          label="Барабаны и кассеты"
          value={sum(
            tareTypes.filter((t) => t.kind === 'reel' || t.kind === 'cassette'),
            total,
          )}
          sub={`у поставщиков ${sum(
            tareTypes.filter((t) => t.kind === 'reel' || t.kind === 'cassette'),
            (b) => b.atSuppliers,
          )}`}
        />
      </div>

      <section className="card pad">
        <header className="card-head">
          <h3>Газовые баллоны по видам газа</h3>
          <span className="muted small">Цвет — окраска баллона по виду газа</span>
        </header>
        <div className="cylcards">
          {cylinders.map((t) => {
            const b = bal(t.id);
            const all = total(b) || 1;
            return (
              <div key={t.id} className="cylcard">
                <div className="cylcard-head">
                  <Cylinder color={t.color ?? '#94a3b8'} />
                  <div className="grow">
                    <b>{t.name.replace('Баллон ', '')}</b>
                    <div className="muted small">{t.code}</div>
                  </div>
                  <span className="cyl-total">{total(b)}</span>
                </div>
                <div className="stack">
                  <i
                    style={{ width: `${(b.underGoods / all) * 100}%`, background: t.color }}
                    title="Полные на складе"
                  />
                  <i
                    style={{ width: `${(b.empty / all) * 100}%`, background: t.color, opacity: 0.4 }}
                    title="Пустые на складе"
                  />
                  <i style={{ width: `${(b.atConsumers / all) * 100}%` }} className="cons" title="У кладовых" />
                  <i style={{ width: `${(b.atSuppliers / all) * 100}%` }} className="supp" title="На заправке" />
                </div>
                <div className="cyl-rows">
                  <span>
                    <em>Полные на складе</em>
                    <b>{b.underGoods}</b>
                  </span>
                  <span>
                    <em>Пустые на складе</em>
                    <b>{b.empty}</b>
                  </span>
                  <span>
                    <em>У кладовых</em>
                    <b>{b.atConsumers}</b>
                  </span>
                  <span>
                    <em>На заправке</em>
                    <b>{b.atSuppliers}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h3>Тара у кладовых и поставщиков</h3>
          </header>
          <div className="table-wrap tall">
            <table className="table">
              <thead>
                <tr>
                  <th>Где</th>
                  {cylinders.map((t) => (
                    <th key={t.id} className="num" title={t.name}>
                      <span className="th-cyl" style={{ background: t.color }} />
                    </th>
                  ))}
                  <th className="num">Поддоны</th>
                  <th className="num">Прочая</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((code) => {
                  const items = m.inv?.tare[code] ?? {};
                  const pal = pallets.reduce((s, t) => s + (items[t.id] ?? 0), 0);
                  const other = others.filter((t) => t.kind !== 'pallet').reduce((s, t) => s + (items[t.id] ?? 0), 0);
                  if (!Object.keys(items).length) return null;
                  return (
                    <tr key={code}>
                      <td>
                        <b>{party(code)}</b>
                      </td>
                      {cylinders.map((t) => (
                        <td key={t.id} className="num">
                          {items[t.id] || ''}
                        </td>
                      ))}
                      <td className="num">{pal || ''}</td>
                      <td className="num">{other || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Виды тары</h3>
          </header>
          <div className="table-wrap tall">
            <table className="table">
              <thead>
                <tr>
                  <th>Тара</th>
                  <th className="num">Под товаром</th>
                  <th className="num">Пустая</th>
                  <th className="num">У кладовых</th>
                  <th className="num">У поставщ.</th>
                </tr>
              </thead>
              <tbody>
                {tareTypes.map((t) => {
                  const b = bal(t.id);
                  if (!total(b)) return null;
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="item-name">
                          <i className="dot" style={{ background: t.color ?? '#a16207' }} />
                          <span>
                            <b>{t.name}</b>
                            <span className="muted small">
                              {TARE_KINDS[t.kind]} · {t.returnable ? 'возвратная' : 'разовая'}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="num">{b.underGoods}</td>
                      <td className="num">{b.empty}</td>
                      <td className="num">{b.atConsumers}</td>
                      <td className="num">{b.atSuppliers}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h3>Где лежит пустая тара</h3>
            <button className="btn small" onClick={() => st().showCells(emptyCells.map((x) => x.place))}>
              <Icon name="cube" size={15} /> Показать на 3D
            </button>
          </header>
          <div className="list compact">
            {emptyCells.slice(0, 30).map((x) => {
              const t = tareTypes.find((y) => y.id === x.tid);
              return (
                <button key={`${x.place}${x.tid}`} className="list-item" onClick={() => st().openCell(x.place)}>
                  <i className="dot" style={{ background: t?.color ?? '#a16207' }} />
                  <b className="mono">{x.place}</b>
                  <span className="grow muted small">{t?.name}</span>
                  <b>{x.n} шт</b>
                </button>
              );
            })}
          </div>
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Движение тары</h3>
          </header>
          <div className="feed">
            {lastTare.map((e) => (
              <div key={e.id} className="feed-item op-tare">
                <i />
                <span className="grow">
                  <b>
                    {tareTypes.find((t) => t.id === e.tareTypeId)?.name ?? e.tareTypeId}: {e.qty} шт
                  </b>
                  <span>
                    {party(e.from)} → {party(e.to)}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </span>
                <span className="muted small">{timeAgo(e.at)}</span>
              </div>
            ))}
            {!lastTare.length && <div className="muted small">Движений тары пока нет</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
