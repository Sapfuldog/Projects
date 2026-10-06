import { useMemo, useState } from 'react';
import { useStore, useWarehouse } from '../store';
import { useInventory, useProducts, useStats } from '../lib/derived';
import { categoryShares, dailySeries, fmtCompact, fmtInt, fmtMoney, kpis, turnover, change } from '../lib/analytics';
import { fillColor } from '../lib/fill';
import { AreaLine, Columns, Donut } from '../components/charts';
import { Delta, KpiTile } from './HomePage';
import { Bar, pct } from '../components/ui';

const PERIODS = [7, 14, 30];

export function AnalyticsPage() {
  const w = useWarehouse();
  const inv = useInventory();
  const products = useProducts();
  const stats = useStats();
  const st = useStore.getState;
  const [days, setDays] = useState(30);
  const [abcFilter, setAbc] = useState<'all' | 'A' | 'B' | 'C'>('all');

  const k = useMemo(() => kpis(inv, products), [inv, products]);
  const series = useMemo(() => dailySeries(inv, days), [inv, days]);
  const cats = useMemo(() => categoryShares(inv, products), [inv, products]);
  const top = useMemo(() => turnover(inv, products, days), [inv, products, days]);
  const revenue = top.reduce((s, t) => s + t.value, 0);
  const maxValue = Math.max(1, ...top.map((t) => t.value));
  const occ = stats.all.available ? stats.all.occupied / stats.all.available : 0;
  const prevStock = series[0]?.stock ?? 0;
  const stockNow = series[series.length - 1]?.stock ?? 0;

  return (
    <div className="page analytics">
      <div className="page-head">
        <div>
          <h1>Аналитика</h1>
          <div className="muted">{w?.name}</div>
        </div>
        <div className="chips">
          {PERIODS.map((d) => (
            <button key={d} className={`chip ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
              {d} дней
            </button>
          ))}
        </div>
      </div>

      <div className="kpis">
        <KpiTile
          icon="boxes"
          label="Стоимость запасов"
          value={fmtMoney(k.stockValue)}
          sub={`${fmtCompact(k.totalQty)} ед. · ${k.skuCount} SKU`}
        />
        <KpiTile
          icon="chart"
          label={`Выручка отгрузок (${days} дн.)`}
          value={fmtMoney(revenue)}
          sub={`${fmtCompact(top.reduce((s, t) => s + t.shipped, 0))} ед.`}
        />
        <KpiTile icon="warehouse" label="Занято ячеек" value={pct(occ)} progress={occ} />
        <KpiTile
          icon="pulse"
          label={`Изменение остатка (${days} дн.)`}
          value={fmtCompact(stockNow - prevStock)}
          sub="ед."
          delta={<Delta v={change(stockNow, prevStock)} />}
        />
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <div className="card-head">
            <h3>Остатки по категориям</h3>
            <span className="muted small">по стоимости</span>
          </div>
          <Donut
            items={cats.map((c) => ({ label: c.category, value: c.value, display: fmtMoney(c.value) }))}
            centerLabel="запасы"
            centerValue={fmtCompact(k.totalQty)}
          />
        </div>
        <div className="card chart-card wide">
          <div className="card-head">
            <h3>Динамика остатков</h3>
            <span className="muted small">ед. на конец дня</span>
          </div>
          <AreaLine
            points={series.map((p) => ({ x: p.day, y: p.stock }))}
            label="Остаток"
            format={(v) => `${fmtInt(v)} ед.`}
          />
        </div>
        <div className="card chart-card wide">
          <div className="card-head">
            <h3>Поступления и отгрузки</h3>
            <span className="muted small">ед. в день</span>
          </div>
          <Columns
            data={series.map((p) => ({ x: p.day, values: [p.receipts, p.shipments] }))}
            series={['Поступления', 'Отгрузки']}
          />
        </div>
        <div className="card chart-card">
          <div className="card-head">
            <h3>Загрузка зон</h3>
            <span className="muted small">средняя заполненность</span>
          </div>
          <div className="zone-meters">
            {w?.zones.map((z) => {
              const s = stats.byZone.get(z.id);
              if (!s || !s.available) return null;
              return (
                <button
                  key={z.id}
                  className="zone-meter"
                  onClick={() => (st().select({ kind: 'zone', id: z.id }), st().setSection('home'))}
                >
                  <div className="row between">
                    <span>{z.name}</span>
                    <b>{pct(s.avgFill)}</b>
                  </div>
                  <Bar value={s.avgFill} color={fillColor(s.avgFill)} />
                  <span className="muted small">
                    занято {fmtInt(s.occupied)} из {fmtInt(s.available)} яч.
                    {s.overloaded ? ` · перегруз ${s.overloaded}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Товары по обороту и ABC-анализ</h3>
          <div className="chips">
            {(['all', 'A', 'B', 'C'] as const).map((c) => (
              <button key={c} className={`chip ${abcFilter === c ? 'active' : ''}`} onClick={() => setAbc(c)}>
                {c === 'all' ? 'Все' : `Класс ${c}`}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap tall">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Товар</th>
                <th className="num">Отгружено</th>
                <th>Выручка</th>
                <th className="num">Остаток</th>
                <th className="num">Запас, дн.</th>
                <th>ABC</th>
              </tr>
            </thead>
            <tbody>
              {top
                .filter((t) => abcFilter === 'all' || t.abc === abcFilter)
                .map((t, i) => {
                  const perDay = t.shipped / days;
                  const cover = perDay > 0 ? Math.round(t.stock / perDay) : null;
                  return (
                    <tr key={t.product.id} onClick={() => (st().setSection('stock'), st().openProduct(t.product.id))}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <b>{t.product.name}</b> <span className="muted small mono">{t.product.sku}</span>
                      </td>
                      <td className="num">{fmtInt(t.shipped)}</td>
                      <td>
                        <div className="norm">
                          <div className="meter">
                            <i style={{ width: `${(t.value / maxValue) * 100}%`, background: 'var(--series-1)' }} />
                          </div>
                          <span className="small">{fmtMoney(t.value)}</span>
                        </div>
                      </td>
                      <td className="num">{fmtInt(t.stock)}</td>
                      <td className={`num ${cover !== null && cover < 7 ? 'neg' : ''}`}>{cover ?? '—'}</td>
                      <td>
                        <span className={`abc abc-${t.abc}`}>{t.abc}</span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          A — товары, дающие 80% выручки, B — следующие 15%, C — остальные 5%. «Запас, дн.» — на сколько дней хватит
          остатка при текущем темпе отгрузок.
        </p>
      </div>
    </div>
  );
}
