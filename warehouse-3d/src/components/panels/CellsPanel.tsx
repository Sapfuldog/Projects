import { useStore, useWarehouse } from '../../store';
import type { Cell, CellOverride, CellType } from '../../types';
import { duplicateAddresses, useCells, useConsumers, useMonitor } from '../../lib/derived';
import { CELL_TYPES } from '../../lib/materials';
import { RACK_SPEC, cellKey, defaultPlaces, rackContext } from '../../lib/rack';
import { toCSV } from '../../lib/snapshot';
import { RackFacade } from '../RackMap';
import { Check, Hint, Num, Section, Select, Text, Warn, download } from '../ui';

function CellEditor({ cell }: { cell: Cell }) {
  const w = useWarehouse()!;
  const consumers = useConsumers();
  const st = useStore.getState;
  const rack = w.racks.find((r) => r.id === cell.rackId)!;
  const key = cellKey(cell.section, cell.tier, cell.pos);
  const ov: CellOverride = rack.overrides[key] ?? {};
  const tier = rack.tiers[cell.tier - 1];
  const set = (patch: Partial<CellOverride>) => st().setCellOverride(rack.id, key, { ...ov, ...patch });
  const auto = defaultPlaces(cell.cellType, cell.width, cell.depth, cell.height);
  return (
    <Section
      title={`Ячейка ${cell.address}`}
      actions={
        Object.keys(ov).length ? (
          <button className="btn small" onClick={() => st().setCellOverride(rack.id, key, null)}>
            Сбросить
          </button>
        ) : undefined
      }
    >
      <div className="dims">
        <div>
          <span>Ш</span>
          <b>{cell.width}</b> мм
        </div>
        <div>
          <span>Г</span>
          <b>{cell.depth}</b> мм
        </div>
        <div>
          <span>В</span>
          <b>{cell.height}</b> мм
        </div>
        <div>
          <span>Низ</span>
          <b>+{cell.bottom.toFixed(2)}</b> м
        </div>
      </div>
      <div className="grid2">
        <Select<CellType>
          label="Тип ячейки"
          value={cell.cellType}
          onChange={(v) => set({ cellType: v === (tier.cellType ?? RACK_SPEC[rack.kind].cell) ? undefined : v })}
          options={(Object.keys(CELL_TYPES) as CellType[])
            .filter((t) => t !== 'virtual')
            .map((t) => ({ value: t, label: CELL_TYPES[t].title }))}
        />
        <Num
          label={`Мест (${CELL_TYPES[cell.cellType].placeUnit || 'по объёму'})`}
          value={cell.places}
          min={0}
          title={`По размерам: ${auto}`}
          onChange={(v) => set({ places: Math.round(v) })}
        />
        <Num
          label="Допустимая нагрузка"
          unit="кг"
          value={cell.maxLoad}
          min={0}
          step={10}
          onChange={(v) => set({ maxLoad: v === tier.maxLoad ? undefined : v })}
        />
        <Select
          label="Закреплена за кладовой"
          value={ov.reservedFor ?? ''}
          onChange={(v) => set({ reservedFor: v || undefined })}
          options={[
            { value: '', label: '—' },
            ...consumers.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
          ]}
        />
      </div>
      <Check
        label="Ячейка заблокирована (повреждение, ремонт, колонна)"
        checked={!!ov.blocked}
        onChange={(v) => set({ blocked: v || undefined })}
      />
      <Text label="Примечание" value={ov.note ?? ''} onChange={(v) => set({ note: v || undefined })} />
      <Hint>
        Принимает: {CELL_TYPES[cell.cellType].accepts.join(', ')}. Изменения свойств сразу проверяются правилами
        «Контроля».
      </Hint>
    </Section>
  );
}

/** Вкладка «Ячейки»: свойства ячеек выбранного стеллажа, адресация, выгрузка списка ячеек. */
export function CellsPanel() {
  const w = useWarehouse();
  const m = useMonitor();
  const { cells, byKey } = useCells();
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  if (!w || !m) return null;
  const rackId = selection?.kind === 'rack' ? selection.id : selection?.kind === 'cell' ? selection.rackId : undefined;
  const rack = rackId ? w.racks.find((r) => r.id === rackId) : undefined;
  const cell = selection?.kind === 'cell' ? byKey.get(selection.id) : undefined;
  const dups = duplicateAddresses(cells);
  const exportCells = () => {
    const rows = cells.map((c) => {
      const r = w.racks.find((x) => x.id === c.rackId);
      const ctx = r ? rackContext(w, r) : undefined;
      return [
        c.address,
        ctx?.room?.code,
        ctx?.zone?.code,
        r?.code,
        c.section,
        c.tier,
        c.pos,
        CELL_TYPES[c.cellType].title,
        c.width,
        c.depth,
        c.height,
        c.maxLoad,
        c.places,
        c.blocked ? 'да' : '',
        c.reservedFor ?? '',
      ];
    });
    download(
      `ячейки_${w.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`,
      toCSV(
        [
          'Адрес',
          'Помещение',
          'Зона',
          'Стеллаж',
          'Секция',
          'Ярус',
          'Место',
          'Тип',
          'Ш, мм',
          'Г, мм',
          'В, мм',
          'Нагрузка, кг',
          'Мест',
          'Блок',
          'Закреплена',
        ],
        rows,
      ),
      'text/csv;charset=utf-8',
    );
  };
  return (
    <>
      <Section title="Ячейки">
        <div className="metrics">
          <span>
            Всего ячеек: <b>{cells.length.toLocaleString('ru-RU')}</b>
          </span>
          {(Object.keys(m.stats.all.byType) as CellType[]).map((t) => (
            <span key={t}>
              {CELL_TYPES[t].short}: <b>{m.stats.all.byType[t]!.cells}</b>
            </span>
          ))}
        </div>
        <Text
          label="Шаблон адреса"
          value={w.addressTemplate}
          mono
          onChange={(v) => st().updateWarehouse({ addressTemplate: v })}
        />
        <div className="grid2">
          <Num
            label="Знаков в номерах"
            value={w.pad}
            min={1}
            max={4}
            onChange={(v) => st().updateWarehouse({ pad: Math.round(v) })}
          />
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <button className="btn small" onClick={exportCells}>
              Список ячеек CSV
            </button>
          </div>
        </div>
        {dups.length > 0 && (
          <Warn
            items={[
              `Повторяющиеся адреса: ${dups.slice(0, 6).join(', ')}${dups.length > 6 ? '…' : ''} — проверьте коды стеллажей`,
            ]}
          />
        )}
      </Section>
      {rack ? (
        <Section title={`Стеллаж ${rack.code}: типы ячеек`}>
          <RackFacade
            rack={rack}
            cells={m.idx.byRack.get(rack.id) ?? []}
            m={m}
            mode="type"
            selectedKey={cell?.key}
            onPick={(c) => st().select({ kind: 'cell', id: c.key, rackId: c.rackId })}
          />
          <div className="chips">
            {[...new Set((m.idx.byRack.get(rack.id) ?? []).map((c) => c.cellType))].map((t) => (
              <span key={t} className="chip">
                <i className="dot" style={{ background: CELL_TYPES[t].color }} />
                {CELL_TYPES[t].title}
              </span>
            ))}
          </div>
          <Hint>Щёлкните ячейку, чтобы задать её тип, число мест, нагрузку, блокировку или закрепить за кладовой.</Hint>
        </Section>
      ) : (
        <Section title="Стеллаж">
          <p className="muted">Выберите стеллаж на 3D или плане.</p>
        </Section>
      )}
      {cell && !cell.virtual && <CellEditor cell={cell} />}
    </>
  );
}
