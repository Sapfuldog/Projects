import { useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import {
  fmt,
  polygonArea,
  polygonPerimeter,
  selfIntersects,
  shapeTemplate,
  type ShapeTemplate,
} from '../../lib/geometry';
import { warehouseBounds } from '../../lib/derived';
import { ColorField, Hint, Num, Section, Text, Warn } from '../ui';
import { EquipmentEditor, EquipmentTiles, Tile } from './EquipmentPanel';
import { EQUIPMENT } from '../../lib/equipment';
import { VerticesEditor } from './VerticesEditor';

const SHAPES: { value: ShapeTemplate; label: string }[] = [
  { value: 'rect', label: 'Прямоугольное' },
  { value: 'L', label: 'Г-образное' },
  { value: 'U', label: 'П-образное' },
  { value: 'T', label: 'Т-образное' },
];

export function RoomsPanel() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const draw = useStore((s) => s.draw);
  const st = useStore.getState;
  const [shape, setShape] = useState<ShapeTemplate>('rect');
  const [width, setWidth] = useState(36);
  const [length, setLength] = useState(24);
  if (!w) return null;

  const room = selection?.kind === 'room' ? w.rooms.find((r) => r.id === selection.id) : undefined;
  const selEquip = selection?.kind === 'equipment' ? w.equipment.find((e) => e.id === selection.id) : undefined;

  const addFromTemplate = () => {
    const b = w.rooms.length ? warehouseBounds(w) : null;
    const ox = b ? Math.ceil(b.maxX + 4) : 0;
    st().addRoom(shapeTemplate(shape, width, length, ox, b ? Math.floor(b.minY) : 0));
  };

  return (
    <>
      <Section title="Форма помещений">
        <div className="tiles">
          {SHAPES.map((sh) => (
            <Tile
              key={sh.value}
              art={`room-${sh.value}`}
              title={sh.label}
              active={shape === sh.value}
              onClick={() => setShape(sh.value)}
            />
          ))}
          <Tile
            art="draw"
            title="Нарисовать"
            active={draw?.target === 'room' && !draw.replaceId}
            onClick={() => st().startDraw('room')}
            hint="Нарисовать контур помещения по углам на плане"
          />
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
        <Hint>Выберите форму и размеры или нарисуйте контур по углам. Вершины уточняются на плане или числами.</Hint>
      </Section>

      <Section title="Элементы здания">
        <EquipmentTiles group="building" />
      </Section>

      {selEquip && EQUIPMENT[selEquip.type].group === 'building' && <EquipmentEditor e={selEquip} />}

      <Section title={`Помещения (${w.rooms.length})`}>
        {!w.rooms.length && <p className="muted">Пока нет помещений.</p>}
        <div className="list">
          {w.rooms.map((r) => (
            <button
              key={r.id}
              className={`list-item ${room?.id === r.id ? 'active' : ''}`}
              onClick={() => st().select({ kind: 'room', id: r.id })}
            >
              <span className="swatch" style={{ background: r.color }} />
              <span className="grow">
                {r.name} <span className="muted">({r.code})</span>
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
          title={`Помещение: ${room.name}`}
          actions={
            <button
              className="btn small danger"
              onClick={() =>
                st().ask(`Удалить «${room.name}» вместе с его зонами и стеллажами?`, () => {
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
            <Num
              label="Высота помещения"
              unit="м"
              value={room.height}
              min={1}
              step={0.1}
              onChange={(v) => st().updateRoom(room.id, { height: v })}
            />
            <Num
              label="Отметка пола"
              unit="м"
              title="Для этажей и антресолей: высота пола над нулём объекта"
              value={room.elevation}
              step={0.1}
              onChange={(v) => st().updateRoom(room.id, { elevation: v })}
            />
            <ColorField label="Цвет" value={room.color} onChange={(v) => st().updateRoom(room.id, { color: v })} />
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
