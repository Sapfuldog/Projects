import { useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { Mezzanine } from '../../types';
import { fmt } from '../../lib/geometry';
import { DECK_T, rackHeight } from '../../lib/rack';
import { ColorField, Hint, Num, Section, Select, Text, Warn } from '../ui';
import { Tile } from './EquipmentPanel';

/** Мезонины: многоуровневые конструкции с настилами, лестницами и ограждением. */
export function MezzaninePanel() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  const [zoneId, setZoneId] = useState('');
  if (!w) return null;
  const mz = selection?.kind === 'mezzanine' ? w.mezzanines.find((m) => m.id === selection.id) : undefined;
  const zone =
    w.zones.find((z) => z.id === (zoneId || mz?.zoneId)) ?? w.zones.find((z) => z.type === 'rack') ?? w.zones[0];
  const up = (patch: Partial<Mezzanine>) => mz && st().updateMezzanine(mz.id, patch);
  const racks = mz ? w.racks.filter((r) => r.mezzanineId === mz.id) : [];
  const room = mz ? w.rooms.find((r) => r.id === w.zones.find((z) => z.id === mz.zoneId)?.roomId) : undefined;
  const warnings: string[] = [];
  if (mz && room && mz.levels * mz.levelHeight + 2.2 > room.height)
    warnings.push(
      `Верхний уровень (+${fmt(mz.levels * mz.levelHeight)} м) с проходом 2,2 м не помещается по высоте помещения (${room.height} м)`,
    );
  for (const r of racks) {
    const deck = r.deck ?? 1;
    if (mz && deck < mz.levels && rackHeight(r) / 1000 > mz.levelHeight - DECK_T - 0.15)
      warnings.push(`Стеллаж ${r.code} не помещается под настил уровня ${deck + 2}`);
  }
  return (
    <>
      <Section title="Мезонины">
        <Hint>
          Мезонин — несколько уровней хранения над полом: колонны, настилы, лестницы и ограждение. Стеллажи ставятся на
          уровни мезонина (вкладка «Стеллажи» → «Мезонин» и «Уровень»).
        </Hint>
        <Select
          label="Зона"
          value={zone?.id ?? ''}
          onChange={setZoneId}
          options={w.zones.map((z) => ({ value: z.id, label: `${z.code} · ${z.name}` }))}
        />
        <div className="tiles">
          <Tile art="mezzanine" title="Добавить мезонин" onClick={() => zone && st().addMezzanine(zone.id)} />
        </div>
        <div className="list">
          {w.mezzanines.map((m) => (
            <button
              key={m.id}
              className={`list-item ${mz?.id === m.id ? 'active' : ''}`}
              onClick={() => st().select({ kind: 'mezzanine', id: m.id })}
            >
              <span className="swatch" style={{ background: m.color }} />
              <span className="grow">
                {m.name} <span className="muted">({m.code})</span>
                <div className="muted small">
                  {fmt(m.length, 1)} × {fmt(m.width, 1)} м · {m.levels + 1} уровня · стеллажей{' '}
                  {w.racks.filter((r) => r.mezzanineId === m.id).length}
                </div>
              </span>
            </button>
          ))}
          {!w.mezzanines.length && <p className="muted small">Мезонинов пока нет.</p>}
        </div>
      </Section>
      {mz && (
        <Section
          title={`Мезонин: ${mz.name}`}
          actions={
            <button
              className="btn small danger"
              onClick={() =>
                st().ask(
                  `Удалить мезонин «${mz.name}»? Стеллажи останутся на полу.`,
                  () => (st().deleteMezzanine(mz.id), st().select(null)),
                )
              }
            >
              Удалить
            </button>
          }
        >
          <div className="grid3">
            <Text label="Название" value={mz.name} onChange={(v) => up({ name: v })} />
            <Text label="Код" value={mz.code} onChange={(v) => up({ code: v })} />
            <ColorField label="Цвет каркаса" value={mz.color} onChange={(v) => up({ color: v })} />
            <Num label="X центра" unit="м" value={mz.x} step={0.1} onChange={(v) => up({ x: v })} />
            <Num label="Y центра" unit="м" value={mz.y} step={0.1} onChange={(v) => up({ y: v })} />
            <Num
              label="Поворот"
              unit="°"
              value={mz.rotation}
              step={90}
              onChange={(v) => up({ rotation: ((v % 360) + 360) % 360 })}
            />
            <Num label="Длина" unit="м" value={mz.length} min={2} step={0.5} onChange={(v) => up({ length: v })} />
            <Num label="Ширина" unit="м" value={mz.width} min={2} step={0.5} onChange={(v) => up({ width: v })} />
            <Num
              label="Настилов над полом"
              value={mz.levels}
              min={1}
              max={5}
              onChange={(v) => up({ levels: Math.round(v) })}
            />
            <Num
              label="Высота уровня"
              unit="м"
              value={mz.levelHeight}
              min={2}
              step={0.1}
              onChange={(v) => up({ levelHeight: v })}
            />
            <Num
              label="Нагрузка на настил"
              unit="кг/м²"
              value={mz.deckLoad}
              min={100}
              step={50}
              onChange={(v) => up({ deckLoad: v })}
            />
            <Select
              label="Лестница"
              value={mz.stairs}
              onChange={(v) => up({ stairs: v })}
              options={[
                { value: 'start', label: 'С начала' },
                { value: 'end', label: 'С конца' },
              ]}
            />
          </div>
          <div className="metrics">
            <span>
              Уровней хранения: <b>{mz.levels + 1}</b>
            </span>
            {Array.from({ length: mz.levels }, (_, k) => (
              <span key={k}>
                Настил {k + 1}: <b>+{fmt((k + 1) * mz.levelHeight, 2)} м</b>
              </span>
            ))}
            <span>
              Допустимо на настил:{' '}
              <b>
                {((mz.deckLoad * mz.length * mz.width) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т
              </b>
            </span>
          </div>
          <Warn items={warnings} />
          <h4>Стеллажи на мезонине ({racks.length})</h4>
          <div className="list compact">
            {racks.map((r) => (
              <button
                key={r.id}
                className="list-item"
                onClick={() => (st().select({ kind: 'rack', id: r.id }), st().setStep('racks'))}
              >
                <span className="code">{r.code}</span>
                <span className="grow muted small">уровень {(r.deck ?? 1) + 1}</span>
              </button>
            ))}
          </div>
          <Hint>Мезонин перетаскивается на плане вместе со стеллажами.</Hint>
        </Section>
      )}
    </>
  );
}
