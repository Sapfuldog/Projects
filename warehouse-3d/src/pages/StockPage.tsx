import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useInventory, useProducts, useProductTotals } from '../lib/derived';
import { STATUS_TITLE, OP_TITLE, stockStatus, type StockStatus } from '../lib/inventory';
import { fmtInt, fmtMoney, timeAgo } from '../lib/analytics';
import { parseCSV, toCSV } from '../lib/fill';
import { uid } from '../lib/id';
import type { Product } from '../types';
import { Icon } from '../components/icons';
import { Num, Text, download } from '../components/ui';
import { OP_ICON } from './HomePage';

type StatusFilter = 'all' | StockStatus;

const FILTERS: { v: StatusFilter; label: string }[] = [
  { v: 'all', label: 'Все' },
  { v: 'ok', label: 'В наличии' },
  { v: 'low', label: 'Низкий остаток' },
  { v: 'out', label: 'Нет в наличии' },
];

function ProductDrawer({ p }: { p: Product }) {
  const inv = useInventory();
  const totals = useProductTotals();
  const st = useStore.getState;
  const up = (patch: Partial<Product>) => st().updateProduct(p.id, patch);
  const qty = totals.get(p.id)?.qty ?? 0;
  const locations = useMemo(
    () =>
      Object.entries(inv?.stock ?? {})
        .filter(([, items]) => items[p.id])
        .map(([address, items]) => ({ address, qty: items[p.id] }))
        .sort((a, b) => a.address.localeCompare(b.address)),
    [inv, p.id],
  );
  const history = useMemo(
    () =>
      (inv?.events ?? [])
        .filter((e) => e.productId === p.id)
        .slice(-30)
        .reverse(),
    [inv, p.id],
  );
  const status = stockStatus(p, qty);
  return (
    <aside className="drawer card">
      <div className="drawer-head">
        <div>
          <h2>{p.name}</h2>
          <div className="muted small">
            {p.sku} · {p.category}
          </div>
        </div>
        <button className="icon-btn" onClick={() => st().openProduct(null)} title="Закрыть">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="drawer-stats">
        <div>
          <span>Остаток</span>
          <b>
            {fmtInt(qty)} {p.unit}
          </b>
        </div>
        <div>
          <span>Ячеек</span>
          <b>{locations.length}</b>
        </div>
        <div>
          <span>Стоимость</span>
          <b>{fmtMoney(qty * p.price)}</b>
        </div>
        <div>
          <span>Статус</span>
          <b className={`status ${status}`}>{STATUS_TITLE[status]}</b>
        </div>
      </div>
      <div className="row wrap">
        <button
          className="btn small primary"
          onClick={() => {
            st().setProductFilter(p.id);
            st().setHighlight([]);
            st().setSection('home');
            if (locations[0]) st().showCell(locations[0].address);
          }}
          disabled={!locations.length}
        >
          <Icon name="cube" size={14} /> Показать на складе
        </button>
        <button
          className="btn small"
          onClick={() => {
            const d = st().createDoc('receipt', 'Новый поставщик', [
              { productId: p.id, qty: Math.max(1, p.max - qty) },
            ]);
            st().setSection('inbound');
            if (d) st().openDoc(d.id);
          }}
        >
          <Icon name="inbound" size={14} /> Заказать поставку
        </button>
      </div>

      <h4>Ячейки хранения</h4>
      {!locations.length && <p className="muted small">Товара нет на складе.</p>}
      <div className="loc-list">
        {locations.map((l) => (
          <button key={l.address} className="loc" onClick={() => st().showCell(l.address)} title="Показать на 3D">
            <span className="mono">{l.address}</span>
            <b>{fmtInt(l.qty)}</b>
          </button>
        ))}
      </div>

      <h4>Карточка товара</h4>
      <div className="grid2">
        <Text label="Наименование" value={p.name} onChange={(v) => up({ name: v })} />
        <Text label="Артикул (SKU)" value={p.sku} onChange={(v) => up({ sku: v })} />
        <Text label="Категория" value={p.category} onChange={(v) => up({ category: v })} />
        <Text label="Ед. изм." value={p.unit} onChange={(v) => up({ unit: v })} />
        <Num label="Вес единицы" unit="кг" value={p.weight} min={0} step={0.1} onChange={(v) => up({ weight: v })} />
        <Num
          label="Объём единицы"
          unit="л"
          value={p.volume}
          min={0.01}
          step={0.1}
          onChange={(v) => up({ volume: v })}
        />
        <Num label="Мин. остаток" value={p.min} min={0} onChange={(v) => up({ min: v })} />
        <Num label="Норма (100%)" value={p.max} min={0} onChange={(v) => up({ max: v })} />
        <Num label="Цена" unit="₽" value={p.price} min={0} onChange={(v) => up({ price: v })} />
        <Text label="Штрихкод" value={p.barcode ?? ''} onChange={(v) => up({ barcode: v || undefined })} />
      </div>

      <h4>История движения</h4>
      <div className="history">
        {!history.length && <p className="muted small">Движений нет.</p>}
        {history.map((e) => (
          <div key={e.id} className="history-row">
            <span className={`event-icon ${e.type}`}>
              <Icon name={OP_ICON[e.type]} size={14} />
            </span>
            <span className="grow">
              {OP_TITLE[e.type]}{' '}
              <span className="mono small">
                {e.from ?? ''}
                {e.from && e.to ? ' → ' : ''}
                {e.to ?? ''}
              </span>
            </span>
            <b
              className={
                e.type === 'shipment' || (e.type === 'count' && e.qty < 0) ? 'neg' : e.type === 'move' ? '' : 'pos'
              }
            >
              {e.type === 'shipment' ? '−' : e.type === 'move' ? '' : e.qty > 0 ? '+' : ''}
              {fmtInt(e.type === 'count' ? e.qty : e.qty)}
            </b>
            <span className="muted small">{timeAgo(e.at)}</span>
          </div>
        ))}
      </div>
      <button
        className="btn small danger"
        disabled={qty > 0}
        title={qty > 0 ? 'Нельзя удалить товар с остатком' : ''}
        onClick={() => {
          st().ask(`Удалить товар «${p.name}» из каталога?`, () => {
            st().deleteProduct(p.id);
            st().openProduct(null);
          });
        }}
      >
        Удалить товар
      </button>
    </aside>
  );
}

export function StockPage() {
  const products = useProducts();
  const totals = useProductTotals();
  const openId = useStore((s) => s.openProductId);
  const st = useStore.getState;
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      products.map((p) => {
        const t = totals.get(p.id);
        const qty = t?.qty ?? 0;
        return { p, qty, cells: t?.cells ?? 0, status: stockStatus(p, qty) };
      }),
    [products, totals],
  );
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: rows.length, ok: 0, low: 0, out: 0 };
    rows.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);
  const list = rows
    .filter((r) => filter === 'all' || r.status === filter)
    .filter((r) => !cat || r.p.category === cat)
    .filter((r) => {
      const t = q.trim().toUpperCase();
      return !t || [r.p.name, r.p.sku, r.p.barcode ?? ''].some((v) => v.toUpperCase().includes(t));
    })
    .sort((a, b) => b.qty * b.p.price - a.qty * a.p.price);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const value = rows.reduce((s, r) => s + r.qty * r.p.price, 0);
  const open = products.find((p) => p.id === openId);

  const addProduct = () => {
    const p: Product = {
      id: uid('p'),
      sku: `SKU-${products.length + 1}`,
      name: 'Новый товар',
      category: categories[0] ?? 'Прочее',
      unit: 'шт',
      weight: 1,
      volume: 5,
      min: 10,
      max: 100,
      price: 1000,
    };
    st().addProduct(p);
    st().openProduct(p.id);
  };

  const exportCSV = () =>
    download(
      'остатки.csv',
      toCSV(
        ['sku', 'name', 'category', 'unit', 'weight', 'volume', 'min', 'max', 'price', 'barcode', 'qty'],
        rows.map((r) => [
          r.p.sku,
          r.p.name,
          r.p.category,
          r.p.unit,
          r.p.weight,
          r.p.volume,
          r.p.min,
          r.p.max,
          r.p.price,
          r.p.barcode,
          r.qty,
        ]),
      ),
      'text/csv;charset=utf-8',
    );

  const importCSV = async (f: File) => {
    const data = parseCSV(await f.text());
    const n = (v: string | undefined, d: number) =>
      v && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : d;
    const list: Product[] = data
      .filter((r) => r.sku && r.name)
      .map((r) => ({
        id: uid('p'),
        sku: r.sku,
        name: r.name,
        category: r.category || 'Прочее',
        unit: r.unit || 'шт',
        weight: n(r.weight, 1),
        volume: n(r.volume, 5),
        min: n(r.min, 0),
        max: n(r.max, 100),
        price: n(r.price, 0),
        barcode: r.barcode || undefined,
      }));
    st().importProducts(list);
    st().toast(`Импортировано товаров: ${list.length}`);
  };

  return (
    <div className={`page stock ${open ? 'with-drawer' : ''}`}>
      <div className="stock-main">
        <div className="page-head">
          <div>
            <h1>Остатки</h1>
            <div className="muted">
              {rows.length} SKU · {fmtInt(totalQty)} ед. · {fmtMoney(value)}
            </div>
          </div>
          <div className="row wrap">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> Импорт CSV
            </button>
            <button className="btn" onClick={exportCSV}>
              <Icon name="download" size={16} /> Экспорт
            </button>
            <button className="btn primary" onClick={addProduct}>
              <Icon name="plus" size={16} /> Товар
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCSV(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              placeholder="Поиск по товарам, артикулу, штрихкоду…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="chips">
            {FILTERS.map((f) => (
              <button key={f.v} className={`chip ${filter === f.v ? 'active' : ''}`} onClick={() => setFilter(f.v)}>
                {f.label} <span className="chip-n">{counts[f.v]}</span>
              </button>
            ))}
          </div>
          <select className="input auto" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Все категории</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="card table-card">
          <table className="table stock-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Категория</th>
                <th className="num">Остаток</th>
                <th className="num">Ячеек</th>
                <th>От нормы</th>
                <th>Статус</th>
                <th className="num">Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ p, qty, cells, status }) => {
                const ratio = p.max ? Math.min(1, qty / p.max) : 0;
                return (
                  <tr key={p.id} className={openId === p.id ? 'active' : ''} onClick={() => st().openProduct(p.id)}>
                    <td>
                      <div className="prod">
                        <span className="stock-icon">
                          <Icon name="boxes" size={16} />
                        </span>
                        <span>
                          <b>{p.name}</b>
                          <span className="muted small mono">{p.sku}</span>
                        </span>
                      </div>
                    </td>
                    <td className="muted">{p.category}</td>
                    <td className="num">
                      <b>{fmtInt(qty)}</b> <span className="muted small">{p.unit}</span>
                    </td>
                    <td className="num">{cells}</td>
                    <td>
                      <div className="norm">
                        <div className="meter">
                          <i className={status} style={{ width: `${Math.round(ratio * 100)}%` }} />
                        </div>
                        <span className="small">{Math.round((p.max ? qty / p.max : 0) * 100)}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status ${status}`}>{STATUS_TITLE[status]}</span>
                    </td>
                    <td className="num">{fmtMoney(qty * p.price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && <p className="muted pad">Ничего не найдено.</p>}
        </div>
        <div className="stock-cards">
          {list.map(({ p, qty, status }) => (
            <button key={p.id} className="stock-row card" onClick={() => st().openProduct(p.id)}>
              <span className="stock-icon">
                <Icon name="boxes" size={18} />
              </span>
              <span className="grow">
                <b>{p.name}</b>
                <span className="muted small">{p.sku}</span>
              </span>
              <span className="right">
                <b>
                  {fmtInt(qty)} {p.unit}
                </b>
                <span className={`stock-pct ${status}`}>{Math.round((p.max ? qty / p.max : 0) * 100)}%</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {open && <ProductDrawer key={open.id} p={open} />}
    </div>
  );
}
