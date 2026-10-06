import { useEffect, useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { Rack, RackKind, Tier, Warehouse, Zone } from '../../types';
import { generateRows, suggestCode, type GenParams } from '../../lib/layout';
import { bbox, fmt } from '../../lib/geometry';
import { uid } from '../../lib/demo';
import { RACK_SPEC, RACK_TEMPLATES, rackCellCount, rackHeight, rackLength, rackWarnings } from '../../lib/rack';
import { Check, Hint, Num, Section, Select, Text, Warn } from '../ui';
import { Tile } from './EquipmentPanel';

function TiersEditor({ rack, zone }: { rack: Rack; zone?: Zone }) {
  const st = useStore.getState;
  const [count, setCount] = useState(rack.tiers.length);
  const [height, setHeight] = useState(rack.tiers[0]?.height ?? 1500);
  const [cells, setCells] = useState(rack.tiers[0]?.cells ?? 3);
  const [load, setLoad] = useState(rack.tiers[0]?.maxLoad ?? 1000);
  const setTiers = (tiers: Tier[]) => st().updateRack(rack.id, { tiers });
  const setTier = (i: number, patch: Partial<Tier>) =>
    setTiers(rack.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const beam = RACK_SPEC[rack.kind].beam;

  const fitToZone = () => {
    if (!zone) return;
    const limit = zone.height * 1000;
    const base = rack.groundLevel ? 0 : beam;
    const n = Math.max(1, Math.floor((limit - base + beam) / (height + beam)));
    setCount(n);
    setTiers(Array.from({ length: n }, () => ({ height, cells, maxLoad: load })));
  };

  return (
    <>
      <div className="tiers">
        <div className="tiers-head">
          <span>Ярус</span>
          <span title="Высота яруса в свету = В ячейки">В, мм</span>
          <span title="Ячеек в одной секции">Ячеек</span>
          <span title="Грузоподъёмность одной ячейки">Г, кг</span>
          <span title="Длина ячейки = длина секции / число ячеек">Д, мм</span>
          <span />
        </div>
        {[...rack.tiers]
          .map((t, i) => ({ t, i }))
          .reverse()
          .map(({ t, i }) => (
            <div className="tiers-row" key={i}>
              <span className="muted">{i + 1}</span>
              <Num value={t.height} min={50} step={50} onChange={(v) => setTier(i, { height: v })} />
              <Num value={t.cells} min={1} max={50} onChange={(v) => setTier(i, { cells: Math.round(v) })} />
              <Num value={t.maxLoad} min={0} step={50} onChange={(v) => setTier(i, { maxLoad: v })} />
              <span className="muted small">{Math.round(rack.sectionLength / t.cells)}</span>
              <button
                className="icon-btn small"
                disabled={rack.tiers.length <= 1}
                title="Удалить ярус"
                onClick={() => setTiers(rack.tiers.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
      </div>
      <div className="row wrap">
        <button
          className="btn small"
          onClick={() =>
            setTiers([
              ...rack.tiers,
              { ...(rack.tiers[rack.tiers.length - 1] ?? { height: 1500, cells: 3, maxLoad: 1000 }) },
            ])
          }
        >
          + Ярус сверху
        </button>
      </div>
      <details className="details">
        <summary>Задать все ярусы одинаковыми</summary>
        <div className="grid4">
          <Num label="Ярусов" value={count} min={1} max={40} onChange={(v) => setCount(Math.round(v))} />
          <Num label="В, мм" value={height} min={50} step={50} onChange={setHeight} />
          <Num label="Ячеек" value={cells} min={1} max={50} onChange={(v) => setCells(Math.round(v))} />
          <Num label="Г, кг" value={load} min={0} step={50} onChange={setLoad} />
        </div>
        <div className="row wrap">
          <button
            className="btn small"
            onClick={() => setTiers(Array.from({ length: count }, () => ({ height, cells, maxLoad: load })))}
          >
            Применить
          </button>
          {zone && (
            <button
              className="btn small"
              onClick={fitToZone}
              title="Максимум ярусов такой высоты, который помещается в высоту зоны"
            >
              Максимум ярусов под высоту зоны ({zone.height} м)
            </button>
          )}
        </div>
      </details>
    </>
  );
}

function RackEditor({ rack, w }: { rack: Rack; w: Warehouse }) {
  const st = useStore.getState;
  const zone = w.zones.find((z) => z.id === rack.zoneId);
  const warnings = rackWarnings(w, rack);
  const dup = w.racks.some((r) => r.id !== rack.id && r.code === rack.code && r.zoneId === rack.zoneId);
  const up = (patch: Partial<Rack>) => st().updateRack(rack.id, patch);
  return (
    <Section
      title={`Стеллаж ${rack.code}`}
      actions={
        <>
          <button
            className="btn small"
            title="Копия рядом"
            onClick={() => {
              const a = (rack.rotation * Math.PI) / 180;
              const off = rack.depth / 1000 + 3;
              st().addRacks([
                {
                  ...JSON.parse(JSON.stringify(rack)),
                  id: uid('k'),
                  code: suggestCode(w),
                  x: Math.round((rack.x - Math.sin(a) * off) * 100) / 100,
                  y: Math.round((rack.y + Math.cos(a) * off) * 100) / 100,
                },
              ]);
            }}
          >
            Копия
          </button>
          <button className="btn small danger" onClick={() => (st().deleteRack(rack.id), st().select(null))}>
            Удалить
          </button>
        </>
      }
    >
      <div className="grid3">
        <Text label="Код стеллажа" value={rack.code} onChange={(v) => up({ code: v.trim() })} />
        <Select<RackKind>
          label="Тип"
          value={rack.kind}
          onChange={(v) => up({ kind: v })}
          options={(Object.keys(RACK_SPEC) as RackKind[]).map((k) => ({ value: k, label: RACK_SPEC[k].title }))}
        />
        <Select
          label="Зона"
          value={rack.zoneId}
          onChange={(v) => up({ zoneId: v })}
          options={w.zones.map((z) => ({ value: z.id, label: z.name }))}
        />
        <Num label="X центра" unit="м" value={rack.x} step={0.1} onChange={(v) => up({ x: v })} />
        <Num label="Y центра" unit="м" value={rack.y} step={0.1} onChange={(v) => up({ y: v })} />
        <Num
          label="Поворот"
          unit="°"
          value={rack.rotation}
          step={15}
          onChange={(v) => up({ rotation: ((v % 360) + 360) % 360 })}
        />
      </div>
      <div className="row wrap">
        {[0, 90, 180, 270].map((a) => (
          <button
            key={a}
            className={`btn small ${rack.rotation === a ? 'active' : ''}`}
            onClick={() => up({ rotation: a })}
          >
            {a}°
          </button>
        ))}
      </div>
      {dup && <Warn items={['Код повторяется в этой зоне — адреса ячеек будут совпадать']} />}

      <h4>Секции</h4>
      <div className="grid3">
        <Num label="Секций" value={rack.sections} min={1} max={200} onChange={(v) => up({ sections: Math.round(v) })} />
        <Num
          label="Длина секции (в свету)"
          unit="мм"
          value={rack.sectionLength}
          min={100}
          step={25}
          onChange={(v) => up({ sectionLength: v })}
        />
        <Num
          label="Глубина = Ш ячейки"
          unit="мм"
          value={rack.depth}
          min={100}
          step={50}
          onChange={(v) => up({ depth: v })}
        />
      </div>
      <Check
        label="Нижний ярус на полу (без балки)"
        checked={rack.groundLevel}
        onChange={(v) => up({ groundLevel: v })}
      />

      <h4>Ярусы и ячейки (сверху вниз)</h4>
      <TiersEditor key={rack.id} rack={rack} zone={zone} />

      <div className="metrics">
        <span>
          Габарит:{' '}
          <b>
            {fmt(rackLength(rack) / 1000)} × {fmt(rack.depth / 1000)} × {fmt(rackHeight(rack) / 1000)} м
          </b>
        </span>
        <span>
          Ячеек: <b>{rackCellCount(rack)}</b>
        </span>
        <span>
          Г стеллажа:{' '}
          <b>
            {((rack.sections * rack.tiers.reduce((s, t) => s + t.cells * t.maxLoad, 0)) / 1000).toLocaleString('ru-RU')}{' '}
            т
          </b>
        </span>
      </div>
      <Warn items={warnings} />
      <div className="row">
        <button className="btn small" onClick={() => st().setStep('cells')}>
          Ячейки стеллажа →
        </button>
      </div>
    </Section>
  );
}

export function RacksPanel() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  const rack = w && selection?.kind === 'rack' ? w.racks.find((r) => r.id === selection.id) : undefined;
  const [zoneId, setZoneId] = useState<string>('');
  const [showGen, setShowGen] = useState(false);
  const [gen, setGen] = useState<GenParams>({
    template: RACK_TEMPLATES[0].id,
    orientation: 0,
    rows: 4,
    auto: true,
    backToBack: true,
    aisle: 3.2,
    backGap: 0.2,
    margin: 1,
    sections: 10,
    autoSections: true,
    startCode: 'A',
  });

  useEffect(() => {
    if (rack) setZoneId(rack.zoneId);
  }, [rack]);
  useEffect(() => {
    if (w && !w.zones.some((z) => z.id === zoneId))
      setZoneId(w.zones.find((z) => z.type === 'rack')?.id ?? w.zones[0]?.id ?? '');
  }, [w, zoneId]);

  if (!w) return null;
  if (!w.zones.length) {
    return (
      <Section title="Стеллажи">
        <p className="muted">Сначала создайте зону размещения — стеллажи ставятся в зоны.</p>
        <button className="btn" onClick={() => st().setStep('zones')}>
          ← К зонам
        </button>
      </Section>
    );
  }
  const zone = w.zones.find((z) => z.id === zoneId);
  const g = (patch: Partial<GenParams>) => setGen((p) => ({ ...p, ...patch }));
  const preview = zone ? generateRows(zone, gen) : [];

  const addSingle = (templateId: string) => {
    if (!zone) return;
    const tpl = RACK_TEMPLATES.find((t) => t.id === templateId)!;
    const b = bbox(zone.points);
    st().addRacks([
      {
        id: uid('k'),
        zoneId: zone.id,
        code: suggestCode(w),
        x: Math.round(((b.minX + b.maxX) / 2) * 10) / 10,
        y: Math.round(((b.minY + b.maxY) / 2) * 10) / 10,
        rotation: 0,
        ...JSON.parse(JSON.stringify(tpl.rack)),
        sections: Math.min(
          tpl.rack.sections,
          Math.max(1, Math.floor((b.maxX - b.minX - 2) / (tpl.rack.sectionLength / 1000 + 0.1))),
        ),
        overrides: {},
      },
    ]);
  };

  const racksInZone = w.racks.filter((r) => r.zoneId === zoneId);

  return (
    <>
      <Section title="Стеллажи">
        <Select
          label="Зона размещения"
          value={zoneId}
          onChange={setZoneId}
          options={w.zones.map((z) => ({ value: z.id, label: `${z.name} (≤ ${z.height} м)` }))}
        />
        <div className="tiles">
          {RACK_TEMPLATES.map((t) => (
            <Tile
              key={t.id}
              art={t.rack.kind === 'shelf' ? 'rack-shelf' : t.id === 'pallet-3' ? 'rack-pallet' : 'rack-pallet2'}
              title={`${t.title.split(':')[0]} ${t.rack.sectionLength}`}
              hint={t.title}
              onClick={() => addSingle(t.id)}
            />
          ))}
          <Tile
            art="rack-rows"
            title="Ряды стеллажей"
            hint="Генератор рядов"
            active={showGen}
            onClick={() => setShowGen(!showGen)}
          />
        </div>
        <Hint>Стеллаж можно перетаскивать на плане. Размеры и ярусы настраиваются ниже после выбора стеллажа.</Hint>
      </Section>

      {showGen && (
        <Section title="Генератор рядов">
          <Select
            label="Шаблон стеллажа"
            value={gen.template}
            onChange={(v) => g({ template: v })}
            options={RACK_TEMPLATES.map((t) => ({ value: t.id, label: t.title }))}
          />
          <div className="grid3">
            <Select<0 | 90>
              label="Ряды вдоль"
              value={gen.orientation}
              onChange={(v) => g({ orientation: v })}
              options={[
                { value: 0, label: 'оси X (→)' },
                { value: 90, label: 'оси Y (↓)' },
              ]}
            />
            <Num label="Проход" unit="м" value={gen.aisle} min={0.5} step={0.1} onChange={(v) => g({ aisle: v })} />
            <Num
              label="Отступ от края"
              unit="м"
              value={gen.margin}
              min={0}
              step={0.1}
              onChange={(v) => g({ margin: v })}
            />
            <Text
              label="Код первого ряда"
              value={gen.startCode}
              onChange={(v) => g({ startCode: v.trim().toUpperCase() })}
            />
            <Num
              label="Рядов"
              value={gen.rows}
              min={1}
              max={200}
              disabled={gen.auto}
              onChange={(v) => g({ rows: Math.round(v) })}
            />
            <Num
              label="Секций в ряду"
              value={gen.sections}
              min={1}
              max={200}
              disabled={gen.autoSections}
              onChange={(v) => g({ sections: Math.round(v) })}
            />
          </div>
          <div className="row wrap">
            <Check label="Сколько поместится рядов" checked={gen.auto} onChange={(v) => g({ auto: v })} />
            <Check label="Секций — по длине зоны" checked={gen.autoSections} onChange={(v) => g({ autoSections: v })} />
            <Check label="Спина к спине" checked={gen.backToBack} onChange={(v) => g({ backToBack: v })} />
          </div>
          <div className="row wrap">
            <button className="btn primary" disabled={!preview.length} onClick={() => st().addRacks(preview)}>
              Создать {preview.length} рядов × {preview[0]?.sections ?? 0} секций
            </button>
            {racksInZone.length > 0 && (
              <button
                className="btn small danger"
                onClick={() => {
                  if (!confirm(`Удалить все стеллажи зоны (${racksInZone.length})?`)) return;
                  st().deleteRacks(racksInZone.map((r) => r.id));
                }}
              >
                Очистить зону
              </button>
            )}
          </div>
          <Hint>
            Ряды раскладываются в габарите зоны. Для зон сложной формы проверьте результат на плане — предупреждения
            появятся у стеллажей, вышедших за границы.
          </Hint>
        </Section>
      )}

      <Section title={`Стеллажи зоны (${racksInZone.length})`}>
        <div className="list compact">
          {racksInZone.map((r) => {
            const warn = rackWarnings(w, r).length > 0;
            return (
              <button
                key={r.id}
                className={`list-item ${rack?.id === r.id ? 'active' : ''}`}
                onClick={() => st().select({ kind: 'rack', id: r.id })}
              >
                <span className="code">{r.code}</span>
                <span className="grow muted small">
                  {r.sections} секц. × {r.tiers.length} яр. · {rackCellCount(r)} яч.
                </span>
                <span className="muted small">{fmt(rackHeight(r) / 1000)} м</span>
                {warn && <span title="Есть предупреждения">⚠</span>}
              </button>
            );
          })}
        </div>
      </Section>

      {rack && <RackEditor rack={rack} w={w} />}
    </>
  );
}
