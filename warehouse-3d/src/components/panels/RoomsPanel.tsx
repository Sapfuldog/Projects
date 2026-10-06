import { useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { RoomKind } from '../../types';
import {
  fmt,
  polygonArea,
  polygonPerimeter,
  selfIntersects,
  shapeTemplate,
  type ShapeTemplate,
} from '../../lib/geometry';
import { warehouseBounds } from '../../lib/derived';
import { ROOM_KINDS } from '../../lib/demo';
import { Check, ColorField, Hint, Num, Section, Select, Text, Warn } from '../ui';
import { EquipmentEditor, EquipmentTiles, Tile } from './EquipmentPanel';
import { EQUIPMENT } from '../../lib/equipment';
import { VerticesEditor } from './VerticesEditor';
import { Icon } from '../icons';

const SHAPES: { value: ShapeTemplate; label: string }[] = [
  { value: 'rect', label: 'Прямоугольник' },
  { value: 'L', label: 'Г-образное' },
  { value: 'U', label: 'П-образное' },
  { value: 'T', label: 'Т-образное' },
];

const KIND_ART: Record<RoomKind, string> = {
  storage: 'room-rect',
  yard: 'room-yard',
  canopy: 'room-canopy',
  production: 'room-L',
  office: 'office',
  technical: 'toilet',
};

/** Этажи здания: отметка пола и высота. */
function FloorsEditor() {
  const w = useWarehouse()!;
  const st = useStore.getState;
  const floors = [...w.floors].sort((a, b) => b.elevation - a.elevation);
  return (
    <Section
      title={`Этажи (${w.floors.length})`}
      actions={
        <button className="btn small" onClick={() => st().addFloor()}>
          + Этаж
        </button>
      }
    >
      <Hint>
        Помещение относится к этажу; отметка пола этажа поднимает в 3D всё, что в нём стоит. Кнопка «Разнести этажи» в
        окне 3D разводит этажи по высоте.
      </Hint>
      <div className="floors">
        {floors.map((f) => (
          <div key={f.id} className="floor-row">
            <Icon name="floors" size={16} />
            <Text value={f.name} onChange={(v) => st().updateFloor(f.id, { name: v })} />
            <Num
              label="Отметка"
              unit="м"
              value={f.elevation}
              step={0.1}
              onChange={(v) => st().updateFloor(f.id, { elevation: v })}
            />
            <Num
              label="Высота"
              unit="м"
              value={f.height}
              min={1}
              step={0.1}
              onChange={(v) => st().updateFloor(f.id, { height: v })}
            />
            <span className="muted small">{w.rooms.filter((r) => r.floorId === f.id).length} пом.</span>
            <button
              className="icon-btn small"
              disabled={w.floors.length <= 1}
              title="Удалить этаж (помещения перейдут на нижний)"
              onClick={() =>
                st().ask(`Удалить ${f.name}? Помещения перейдут на первый этаж.`, () => st().deleteFloor(f.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function RoomsPanel() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const draw = useStore((s) => s.draw);
  const floorFilter = useStore((s) => s.floorFilter);
  const st = useStore.getState;
  const [kind, setKind] = useState<RoomKind>('storage');
  const [shape, setShape] = useState<ShapeTemplate>('rect');
  const [width, setWidth] = useState(36);
  const [length, setLength] = useState(24);
  if (!w) return null;

  const room = selection?.kind === 'room' ? w.rooms.find((r) => r.id === selection.id) : undefined;
  const selEquip = selection?.kind === 'equipment' ? w.equipment.find((e) => e.id === selection.id) : undefined;

  const addFromTemplate = () => {
    const b = w.rooms.length ? warehouseBounds(w) : null;
    const ox = b ? Math.ceil(b.maxX + 4) : 0;
    const id = st().addRoom(shapeTemplate(shape, width, length, ox, b ? Math.floor(b.minY) : 0), kind);
    st().updateRoom(id, { name: `${ROOM_KINDS[kind].short} ${w.rooms.length + 1}` }, false);
  };

  return (
    <>
      <FloorsEditor />
      <Section title="Новое помещение или площадка">
        <div className="tiles">
          {(Object.keys(ROOM_KINDS) as RoomKind[]).map((k) => (
            <Tile
              key={k}
              art={KIND_ART[k]}
              title={ROOM_KINDS[k].title}
              active={kind === k}
              onClick={() => setKind(k)}
            />
          ))}
        </div>
        <div className="chips">
          {SHAPES.map((sh) => (
            <button
              key={sh.value}
              className={`chip ${shape === sh.value ? 'active' : ''}`}
              onClick={() => setShape(sh.value)}
            >
              {sh.label}
            </button>
          ))}
          <button
            className={`chip ${draw?.target === 'room' && !draw.replaceId ? 'active' : ''}`}
            onClick={() => st().startDraw('room')}
          >
            ✎ Нарисовать
          </button>
        </div>
        <div className="grid3">
          <Num label="Ширина" unit="м" value={width} min={1} step={0.5} onChange={setWidth} />
          <Num label="Длина" unit="м" value={length} min={1} step={0.5} onChange={setLength} />
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <button className="btn primary" onClick={addFromTemplate}>
              + Добавить
            </button>
          </div>
        </div>
        <Hint>
          {floorFilter
            ? `Помещение добавится на этаж «${w.floors.find((f) => f.id === floorFilter)?.name}».`
            : 'Помещение добавится на первый этаж; чтобы добавить на другой — выберите этаж справа в окне 3D.'}{' '}
          Двор — открытая площадка с ограждением, навес — колонны и кровля без стен.
        </Hint>
      </Section>

      <Section title="Элементы здания">
        <EquipmentTiles group="building" />
      </Section>
      {selEquip && EQUIPMENT[selEquip.type].group === 'building' && <EquipmentEditor e={selEquip} />}

      <Section title={`Помещения и площадки (${w.rooms.length})`}>
        {!w.rooms.length && <p className="muted">Пока нет помещений.</p>}
        <div className="list">
          {w.rooms.map((r) => (
            <button
              key={r.id}
              className={`list-item ${room?.id === r.id ? 'active' : ''}`}
              onClick={() => st().select({ kind: 'room', id: r.id })}
            >
              <span className="swatch" style={{ background: r.hazard ? '#e5484d' : r.color }} />
              <span className="grow">
                {r.name} <span className="muted">({r.code})</span>
                <div className="muted small">
                  {ROOM_KINDS[r.kind].title} · {w.floors.find((f) => f.id === r.floorId)?.name ?? '—'}
                </div>
              </span>
              <span className="muted small">
                {fmt(polygonArea(r.points), 0)} м² · h {r.height} м
              </span>
            </button>
          ))}
        </div>
      </Section>

      {room && (
        <Section
          title={`${ROOM_KINDS[room.kind].short}: ${room.name}`}
          actions={
            <button
              className="btn small danger"
              onClick={() =>
                st().ask(`Удалить «${room.name}» вместе с его зонами, стеллажами и мезонинами?`, () => {
                  st().deleteRoom(room.id);
                  st().select(null);
                })
              }
            >
              Удалить
            </button>
          }
        >
          <div className="grid2">
            <Text label="Название" value={room.name} onChange={(v) => st().updateRoom(room.id, { name: v })} />
            <Text label="Код (для адреса)" value={room.code} onChange={(v) => st().updateRoom(room.id, { code: v })} />
            <Select<RoomKind>
              label="Вид"
              value={room.kind}
              onChange={(v) => st().updateRoom(room.id, { kind: v, fence: v === 'yard' ? true : room.fence })}
              options={(Object.keys(ROOM_KINDS) as RoomKind[]).map((k) => ({ value: k, label: ROOM_KINDS[k].title }))}
            />
            <Select
              label="Этаж"
              value={room.floorId ?? ''}
              onChange={(v) => st().updateRoom(room.id, { floorId: v })}
              options={w.floors.map((f) => ({ value: f.id, label: `${f.name} (${fmt(f.elevation)} м)` }))}
            />
            <Num
              label={room.kind === 'yard' ? 'Допустимая высота штабеля' : 'Высота помещения'}
              unit="м"
              value={room.height}
              min={1}
              step={0.1}
              onChange={(v) => st().updateRoom(room.id, { height: v })}
            />
            <Text
              label="Температурный режим"
              value={room.temp ?? ''}
              placeholder="+5…+25 °C"
              onChange={(v) => st().updateRoom(room.id, { temp: v || undefined })}
            />
            <ColorField label="Цвет" value={room.color} onChange={(v) => st().updateRoom(room.id, { color: v })} />
            <div className="field">
              <span className="field-label">&nbsp;</span>
              <Check
                label="ЛВЖ / опасные грузы"
                checked={!!room.hazard}
                onChange={(v) => st().updateRoom(room.id, { hazard: v || undefined })}
              />
              <Check
                label="Ограждение"
                checked={!!room.fence}
                onChange={(v) => st().updateRoom(room.id, { fence: v || undefined })}
              />
            </div>
          </div>
          <div className="metrics">
            <span>
              Площадь: <b>{fmt(polygonArea(room.points))} м²</b>
            </span>
            <span>
              Периметр: <b>{fmt(polygonPerimeter(room.points))} м</b>
            </span>
            <span>
              Объём: <b>{fmt(polygonArea(room.points) * room.height, 0)} м³</b>
            </span>
          </div>
          <Warn items={selfIntersects(room.points) ? ['Контур пересекает сам себя — проверьте порядок вершин'] : []} />
          <h4>Вершины контура</h4>
          <VerticesEditor points={room.points} onChange={(pts) => st().updateRoom(room.id, { points: pts })} />
          <div className="row wrap">
            <button className="btn small" onClick={() => st().startDraw('room', room.id)}>
              ✎ Перерисовать контур
            </button>
            <button className="btn small" onClick={() => st().setStep('zones')}>
              Далее: зоны размещения →
            </button>
          </div>
          <Hint>
            На плане: перетащите вершину; квадратик на середине стороны добавляет вершину; двойной щелчок по вершине
            удаляет её; перетаскивание помещения сдвигает его вместе с содержимым.
          </Hint>
        </Section>
      )}
    </>
  );
}
