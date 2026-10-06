import { useStore, useWarehouse } from '../store';
import { useCells, useFills, useStats } from '../lib/derived';
import { fmt, polygonArea } from '../lib/geometry';
import { cellViewpoint, rackCellCount, rackContext, rackHeight, rackLength } from '../lib/rack';
import { COLOR_OVERLOAD, fillColor } from '../lib/fill';
import { ZONE_TYPES } from '../lib/demo';
import { Bar, pct } from './ui';

export function Inspector() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const { byKey } = useCells();
  const fills = useFills();
  const stats = useStats();
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
            <div className="row between">
              <span>Заполнение</span>
              <b>{pct(f.fill)}</b>
            </div>
            <Bar value={f.fill} color={fillColor(f.fill)} />
            {f.weight !== undefined && (
              <div className="row between">
                <span>Вес / Г</span>
                <b style={{ color: over ? COLOR_OVERLOAD : undefined }}>
                  {f.weight} / {c.maxLoad} кг {over ? '— перегруз!' : ''}
                </b>
              </div>
            )}
            {f.qty !== undefined && (
              <div className="row between">
                <span>Количество</span>
                <b>{f.qty}</b>
              </div>
            )}
            {(f.name || f.sku) && (
              <div className="row between">
                <span>Товар</span>
                <b>{[f.sku, f.name !== f.sku ? f.name : undefined].filter(Boolean).join(' · ')}</b>
              </div>
            )}
            <div className="muted small">Данные от {new Date(f.updatedAt).toLocaleString('ru-RU')}</div>
          </div>
        ) : (
          !c.blocked && <div className="muted small">Нет данных о заполнении</div>
        )}
        <div className="row wrap">
          <button className="btn small" onClick={() => st().focusOn(c.cx, c.cy, c.cz, cellViewpoint(w, c))}>
            Показать
          </button>
          <button className="btn small" onClick={() => st().setStep('cells')}>
            Параметры ячейки
          </button>
        </div>
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
        <div className="row between">
          <span>Габарит</span>
          <b>
            {fmt(rackLength(r) / 1000)} × {fmt(r.depth / 1000)} × {fmt(rackHeight(r) / 1000)} м
          </b>
        </div>
        <div className="row between">
          <span>Секций × ярусов</span>
          <b>
            {r.sections} × {r.tiers.length}
          </b>
        </div>
        <div className="row between">
          <span>Ячеек</span>
          <b>{rackCellCount(r)}</b>
        </div>
        {s && s.withData > 0 && (
          <>
            <div className="row between">
              <span>Заполнение</span>
              <b>{pct(s.avgFill)}</b>
            </div>
            <Bar value={s.avgFill} color={fillColor(s.avgFill)} />
          </>
        )}
        <div className="row wrap">
          <button className="btn small" onClick={() => st().setStep('racks')}>
            Настроить
          </button>
          <button className="btn small" onClick={() => st().setStep('cells')}>
            Ячейки
          </button>
        </div>
      </>
    );
  } else if (selection.kind === 'room') {
    const r = w.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    title = r.name;
    body = (
      <>
        <div className="row between">
          <span>Площадь</span>
          <b>{fmt(polygonArea(r.points))} м²</b>
        </div>
        <div className="row between">
          <span>Высота</span>
          <b>{r.height} м</b>
        </div>
        <div className="row between">
          <span>Зон</span>
          <b>{w.zones.filter((z) => z.roomId === r.id).length}</b>
        </div>
      </>
    );
  } else if (selection.kind === 'zone') {
    const z = w.zones.find((x) => x.id === selection.id);
    if (!z) return null;
    title = z.name;
    body = (
      <>
        <div className="muted small">{ZONE_TYPES[z.type]}</div>
        <div className="row between">
          <span>Площадь</span>
          <b>{fmt(polygonArea(z.points))} м²</b>
        </div>
        <div className="row between">
          <span>Высота размещения</span>
          <b>{z.height} м</b>
        </div>
        <div className="row between">
          <span>Стеллажей</span>
          <b>{w.racks.filter((r) => r.zoneId === z.id).length}</b>
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
