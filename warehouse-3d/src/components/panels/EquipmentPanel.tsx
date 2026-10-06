import { useStore, useWarehouse } from '../../store';
import type { Equipment, EquipmentType } from '../../types';
import { EQUIPMENT, type PaletteGroup } from '../../lib/equipment';
import { uid } from '../../lib/id';
import { Illustration } from '../icons';
import { Check, ColorField, Hint, Num, Section, Text } from '../ui';

/** Плитка палитры конструктора: картинка + подпись. */
export function Tile({
  art,
  title,
  active,
  onClick,
  hint,
}: {
  art: string;
  title: string;
  active?: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button className={`tile ${active ? 'active' : ''}`} onClick={onClick} title={hint ?? title}>
      <span className="tile-art">
        <Illustration name={art} />
      </span>
      <span className="tile-title">{title}</span>
    </button>
  );
}

const TYPES_BY_GROUP = (g: PaletteGroup) =>
  (Object.keys(EQUIPMENT) as EquipmentType[]).filter((t) => EQUIPMENT[t].group === g);

/** Плитки объектов группы: щелчок включает режим расстановки. */
export function EquipmentTiles({ group }: { group: PaletteGroup }) {
  const placing = useStore((s) => s.placing);
  const st = useStore.getState;
  return (
    <div className="tiles">
      {TYPES_BY_GROUP(group).map((t) => (
        <Tile
          key={t}
          art={t}
          title={EQUIPMENT[t].title}
          hint={`${EQUIPMENT[t].hint} — щёлкните, затем укажите место на 3D или плане`}
          active={placing === t}
          onClick={() => st().startPlacing(placing === t ? null : t)}
        />
      ))}
    </div>
  );
}

/** Параметры выбранного объекта: положение, размеры, цвет, состояние. */
export function EquipmentEditor({ e }: { e: Equipment }) {
  const st = useStore.getState;
  const up = (patch: Partial<Equipment>) => st().updateEquipment(e.id, patch);
  const spec = EQUIPMENT[e.type];
  return (
    <Section
      title={`Параметры: ${e.name}`}
      actions={
        <>
          <button
            className="btn small"
            onClick={() => {
              const a = (e.rotation * Math.PI) / 180;
              const off = e.width + 1;
              st().addEquipment({
                ...e,
                id: uid('e'),
                name: `${e.name} (копия)`,
                x: Math.round((e.x - Math.sin(a) * off) * 100) / 100,
                y: Math.round((e.y + Math.cos(a) * off) * 100) / 100,
              });
            }}
          >
            Копия
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              st().deleteEquipment(e.id);
              st().select(null);
            }}
          >
            Удалить
          </button>
        </>
      }
    >
      <div className="muted small">{spec.title}</div>
      <Text label="Название" value={e.name} onChange={(v) => up({ name: v })} />
      <div className="grid3">
        <Num label="X центра" unit="м" value={e.x} step={0.1} onChange={(v) => up({ x: v })} />
        <Num label="Y центра" unit="м" value={e.y} step={0.1} onChange={(v) => up({ y: v })} />
        <Num
          label="Поворот"
          unit="°"
          value={e.rotation}
          step={15}
          onChange={(v) => up({ rotation: ((v % 360) + 360) % 360 })}
        />
      </div>
      <div className="row wrap">
        {[0, 90, 180, 270].map((a) => (
          <button
            key={a}
            className={`btn small ${e.rotation === a ? 'active' : ''}`}
            onClick={() => up({ rotation: a })}
          >
            {a}°
          </button>
        ))}
      </div>
      <div className="grid3">
        <Num label="Длина" unit="м" value={e.length} min={0.05} step={0.1} onChange={(v) => up({ length: v })} />
        <Num label="Ширина" unit="м" value={e.width} min={0.05} step={0.1} onChange={(v) => up({ width: v })} />
        <Num label="Высота" unit="м" value={e.height} min={0.05} step={0.1} onChange={(v) => up({ height: v })} />
      </div>
      <div className="grid2">
        <ColorField label="Цвет" value={e.color} onChange={(v) => up({ color: v })} />
      </div>
      {(e.type === 'dock' || e.type === 'forklift' || e.type === 'gate') && (
        <Check
          label={
            e.type === 'dock'
              ? 'Рампа занята (идёт погрузка)'
              : e.type === 'gate'
                ? 'Ворота открыты'
                : 'Погрузчик в работе (движется)'
          }
          checked={!!e.active}
          onChange={(v) => up({ active: v })}
        />
      )}
      <Hint>Перетаскивайте объект на плане. Размеры и поворот можно задать точно здесь.</Hint>
    </Section>
  );
}

/** Вкладки «Оборудование» и «Другое». */
export function EquipmentPanel({ group }: { group: PaletteGroup }) {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  if (!w) return null;
  const items = w.equipment.filter((e) => EQUIPMENT[e.type].group === group);
  const sel = selection?.kind === 'equipment' ? w.equipment.find((e) => e.id === selection.id) : undefined;
  return (
    <>
      <Section title={group === 'equipment' ? 'Оборудование' : 'Помещения и рабочие места'}>
        <EquipmentTiles group={group} />
        <Hint>Выберите объект и щёлкните на 3D-сцене или плане, чтобы поставить его.</Hint>
      </Section>
      <Section title={`На складе (${items.length})`}>
        {!items.length && <p className="muted small">Пока ничего не добавлено.</p>}
        <div className="list compact">
          {items.map((e) => (
            <button
              key={e.id}
              className={`list-item ${sel?.id === e.id ? 'active' : ''}`}
              onClick={() => st().select({ kind: 'equipment', id: e.id })}
            >
              <span className="swatch" style={{ background: e.color }} />
              <span className="grow">{e.name}</span>
              <span className="muted small">{EQUIPMENT[e.type].title}</span>
              {e.active && <span className="dot-ok" title="Активен" />}
            </button>
          ))}
        </div>
      </Section>
      {sel && EQUIPMENT[sel.type].group === group && <EquipmentEditor e={sel} />}
    </>
  );
}
