import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useCells, useInventory, useProducts, useProductsMap, useProductTotals } from '../lib/derived';
import { planDoc } from '../lib/inventory';
import { fmtInt, fmtMoney, timeAgo } from '../lib/analytics';
import type { Doc, DocKind, DocLine, DocStatus } from '../types';
import { Icon } from '../components/icons';

const STATUS: Record<DocStatus, string> = {
  new: 'Новый',
  progress: 'В работе',
  done: 'Выполнен',
  cancelled: 'Отменён',
};
type Tab = 'all' | DocStatus;

function DocForm({ kind, onDone }: { kind: DocKind; onDone: (d?: Doc) => void }) {
  const products = useProducts();
  const totals = useProductTotals();
  const inv = useInventory();
  const st = useStore.getState;
  const partners = useMemo(
    () => [...new Set((inv?.docs ?? []).filter((d) => d.kind === kind).map((d) => d.partner))],
    [inv, kind],
  );
  const [partner, setPartner] = useState(partners[0] ?? '');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DocLine[]>([{ productId: products[0]?.id ?? '', qty: 10 }]);
  const set = (i: number, patch: Partial<DocLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = partner.trim() && lines.length && lines.every((l) => l.productId && l.qty > 0);
  return (
    <div className="card doc-detail">
      <div className="drawer-head">
        <h2>{kind === 'receipt' ? 'Новая поставка' : 'Новый заказ'}</h2>
        <button className="icon-btn" onClick={() => onDone()}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <label className="field">
        <span className="field-label">{kind === 'receipt' ? 'Поставщик' : 'Покупатель'}</span>
        <input className="input" list="partners" value={partner} onChange={(e) => setPartner(e.target.value)} />
        <datalist id="partners">
          {partners.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <h4>Позиции</h4>
      <div className="lines">
        {lines.map((l, i) => {
          const avail = totals.get(l.productId)?.qty ?? 0;
          return (
            <div key={i} className="line-row">
              <select className="input" value={l.productId} onChange={(e) => set(i, { productId: e.target.value })}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
              <input
                className="input narrow"
                type="number"
                min={1}
                value={l.qty}
                onChange={(e) => set(i, { qty: Math.max(0, Number(e.target.value)) })}
              />
              {kind === 'order' && (
                <span className={`small ${avail < l.qty ? 'neg' : 'muted'}`}>есть {fmtInt(avail)}</span>
              )}
              <button
                className="icon-btn small"
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
                disabled={lines.length <= 1}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn small" onClick={() => setLines([...lines, { productId: products[0]?.id ?? '', qty: 10 }])}>
        <Icon name="plus" size={14} /> Позиция
      </button>
      <label className="field">
        <span className="field-label">Комментарий</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row">
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            const d = st().createDoc(kind, partner.trim(), lines, note || undefined);
            st().toast(
              `${kind === 'receipt' ? 'Поставка' : 'Заказ'} ${d?.number} создан${kind === 'receipt' ? 'а' : ''}`,
            );
            onDone(d);
          }}
        >
          Создать
        </button>
      </div>
    </div>
  );
}

function DocDetail({ d }: { d: Doc }) {
  const { cells } = useCells();
  const inv = useInventory();
  const pm = useProductsMap();
  const st = useStore.getState;
  const open = d.status === 'new' || d.status === 'progress';
  const plan = useMemo(() => (open ? planDoc(d, cells, inv, pm) : null), [open, d, cells, inv, pm]);
  const done = useMemo(() => (inv?.events ?? []).filter((e) => e.docId === d.id), [inv, d.id]);
  const short = plan?.lines.filter((l) => l.rest > 0) ?? [];
  const total = d.lines.reduce((s, l) => s + l.qty, 0);
  const value = d.lines.reduce((s, l) => s + l.qty * (pm.get(l.productId)?.price ?? 0), 0);
  const addresses = plan ? plan.ops.map((o) => (o.to ?? o.from)!) : done.map((e) => (e.to ?? e.from)!);
  const verb = d.kind === 'receipt' ? 'Разместить' : 'Собрать';

  return (
    <div className="card doc-detail">
      <div className="drawer-head">
        <div>
          <h2>
            {d.kind === 'receipt' ? 'Поставка' : 'Заказ'} {d.number}
          </h2>
          <div className="muted small">
            {d.partner} · создан {timeAgo(d.createdAt)}
            {d.doneAt ? ` · выполнен ${timeAgo(d.doneAt)}` : ''}
          </div>
        </div>
        <span className={`badge ${d.status}`}>{STATUS[d.status]}</span>
      </div>
      <div className="drawer-stats">
        <div>
          <span>Позиций</span>
          <b>{d.lines.length}</b>
        </div>
        <div>
          <span>Единиц</span>
          <b>{fmtInt(total)}</b>
        </div>
        <div>
          <span>Сумма</span>
          <b>{fmtMoney(value)}</b>
        </div>
        <div>
          <span>Ячеек</span>
          <b>{new Set(addresses).size}</b>
        </div>
      </div>
      {d.note && <div className="note">{d.note}</div>}

      <h4>{open ? (d.kind === 'receipt' ? 'План размещения' : 'Лист сборки') : 'Проведено'}</h4>
      <div className="plan">
        {(
          plan?.lines ??
          d.lines.map((l) => ({
            ...l,
            plan: done
              .filter((e) => e.productId === l.productId)
              .map((e) => ({ address: (e.to ?? e.from)!, qty: e.qty })),
            rest: 0,
          }))
        ).map((l, i) => {
          const p = pm.get(l.productId);
          return (
            <div key={i} className="plan-line">
              <div className="row between">
                <b>{p?.name ?? l.productId}</b>
                <span>
                  {fmtInt(l.qty)} {p?.unit}
                </span>
              </div>
              <div className="plan-cells">
                {l.plan.map((pl) => (
                  <button
                    key={pl.address}
                    className="plan-cell"
                    onClick={() => st().showCell(pl.address)}
                    title="Показать на 3D"
                  >
                    <span className="mono">{pl.address}</span>
                    <b>{fmtInt(pl.qty)}</b>
                  </button>
                ))}
              </div>
              {l.rest > 0 && (
                <div className="warn small">
                  {d.kind === 'receipt'
                    ? `Не хватает места для ${fmtInt(l.rest)} ед.`
                    : `Не хватает товара: ${fmtInt(l.rest)} ед.`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="row wrap">
        {addresses.length > 0 && (
          <button
            className="btn"
            onClick={() => {
              st().setHighlight([...new Set(addresses)]);
              st().setProductFilter(null);
              st().setSection('home');
              st().showCell(addresses[0]);
            }}
          >
            <Icon name="cube" size={16} /> Показать на складе
          </button>
        )}
        {d.status === 'new' && (
          <button className="btn" onClick={() => st().setDocStatus(d.id, 'progress')}>
            В работу
          </button>
        )}
        {open && plan && (
          <button
            className="btn primary"
            disabled={!plan.ops.length}
            onClick={() => {
              const run = () => {
                st().completeDoc(d.id, plan.ops);
                st().setHighlight([]);
                st().toast(
                  `${d.kind === 'receipt' ? `Поставка ${d.number} проведена` : `Заказ ${d.number} собран и отгружен`}: ${plan.ops.length} опер.`,
                );
              };
              if (short.length)
                st().ask('Часть позиций проведётся не полностью. Провести то, что есть?', run, 'Провести', false);
              else run();
            }}
          >
            <Icon name="check" size={16} /> {verb} и провести
          </button>
        )}
        {open && (
          <button className="btn danger" onClick={() => st().setDocStatus(d.id, 'cancelled')}>
            Отменить
          </button>
        )}
      </div>
    </div>
  );
}

export function DocsPage({ kind }: { kind: DocKind }) {
  const inv = useInventory();
  const pm = useProductsMap();
  const openId = useStore((s) => s.openDocId);
  const st = useStore.getState;
  const [tab, setTab] = useState<Tab>('all');
  const [creating, setCreating] = useState(false);
  const docs = useMemo(
    () =>
      (inv?.docs ?? [])
        .filter((d) => d.kind === kind)
        .slice()
        .reverse(),
    [inv, kind],
  );
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: docs.length, new: 0, progress: 0, done: 0, cancelled: 0 };
    docs.forEach((d) => c[d.status]++);
    return c;
  }, [docs]);
  const list = docs.filter((d) => tab === 'all' || d.status === tab);
  const open = docs.find((d) => d.id === openId);
  const title = kind === 'receipt' ? 'Поставки' : 'Заказы';

  return (
    <div className="page docs">
      <div className="docs-list">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <div className="muted">
              {kind === 'receipt' ? 'Приёмка товара и размещение по ячейкам' : 'Сборка и отгрузка заказов покупателей'}
            </div>
          </div>
          <button
            className="btn primary"
            onClick={() => {
              setCreating(true);
              st().openDoc(null);
            }}
          >
            <Icon name="plus" size={16} /> {kind === 'receipt' ? 'Поставка' : 'Заказ'}
          </button>
        </div>
        <div className="chips">
          {(['all', 'new', 'progress', 'done', 'cancelled'] as Tab[]).map((t) => (
            <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'all' ? 'Все' : STATUS[t]} <span className="chip-n">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="card doc-items">
          {!list.length && <p className="muted pad">Документов нет.</p>}
          {list.slice(0, 200).map((d) => {
            const units = d.lines.reduce((s, l) => s + l.qty, 0);
            return (
              <button
                key={d.id}
                className={`doc-row ${open?.id === d.id ? 'active' : ''}`}
                onClick={() => {
                  setCreating(false);
                  st().openDoc(d.id);
                }}
              >
                <span className={`event-icon ${kind === 'receipt' ? 'receipt' : 'shipment'}`}>
                  <Icon name={kind === 'receipt' ? 'inbound' : 'orders'} size={16} />
                </span>
                <span className="grow">
                  <b>{d.number}</b>
                  <span className="muted small">
                    {d.partner} ·{' '}
                    {d.lines
                      .map((l) => pm.get(l.productId)?.name)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', ')}
                    {d.lines.length > 2 ? '…' : ''}
                  </span>
                </span>
                <span className="right">
                  <span className={`badge ${d.status}`}>{STATUS[d.status]}</span>
                  <span className="muted small">
                    {fmtInt(units)} ед. · {timeAgo(d.doneAt ?? d.createdAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="docs-detail">
        {creating ? (
          <DocForm
            kind={kind}
            onDone={(d) => {
              setCreating(false);
              if (d) st().openDoc(d.id);
            }}
          />
        ) : open ? (
          <DocDetail key={open.id} d={open} />
        ) : (
          <div className="card empty-detail">
            <Icon name={kind === 'receipt' ? 'inbound' : 'orders'} size={36} />
            <p>Выберите документ слева или создайте новый.</p>
          </div>
        )}
      </div>
    </div>
  );
}
