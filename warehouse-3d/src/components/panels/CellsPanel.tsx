import { useEffect, useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import { duplicateAddresses, useCells, useFills } from '../../lib/derived';
import { RACK_SPEC, cellKey, formatAddress, rackContext, rackHeight, rackLength, tierBases } from '../../lib/rack';
import { COLOR_BLOCKED, fillColor, toCSV } from '../../lib/fill';
import type { Cell, Rack, Warehouse } from '../../types';
import { Check, Hint, Num, Section, Select, Text, Warn, download } from '../ui';

/** Фасад стеллажа: секции × ярусы, клик выбирает ячейку. */
export function RackFacade({ rack, cells, selectedKey }: { rack: Rack; cells: Cell[]; selectedKey?: string }) {
  const fills = useFills();
  const st = useStore.getState;
  const spec = RACK_SPEC[rack.kind];
  const L = rackLength(rack);
  const H = rackHeight(rack);
  const bases = tierBases(rack);
  const k = Math.max(240 / Math.max(H, 1), 46 / rack.sectionLength);
  const pad = 18;
  const Wpx = L * k + pad * 2;
  const Hpx = H * k + pad * 2;
  const y = (mm: number) => pad + (H - mm) * k;
  const x = (mm: number) => pad + mm * k;
  const byKey = new Map(cells.map((c) => [`${c.section}.${c.tier}.${c.pos}`, c]));

  const items: React.ReactElement[] = [];
  for (let s = 0; s <= rack.sections; s++) {
    const ux = s * (rack.sectionLength + spec.upright);
    items.push(
      <rect
        key={`u${s}`}
        x={x(ux)}
        y={y(H)}
        width={Math.max(1.5, spec.upright * k)}
        height={H * k}
        className="fac-upright"
      />,
    );
  }
  for (let s = 1; s <= rack.sections; s++) {
    const sx = spec.upright + (s - 1) * (rack.sectionLength + spec.upright);
    items.push(
      <text key={`sn${s}`} x={x(sx + rack.sectionLength / 2)} y={Hpx - 4} className="fac-num" textAnchor="middle">
        {s}
      </text>,
    );
    rack.tiers.forEach((tier, ti) => {
      const t = ti + 1;
      if (!(ti === 0 && rack.groundLevel)) {
        items.push(
          <rect
            key={`b${s}.${t}`}
            x={x(sx)}
            y={y(bases[ti])}
            width={rack.sectionLength * k}
            height={Math.max(1.5, spec.beam * k)}
            className="fac-beam"
          />,
        );
      }
      const cl = rack.sectionLength / tier.cells;
      for (let p = 1; p <= tier.cells; p++) {
        const key = cellKey(s, t, p);
        const c = byKey.get(key);
        if (!c) continue;
        const f = fills[c.address];
        const sel = selectedKey === c.key;
        const cx = x(sx + (p - 1) * cl) + 1;
        const cw = cl * k - 2;
        const ch = tier.height * k - 2;
        const cy = y(bases[ti] + tier.height) + 1;
        items.push(
          <g key={key} className="fac-cell" onClick={() => st().select({ kind: 'cell', id: c.key, rackId: rack.id })}>
            <rect
              x={cx}
              y={cy}
              width={cw}
              height={ch}
              className={`fac-cell-box ${sel ? 'sel' : ''}`}
              fill={c.blocked ? COLOR_BLOCKED : 'transparent'}
            />
            {f && f.fill > 0 && !c.blocked && (
              <rect
                x={cx + 1}
                y={cy + ch * (1 - f.fill)}
                width={cw - 2}
                height={ch * f.fill}
                fill={fillColor(f.fill)}
                opacity={0.85}
                pointerEvents="none"
              />
            )}
            {cw > 22 && ch > 12 && (
              <text
                x={cx + cw / 2}
                y={cy + ch / 2}
                className="fac-cell-text"
                textAnchor="middle"
                dominantBaseline="central"
                pointerEvents="none"
              >
                {c.blocked ? '✕' : p}
              </text>
            )}
            <title>
              {c.address} · {c.length}×{c.width}×{c.height} мм · Г {c.maxLoad} кг{c.blocked ? ' · заблокирована' : ''}
              {f ? ` · ${Math.round(f.fill * 100)}%` : ''}
            </title>
          </g>,
        );
      }
    });
  }
  rack.tiers.forEach((_, ti) => {
    items.push(
      <text
        key={`tn${ti}`}
        x={4}
        y={y(bases[ti] + rack.tiers[ti].height / 2)}
        className="fac-num"
        dominantBaseline="central"
      >
        {ti + 1}
      </text>,
    );
  });

  return (
    <div className="facade">
      <svg width={Wpx} height={Hpx}>
        <line x1={pad} x2={Wpx - pad} y1={y(0)} y2={y(0)} className="fac-floor" />
        {items}
      </svg>
    </div>
  );
}

function CellEditor({ w, cell }: { w: Warehouse; cell: Cell }) {
  const st = useStore.getState;
  const fill = useFills()[cell.address];
  const rack = w.racks.find((r) => r.id === cell.rackId)!;
  const key = cellKey(cell.section, cell.tier, cell.pos);
  const ov = rack.overrides[key] ?? {};
  const tier = rack.tiers[cell.tier - 1];
  const set = (patch: Partial<typeof ov>) => st().setCellOverride(rack.id, key, { ...ov, ...patch });
  return (
    <Section title={`Ячейка ${cell.address}`}>
      <div className="dims">
        <div>
          <span>Д</span>
          <b>{cell.length}</b> мм
        </div>
        <div>
          <span>Ш</span>
          <b>{cell.width}</b> мм
        </div>
        <div>
          <span>В</span>
          <b>{cell.height}</b> мм
        </div>
        <div>
          <span>Г</span>
          <b>{cell.maxLoad}</b> кг
        </div>
      </div>
      <div className="muted small">
        Секция {cell.section}, ярус {cell.tier}, место {cell.pos}. Объём{' '}
        {((cell.length * cell.width * cell.height) / 1e9).toFixed(2)} м³. Д, Ш, В задаются стеллажом и ярусом; Г и
        блокировку можно изменить для отдельной ячейки.
      </div>
      <div className="grid2">
        <Num
          label={`Г ячейки (ярус: ${tier?.maxLoad} кг)`}
          unit="кг"
          value={cell.maxLoad}
          min={0}
          step={50}
          onChange={(v) => set({ maxLoad: v === tier?.maxLoad ? undefined : v })}
        />
        <Text label="Примечание" value={ov.note ?? ''} onChange={(v) => set({ note: v || undefined })} />
      </div>
      <Check
        label="Ячейка заблокирована (не используется)"
        checked={!!ov.blocked}
        onChange={(v) => set({ blocked: v || undefined })}
      />
      {fill && (
        <div className="metrics">
          <span>
            Заполнение: <b>{Math.round(fill.fill * 100)}%</b>
          </span>
          {fill.weight !== undefined && (
            <span>
              Вес: <b>{fill.weight} кг</b>
            </span>
          )}
          {fill.sku && (
            <span>
              Товар: <b>{fill.sku}</b>
            </span>
          )}
        </div>
      )}
      {Object.keys(ov).length > 0 && (
        <button className="btn small" onClick={() => st().setCellOverride(rack.id, key, null)}>
          Сбросить индивидуальные настройки
        </button>
      )}
    </Section>
  );
}

export function CellsPanel() {
  const w = useWarehouse();
  const selection = useStore((s) => s.selection);
  const { cells } = useCells();
  const st = useStore.getState;
  const selectedRackId =
    selection?.kind === 'rack' ? selection.id : selection?.kind === 'cell' ? selection.rackId : undefined;
  const [rackId, setRackId] = useState(selectedRackId ?? '');
  useEffect(() => {
    if (selectedRackId) setRackId(selectedRackId);
  }, [selectedRackId]);
  useEffect(() => {
    if (w && !w.racks.some((r) => r.id === rackId)) setRackId(w.racks[0]?.id ?? '');
  }, [w, rackId]);
  if (!w) return null;

  const rack = w.racks.find((r) => r.id === rackId);
  const rackCellsList = rack ? cells.filter((c) => c.rackId === rack.id) : [];
  const cell = selection?.kind === 'cell' ? cells.find((c) => c.key === selection.id) : undefined;
  const dups = duplicateAddresses(cells);
  const sample = rack
    ? formatAddress(w.addressTemplate, w.pad, {
        room: rackContext(w, rack).room?.code,
        zone: rackContext(w, rack).zone?.code,
        rack: rack.code,
        section: 1,
        tier: 2,
        cell: 3,
      })
    : '';

  const exportCSV = () => {
    const rackById = new Map(w.racks.map((r) => [r.id, r]));
    const rows = cells.map((c) => {
      const r = rackById.get(c.rackId)!;
      const { room, zone } = rackContext(w, r);
      return [
        c.address,
        room?.name,
        zone?.name,
        r.code,
        c.section,
        c.tier,
        c.pos,
        c.length,
        c.width,
        c.height,
        c.maxLoad,
        c.blocked ? 'да' : '',
        c.note,
      ];
    });
    download(
      `ячейки_${w.name}.csv`,
      toCSV(
        [
          'Адрес',
          'Помещение',
          'Зона',
          'Стеллаж',
          'Секция',
          'Ярус',
          'Ячейка',
          'Д, мм',
          'Ш, мм',
          'В, мм',
          'Г, кг',
          'Заблокирована',
          'Примечание',
        ],
        rows,
      ),
      'text/csv;charset=utf-8',
    );
  };

  if (!w.racks.length) {
    return (
      <Section title="Ячейки">
        <p className="muted">Сначала создайте стеллажи — ячейки формируются из их секций и ярусов.</p>
        <button className="btn" onClick={() => st().setStep('racks')}>
          ← К стеллажам
        </button>
      </Section>
    );
  }

  return (
    <>
      <Section
        title={`Ячейки объекта: ${cells.length.toLocaleString('ru-RU')}`}
        actions={
          <button className="btn small" onClick={exportCSV}>
            Выгрузить CSV
          </button>
        }
      >
        <div className="grid2">
          <Text
            label="Шаблон адреса"
            mono
            value={w.addressTemplate}
            onChange={(v) => st().updateWarehouse({ addressTemplate: v || '{rack}-{section}-{tier}-{cell}' })}
          />
          <Num
            label="Знаков в номере"
            value={w.pad}
            min={1}
            max={4}
            onChange={(v) => st().updateWarehouse({ pad: Math.round(v) })}
          />
        </div>
        <Hint>
          Метки: <code>{'{room}'}</code> помещение, <code>{'{zone}'}</code> зона, <code>{'{rack}'}</code> стеллаж,{' '}
          <code>{'{section}'}</code> секция, <code>{'{tier}'}</code> ярус, <code>{'{cell}'}</code> место. Пример:{' '}
          <b className="mono">{sample}</b>. Адрес должен совпадать с адресом ячейки в учётной системе.
        </Hint>
        <Warn
          items={
            dups.length
              ? [`Повторяющиеся адреса: ${dups.slice(0, 5).join(', ')}${dups.length > 5 ? '…' : ''} (${dups.length})`]
              : []
          }
        />
      </Section>

      <Section title="Фасад стеллажа">
        <Select
          label="Стеллаж"
          value={rackId}
          onChange={(v) => {
            setRackId(v);
            st().select({ kind: 'rack', id: v });
          }}
          options={w.racks.map((r) => ({
            value: r.id,
            label: `${r.code} — ${w.zones.find((z) => z.id === r.zoneId)?.name ?? ''}`,
          }))}
        />
        {rack && <RackFacade rack={rack} cells={rackCellsList} selectedKey={cell?.key} />}
        <Hint>Щёлкните по ячейке на фасаде или в 3D, чтобы посмотреть и изменить её параметры.</Hint>
      </Section>

      {cell && <CellEditor w={w} cell={cell} />}

      {rack && (
        <Section title={`Ячейки стеллажа ${rack.code} (${rackCellsList.length})`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Адрес</th>
                  <th>Д×Ш×В, мм</th>
                  <th>Г, кг</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rackCellsList.map((c) => (
                  <tr
                    key={c.key}
                    className={cell?.key === c.key ? 'active' : ''}
                    onClick={() => st().select({ kind: 'cell', id: c.key, rackId: c.rackId })}
                  >
                    <td className="mono">{c.address}</td>
                    <td>
                      {c.length}×{c.width}×{c.height}
                    </td>
                    <td>{c.maxLoad}</td>
                    <td>{c.blocked ? '✕' : c.note ? '✎' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
