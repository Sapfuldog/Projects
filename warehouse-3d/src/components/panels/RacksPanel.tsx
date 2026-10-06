import { useEffect, useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { CellType, Rack, RackKind, Tier, Warehouse, Zone } from '../../types';
import { generateRows, suggestCode, type GenParams } from '../../lib/layout';
import { bbox, fmt } from '../../lib/geometry';
import { uid } from '../../lib/demo';
import { CELL_TYPES } from '../../lib/materials';
import {
  RACK_SPEC,
  RACK_TEMPLATES,
  defaultPlaces,
  rackCellCount,
  rackContext,
  rackDepth,
  rackHeight,
  rackLength,
  rackWarnings,
  tierCellType,
} from '../../lib/rack';
import { Check, Hint, Num, Section, Select, Text, Warn } from '../ui';
import { Tile } from './EquipmentPanel';

const CELL_TYPE_OPTIONS = (Object.keys(CELL_TYPES) as CellType[])
  .filter((t) => t !== 'virtual')
  .map((t) => ({ value: t, label: CELL_TYPES[t].title }));

function TiersEditor({ rack, zone }: { rack: Rack; zone?: Zone }) {
  const st = useStore.getState;
  const spec = RACK_SPEC[rack.kind];
  const [count, setCount] = useState(rack.tiers.length);
  const [height, setHeight] = useState(rack.tiers[0]?.height ?? 1500);
  const [cells, setCells] = useState(rack.tiers[0]?.cells ?? 3);
  const [load, setLoad] = useState(rack.tiers[0]?.maxLoad ?? 1000);
  const setTiers = (tiers: Tier[]) => st().updateRack(rack.id, { tiers });
  const setTier = (i: number, patch: Partial<Tier>) =>
    setTiers(rack.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const cellW = (t: Tier) => (spec.across ? rack.sectionLength : Math.round(rack.sectionLength / Math.max(1, t.cells)));
  const cellD = (t: Tier) =>
    spec.across && rack.kind !== 'cantilever' ? Math.round(rack.depth / Math.max(1, t.cells)) : rack.depth;

  const fitToZone = () => {
    if (!zone) return;
    const limit = (rack.mezzanineId ? 3000 : zone.height * 1000) - spec.base;
    const base = rack.groundLevel ? 0 : spec.beam;
    const n = Math.max(1, Math.floor((limit - base + spec.beam) / (height + spec.beam)));
    setCount(n);
    setTiers(Array.from({ length: n }, () => ({ height, cells, maxLoad: load, cellType: rack.tiers[0]?.cellType })));
  };

  return (
    <>
      <div className="tiers2">
        <div className="tiers2-head">
          <span>Ярус</span>
          <span title="Высота яруса в свету = В ячейки">В, мм</span>
          <span title={spec.across ? 'Ячеек в секции: стороны консоли или ряды мест' : 'Ячеек в секции на ярусе'}>
            Яч.
          </span>
          <span title="Допустимая нагрузка на ячейку">Нагр., кг</span>
          <span>Тип ячеек</span>
          <span title="Мест (паллет, коробов, баллонов) в ячейке; пусто — по размерам, 0 — без мест">Мест</span>
          <span title="Ш × Г ячейки">Ш×Г, мм</span>
          <span />
        </div>
        {[...rack.tiers]
          .map((t, i) => ({ t, i }))
          .reverse()
          .map(({ t, i }) => {
            const type = tierCellType(rack, t);
            const auto = defaultPlaces(type, cellW(t), cellD(t), t.height);
            return (
              <div className="tiers2-row" key={i}>
                <span className="muted">{i + 1}</span>
                <Num value={t.height} min={50} step={50} onChange={(v) => setTier(i, { height: v })} />
                <Num value={t.cells} min={1} max={50} onChange={(v) => setTier(i, { cells: Math.round(v) })} />
                <Num value={t.maxLoad} min={0} step={50} onChange={(v) => setTier(i, { maxLoad: v })} />
                <select
                  className="input"
                  value={type}
                  onChange={(e) => setTier(i, { cellType: e.target.value as CellType })}
                >
                  {CELL_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder={String(auto)}
                  value={t.places ?? ''}
                  onChange={(e) =>
                    setTier(i, {
                      places: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))),
                    })
                  }
                />
                <span className="muted small">
                  {cellW(t)}×{cellD(t)}
                </span>
                <button
                  className="icon-btn small"
                  disabled={rack.tiers.length <= 1}
                  title="Удалить ярус"
                  onClick={() => setTiers(rack.tiers.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            );
          })}
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
          <Num label="Нагр., кг" value={load} min={0} step={50} onChange={setLoad} />
        </div>
        <div className="row wrap">
          <button
            className="btn small"
            onClick={() =>
              setTiers(
                Array.from({ length: count }, () => ({
                  height,
                  cells,
                  maxLoad: load,
                  cellType: rack.tiers[0]?.cellType,
                })),
              )
            }
          >
            Применить
          </button>
          {zone && (
            <button
              className="btn small"
              onClick={fitToZone}
              title="Максимум ярусов такой высоты под высоту зоны (или уровня мезонина)"
            >
              Максимум ярусов под высоту {rack.mezzanineId ? 'уровня мезонина' : `зоны (${zone.height} м)`}
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
  const ctx = rackContext(w, rack);
  const warnings = rackWarnings(w, rack);
  const dup = w.racks.some((r) => r.id !== rack.id && r.code === rack.code);
  const up = (patch: Partial<Rack>) => st().updateRack(rack.id, patch);
  const cellsLoad = rack.sections * rack.tiers.reduce((s, t) => s + t.cells * t.maxLoad, 0);
  const mezzanines = w.mezzanines.filter((m) => m.zoneId === rack.zoneId);
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
              const off = rackDepth(rack) / 1000 + 3;
              st().addRacks([
                {
                  ...JSON.parse(JSON.stringify(rack)),
                  id: uid('k'),
                  code: suggestCode(w),
                  x: Math.round((rack.x - Math.sin(a) * off) * 100) / 100,
                  y: Math.round((rack.y + Math.cos(a) * off) * 100) / 100,
                  overrides: {},
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
          label="Вид"
          value={rack.kind}
          onChange={(v) => up({ kind: v, groundLevel: v !== 'shelf' })}
          options={(Object.keys(RACK_SPEC) as RackKind[]).map((k) => ({ value: k, label: RACK_SPEC[k].title }))}
        />
        <Select
          label="Зона"
          value={rack.zoneId}
          onChange={(v) => up({ zoneId: v, mezzanineId: undefined, deck: undefined })}
          options={w.zones.map((z) => ({ value: z.id, label: `${z.code} · ${z.name}` }))}
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
      {dup && <Warn items={['Код повторяется — адреса ячеек будут совпадать']} />}

      {mezzanines.length > 0 && (
        <div className="grid2">
          <Select
            label="Мезонин"
            value={rack.mezzanineId ?? ''}
            onChange={(v) => up({ mezzanineId: v || undefined, deck: v ? (rack.deck ?? 1) : undefined })}
            options={[{ value: '', label: 'На полу' }, ...mezzanines.map((m) => ({ value: m.id, label: m.name }))]}
          />
          {rack.mezzanineId && (
            <Select
              label="Уровень"
              value={rack.deck ?? 1}
              onChange={(v) => up({ deck: v })}
              options={Array.from(
                { length: (mezzanines.find((m) => m.id === rack.mezzanineId)?.levels ?? 1) + 1 },
                (_, k) => ({
                  value: k,
                  label: k === 0 ? 'Уровень 1 (под настилом)' : `Уровень ${k + 1} (настил ${k})`,
                }),
              )}
            />
          )}
        </div>
      )}

      <h4>Секции {RACK_SPEC[rack.kind].across ? '(для консолей и пола — пролёты)' : ''}</h4>
      <div className="grid3">
        <Num label="Секций" value={rack.sections} min={1} max={200} onChange={(v) => up({ sections: Math.round(v) })} />
        <Num
          label="Ширина секции в свету (Ш)"
          unit="мм"
          value={rack.sectionLength}
          min={100}
          step={25}
          onChange={(v) => up({ sectionLength: v })}
        />
        <Num
          label={rack.kind === 'cantilever' ? 'Вылет консоли (Г)' : 'Глубина (Г)'}
          unit="мм"
          value={rack.depth}
          min={100}
          step={50}
          onChange={(v) => up({ depth: v })}
        />
      </div>
      <div className="row wrap">
        {rack.kind !== 'floor' && rack.kind !== 'cantilever' && (
          <Check
            label="Нижний ярус на полу (без балки)"
            checked={rack.groundLevel}
            onChange={(v) => up({ groundLevel: v })}
          />
        )}
        {rack.kind === 'cantilever' && (
          <Check label="Двусторонний" checked={!!rack.doubleSided} onChange={(v) => up({ doubleSided: v })} />
        )}
      </div>

      <h4>Нагрузки</h4>
      <div className="grid2">
        <Num
          label="Допустимая на секцию (раму)"
          unit="кг"
          value={rack.sectionLoad ?? 0}
          min={0}
          step={100}
          onChange={(v) => up({ sectionLoad: v || undefined })}
        />
        <Num
          label="Допустимая на стеллаж"
          unit="кг"
          value={rack.maxLoad ?? 0}
          min={0}
          step={500}
          onChange={(v) => up({ maxLoad: v || undefined })}
        />
      </div>
      <Hint>
        Нагрузка на ячейку задаётся по ярусам ниже. 0 — не ограничено. Перегрузы видны в «Контроле» и в режиме окраски
        «Нагрузка».
      </Hint>

      <h4>Ярусы и ячейки (сверху вниз)</h4>
      <TiersEditor key={rack.id} rack={rack} zone={zone} />

      <div className="metrics">
        <span>
          Габарит Д×Г×В:{' '}
          <b>
            {fmt(rackLength(rack) / 1000)} × {fmt(rackDepth(rack) / 1000)} × {fmt(rackHeight(rack) / 1000)} м
          </b>
        </span>
        <span>
          Основание: <b>+{fmt(ctx.base)} м</b>
        </span>
        <span>
          Ячеек: <b>{rackCellCount(rack)}</b>
        </span>
        <span>
          Сумма нагрузок ячеек: <b>{(cellsLoad / 1000).toLocaleString('ru-RU')} т</b>
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

const ART: Record<RackKind, string> = {
  pallet: 'rack-pallet',
  shelf: 'rack-shelf',
  cantilever: 'rack-cantilever',
  floor: 'rack-floor',
  cylinder: 'rack-cylinder',
};

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
      <Section title="Стеллажи и места хранения">
        <Select
          label="Зона размещения"
          value={zoneId}
          onChange={setZoneId}
          options={w.zones.map((z) => ({ value: z.id, label: `${z.code} · ${z.name} (≤ ${z.height} м)` }))}
        />
        <div className="tiles">
          {RACK_TEMPLATES.map((t) => (
            <Tile
              key={t.id}
              art={ART[t.rack.kind]}
              title={t.title.split(':')[0]}
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
        <Hint>
          Паллетный — паллетоместа; полочный — коробочное или штучное хранение (инструмент); консольный — длинномер
          (трубы, профиль); напольное — штабели листа, крупные узлы, барабаны кабеля; баллонная стойка — газовые
          баллоны.
        </Hint>
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
                onClick={() =>
                  st().ask(`Удалить все стеллажи зоны (${racksInZone.length})?`, () =>
                    st().deleteRacks(racksInZone.map((r) => r.id)),
                  )
                }
              >
                Очистить зону
              </button>
            )}
          </div>
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
                  {RACK_SPEC[r.kind].title} · {r.sections}×{r.tiers.length} · {rackCellCount(r)} яч.
                  {r.mezzanineId ? ` · ур. ${(r.deck ?? 1) + 1}` : ''}
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
