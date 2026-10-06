import { useStore, useWarehouse } from '../store';
import { useMonitor } from '../lib/derived';
import { ROOM_KINDS, ZONE_TYPES } from '../lib/demo';
import { EQUIPMENT } from '../lib/equipment';
import { fmt, polygonArea } from '../lib/geometry';
import { CELL_TYPES } from '../lib/materials';
import { VIOLATIONS } from '../lib/control';
import type { LocStats } from '../lib/analytics';
import type { CellType } from '../types';
import type { SceneMode } from './scene/Scene3D';
import { CellDetails, Meter, RackSummary } from './CellCard';
import { Icon } from './icons';
import { pct } from './ui';

function LocBlock({ s, problems }: { s?: LocStats; problems: number }) {
  if (!s) return <div className="muted small">Нет ячеек</div>;
  return (
    <>
      <Meter
        value={s.fill}
        label="Заполнение"
        sub={`${pct(s.fill)} · занято ${s.occupied.toLocaleString('ru-RU')} из ${s.cells.toLocaleString('ru-RU')}`}
      />
      {s.places > 0 && (
        <Meter
          value={s.usedPlaces / s.places}
          label="Места (паллеты, короба, баллоны)"
          sub={`${s.usedPlaces.toLocaleString('ru-RU')} из ${s.places.toLocaleString('ru-RU')}`}
        />
      )}
      <div className="cc-props">
        <span>
          <em>Свободно</em>
          <b>{s.free.toLocaleString('ru-RU')} яч.</b>
        </span>
        <span>
          <em>Груз</em>
          <b>{(s.weight / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т</b>
        </span>
        <span>
          <em>Заблокировано</em>
          <b>{s.blocked}</b>
        </span>
        <span>
          <em>Нарушений</em>
          <b className={problems ? 'bad-text' : ''}>{problems}</b>
        </span>
      </div>
      <div className="type-chips">
        {(Object.keys(s.byType) as CellType[]).map((t) => {
          const x = s.byType[t]!;
          return (
            <span key={t} title={CELL_TYPES[t].title}>
              <i style={{ background: CELL_TYPES[t].color }} />
              {CELL_TYPES[t].short} {x.occupied}/{x.cells}
            </span>
          );
        })}
      </div>
    </>
  );
}

/** Карточка выбранного объекта поверх 3D/плана. */
export function Inspector({ mode = 'monitor' }: { mode?: SceneMode }) {
  const w = useWarehouse();
  const m = useMonitor();
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  if (!w || !m || !selection) return null;
  const close = (
    <button className="icon-btn small" title="Закрыть" onClick={() => st().select(null)}>
      <Icon name="close" size={16} />
    </button>
  );
  const problemsWhere = (pred: (address: string, rackId?: string) => boolean) =>
    m.violations.filter((v) => VIOLATIONS[v.kind].level !== 'info' && pred(v.address, v.rackId)).length;
  let body: React.ReactNode = null;
  let title = '';

  if (selection.kind === 'cell') {
    const c = m.idx.byKey.get(selection.id);
    if (!c) return null;
    title = 'Ячейка';
    body = <CellDetails cell={c} compact />;
  } else if (selection.kind === 'rack') {
    const r = w.racks.find((x) => x.id === selection.id);
    if (!r) return null;
    title = 'Стеллаж';
    body = (
      <>
        <RackSummary rack={r} compact />
        <div className="row wrap cc-actions">
          <button
            className="btn small primary"
            onClick={() => {
              st().select({ kind: 'rack', id: r.id });
              st().setSection('cells');
            }}
          >
            <Icon name="grid" size={15} /> Карта ячеек
          </button>
          {mode === 'build' && (
            <button className="btn small" onClick={() => st().setStep('racks')}>
              <Icon name="edit" size={15} /> Изменить
            </button>
          )}
        </div>
      </>
    );
  } else if (selection.kind === 'room') {
    const r = w.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    const floor = w.floors.find((f) => f.id === r.floorId);
    title = ROOM_KINDS[r.kind].title;
    body = (
      <>
        <div className="cc-head">
          <span className="cc-type" style={{ background: r.color }}>
            {r.code}
          </span>
          <div className="grow">
            <b>{r.name}</b>
            <div className="muted small">
              {floor?.name ?? ''} · {fmt(polygonArea(r.points), 0)} м² · высота {fmt(r.height, 1)} м
              {r.temp ? ` · ${r.temp}` : ''}
            </div>
          </div>
        </div>
        <div className="cc-badges">
          {r.hazard && <span className="badge warn">ЛВЖ / опасные грузы</span>}
          {r.fence && <span className="badge">Ограждение</span>}
          <span className="badge">Зон: {w.zones.filter((z) => z.roomId === r.id).length}</span>
        </div>
        <LocBlock
          s={m.stats.byRoom.get(r.id)}
          problems={problemsWhere((a) => m.idx.byAddress.get(a)?.roomId === r.id)}
        />
        <div className="row wrap cc-actions">
          <button className="btn small primary" onClick={() => st().setSection('cells')}>
            <Icon name="grid" size={15} /> Ячейки помещения
          </button>
          {mode === 'build' && (
            <button className="btn small" onClick={() => st().setStep('rooms')}>
              <Icon name="edit" size={15} /> Изменить
            </button>
          )}
        </div>
      </>
    );
  } else if (selection.kind === 'zone') {
    const z = w.zones.find((x) => x.id === selection.id);
    if (!z) return null;
    title = 'Зона размещения';
    body = (
      <>
        <div className="cc-head">
          <span className="cc-type" style={{ background: z.color }}>
            {z.code}
          </span>
          <div className="grow">
            <b>{z.name}</b>
            <div className="muted small">
              {ZONE_TYPES[z.type].title} · {fmt(polygonArea(z.points), 0)} м² · предел высоты {fmt(z.height, 1)} м
            </div>
          </div>
        </div>
        <LocBlock
          s={m.stats.byZone.get(z.id)}
          problems={problemsWhere((a) => m.idx.byAddress.get(a)?.zoneId === z.id)}
        />
      </>
    );
  } else if (selection.kind === 'mezzanine') {
    const mz = w.mezzanines.find((x) => x.id === selection.id);
    if (!mz) return null;
    const racks = w.racks.filter((r) => r.mezzanineId === mz.id);
    title = 'Мезонин';
    body = (
      <>
        <div className="cc-head">
          <span className="cc-type" style={{ background: mz.color }}>
            {mz.code}
          </span>
          <div className="grow">
            <b>{mz.name}</b>
            <div className="muted small">
              {fmt(mz.length, 1)} × {fmt(mz.width, 1)} м · {mz.levels + 1} уровня хранения · настилы через{' '}
              {fmt(mz.levelHeight, 2)} м
            </div>
          </div>
        </div>
        <div className="cc-props">
          <span>
            <em>Нагрузка на настил</em>
            <b>{mz.deckLoad} кг/м²</b>
          </span>
          <span>
            <em>Стеллажей</em>
            <b>{racks.length}</b>
          </span>
          {Array.from({ length: mz.levels }, (_, k) => (
            <span key={k}>
              <em>Настил {k + 1}</em>
              <b>+{fmt((k + 1) * mz.levelHeight, 2)} м</b>
            </span>
          ))}
        </div>
      </>
    );
  } else if (selection.kind === 'equipment') {
    const e = w.equipment.find((x) => x.id === selection.id);
    if (!e) return null;
    title = EQUIPMENT[e.type].title;
    body = (
      <>
        <div className="cc-head">
          <div className="grow">
            <b>{e.name}</b>
            <div className="muted small">
              {fmt(e.length, 1)} × {fmt(e.width, 1)} × {fmt(e.height, 1)} м
            </div>
          </div>
        </div>
        {(e.type === 'dock' || e.type === 'forklift' || e.type === 'counter' || e.type === 'gate') && (
          <label className="check">
            <input
              type="checkbox"
              checked={!!e.active}
              onChange={(ev) => st().updateEquipment(e.id, { active: ev.target.checked })}
            />
            <span>
              {e.type === 'forklift'
                ? 'В работе'
                : e.type === 'gate'
                  ? 'Открыты'
                  : e.type === 'counter'
                    ? 'Окно открыто'
                    : 'Рампа занята'}
            </span>
          </label>
        )}
      </>
    );
  }

  return (
    <aside className={`inspector ${selection.kind}`}>
      <div className="inspector-head">
        <span className="muted small">{title}</span>
        {close}
      </div>
      <div className="inspector-body">{body}</div>
    </aside>
  );
}
