import { useStore, useWarehouse } from '../../store';
import { bbox, fmt, insetRect, polygonArea, polygonInside, selfIntersects } from '../../lib/geometry';
import type { Pt } from '../../types';
import { ZONE_TYPES } from '../../lib/demo';
import { rackHeight } from '../../lib/rack';
import type { ZoneType } from '../../types';
import { ColorField, Hint, Num, Section, Select, Text, Warn } from '../ui';
import { VerticesEditor } from './VerticesEditor';

/** Зона по умолчанию: для прямоугольного помещения — с отступом 1 м, для сложной формы — по контуру помещения. */
function defaultZoneShape(points: Pt[]): Pt[] {
  const b = bbox(points);
  const isRect = points.length === 4 && Math.abs((b.maxX - b.minX) * (b.maxY - b.minY) - polygonArea(points)) < 0.01;
  return isRect ? insetRect(points, 1) : points.map((p) => ({ ...p }));
}

export function ZonesPanel() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const draw = useStore((s) => s.draw);
  const st = useStore.getState;
  if (!w) return null;

  const zone = selection?.kind === 'zone' ? w.zones.find((z) => z.id === selection.id) : undefined;
  const room = zone && w.rooms.find((r) => r.id === zone.roomId);

  if (!w.rooms.length) {
    return (
      <Section title="Зоны размещения">
        <p className="muted">Сначала создайте хотя бы одно помещение.</p>
        <button className="btn" onClick={() => st().setStep('rooms')}>
          ← К помещениям
        </button>
      </Section>
    );
  }

  const warnings: string[] = [];
  if (zone && room) {
    if (!polygonInside(zone.points, room.points, 0.05)) warnings.push('Зона выходит за границы помещения');
    if (zone.height > room.height) warnings.push(`Высота зоны больше высоты помещения (${room.height} м)`);
    if (selfIntersects(zone.points)) warnings.push('Контур пересекает сам себя');
    const tall = w.racks.filter((r) => r.zoneId === zone.id && rackHeight(r) / 1000 > zone.height + 1e-6);
    if (tall.length) warnings.push(`Стеллажи выше зоны: ${tall.map((r) => r.code).join(', ')}`);
  }

  return (
    <>
      <Section title="Зоны размещения">
        <Hint>
          Зона — участок помещения с одним типом хранения и <b>предельной высотой размещения</b> (например, под фермами,
          спринклерами или кран-балкой). Высота зоны ограничивает высоту стеллажей.
        </Hint>
        <div className="row wrap">
          {w.rooms.map((r) => (
            <button
              key={r.id}
              className="btn small primary"
              onClick={() => st().addZone(r.id, defaultZoneShape(r.points))}
            >
              + Зона в «{r.name}»
            </button>
          ))}
          <button
            className={`btn small ${draw?.target === 'zone' && !draw.replaceId ? 'active' : ''}`}
            onClick={() => st().startDraw('zone')}
          >
            ✎ Нарисовать зону
          </button>
        </div>
      </Section>

      {w.rooms.map((r) => {
        const zones = w.zones.filter((z) => z.roomId === r.id);
        return (
          <Section key={r.id} title={`${r.name}: зон ${zones.length}`}>
            {!zones.length && <p className="muted small">Нет зон</p>}
            <div className="list">
              {zones.map((z) => (
                <button
                  key={z.id}
                  className={`list-item ${zone?.id === z.id ? 'active' : ''}`}
                  onClick={() => st().select({ kind: 'zone', id: z.id })}
                >
                  <span className="swatch" style={{ background: z.color }} />
                  <span className="grow">
                    {z.name} <span className="muted">({z.code})</span>
                    <div className="muted small">{ZONE_TYPES[z.type]}</div>
                  </span>
                  <span className="muted small">
                    {fmt(polygonArea(z.points), 0)} м² · ≤ {z.height} м
                  </span>
                </button>
              ))}
            </div>
          </Section>
        );
      })}

      {zone && (
        <Section
          title={`Зона: ${zone.name}`}
          actions={
            <button
              className="btn small danger"
              onClick={() =>
                confirm(`Удалить зону «${zone.name}» и её стеллажи?`) && (st().deleteZone(zone.id), st().select(null))
              }
            >
              Удалить
            </button>
          }
        >
          <div className="grid2">
            <Text label="Название" value={zone.name} onChange={(v) => st().updateZone(zone.id, { name: v })} />
            <Text label="Код (для адреса)" value={zone.code} onChange={(v) => st().updateZone(zone.id, { code: v })} />
            <Select<ZoneType>
              label="Тип зоны"
              value={zone.type}
              onChange={(v) => st().updateZone(zone.id, { type: v })}
              options={Object.entries(ZONE_TYPES).map(([value, label]) => ({ value: value as ZoneType, label }))}
            />
            <Num
              label={<b>Высота зоны размещения</b>}
              unit="м"
              value={zone.height}
              min={0.1}
              step={0.1}
              onChange={(v) => st().updateZone(zone.id, { height: v })}
            />
            <Select
              label="Помещение"
              value={zone.roomId}
              onChange={(v) => st().updateZone(zone.id, { roomId: v })}
              options={w.rooms.map((r) => ({ value: r.id, label: r.name }))}
            />
            <ColorField label="Цвет" value={zone.color} onChange={(v) => st().updateZone(zone.id, { color: v })} />
          </div>
          <div className="metrics">
            <span>
              Площадь: <b>{fmt(polygonArea(zone.points))} м²</b>
            </span>
            <span>
              Объём размещения: <b>{fmt(polygonArea(zone.points) * zone.height, 0)} м³</b>
            </span>
            <span>
              Стеллажей: <b>{w.racks.filter((r) => r.zoneId === zone.id).length}</b>
            </span>
          </div>
          <Warn items={warnings} />
          <h4>Вершины контура</h4>
          <VerticesEditor points={zone.points} onChange={(pts) => st().updateZone(zone.id, { points: pts })} />
          <div className="row wrap">
            <button className="btn small" onClick={() => st().startDraw('zone', zone.id)}>
              ✎ Перерисовать контур
            </button>
            <button
              className="btn small"
              onClick={() => room && st().updateZone(zone.id, { points: room.points.map((p) => ({ ...p })) })}
            >
              Во всё помещение
            </button>
            <button className="btn small" onClick={() => st().setStep('racks')}>
              Далее: стеллажи →
            </button>
          </div>
        </Section>
      )}
    </>
  );
}
