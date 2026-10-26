import { useStore, useWarehouse } from '../../store';
import type { Cell, CellOverride, CellType } from '../../types';
import { duplicateAddresses, useCells, useConsumers, useMonitor } from '../../lib/derived';
import { CELL_TYPES } from '../../lib/materials';
import { RACK_SPEC, cellKey, defaultPlaces, rackContext } from '../../lib/rack';
import { toCSV } from '../../lib/snapshot';
import { RackFacade } from '../RackMap';
import { Check, Hint, Num, Section, Select, Text, Warn, download } from '../ui';

/** Ячейка вошла в объединённую: её свойства — у объединённой, здесь — перейти к ней или разъединить. */
function MergedPart({ cell, main }: { cell: Cell; main: Cell }) {
  const w = useWarehouse()!;
  const st = useStore.getState;
  const rack = w.racks.find((r) => r.id === main.rackId)!;
  const key = cellKey(main.section, main.tier, main.pos);
  return (
    <Section title={`Ячейка ${cell.address}`}>
      <p>
        Входит в объединённую ячейку <b className="mono">{main.address}</b> ({main.width} × {main.depth} × {main.height}{' '}
        мм): отдельно не используется и заблокирована.
      </p>
      <div className="chips">
        <button className="btn small" onClick={() => st().select({ kind: 'cell', id: main.key, rackId: main.rackId })}>
          Открыть {main.address}
        </button>
        <button
          className="btn small"
          onClick={() =>
            st().setCellOverride(rack.id, key, { ...rack.overrides[key], mergeRight: undefined, mergeUp: undefined })
          }
        >
          Разъединить
        </button>
      </div>
    </Section>
  );
}

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
  // Сколько можно забрать: места справа до края секции; ярусы выше — с тем же делением на ячейки
  const maxRight = rack.kind === 'cantilever' ? 0 : tier.cells - cell.pos;
  let maxUp = 0;
  while (rack.tiers[cell.tier + maxUp]?.cells === tier.cells) maxUp++;
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
      {(maxRight > 0 || maxUp > 0) && (
        <>
          <div className="field-label">Объединить с соседними — увеличить ячейку за счёт соседних</div>
          <div className="grid2">
            <Num
              label="Ячеек справа"
              value={ov.mergeRight ?? 0}
              min={0}
              max={maxRight}
              disabled={!maxRight}
              onChange={(v) => set({ mergeRight: Math.round(v) || undefined, places: undefined })}
            />
            <Num
              label="Ярусов вверх"
              value={ov.mergeUp ?? 0}
              min={0}
              max={maxUp}
              disabled={!maxUp}
              onChange={(v) => set({ mergeUp: Math.round(v) || undefined, places: undefined })}
            />
          </div>
          {cell.merged && (
            <Hint>
              Сейчас {cell.width} × {cell.depth} × {cell.height} мм, мест {cell.places}, нагрузка {cell.maxLoad} кг.
              Соседние ячейки вошли в эту и заблокированы
              {cell.merged.up && cell.merged.right + 1 === tier.cells ? '; балки между ярусами в секции сняты' : ''}.
            </Hint>
          )}
        </>
      )}
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
        c.mergedInto ? (byKey.get(c.mergedInto)?.address ?? '') : '',
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
          'Объединена с',
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
          <Hint>
            Щёлкните ячейку, чтобы задать её тип, число мест, нагрузку, блокировку, объединить с соседними или закрепить
            за кладовой.
          </Hint>
        </Section>
      ) : (
        <Section title="Стеллаж">
          <p className="muted">Выберите стеллаж на 3D или плане.</p>
        </Section>
      )}
      {cell &&
        !cell.virtual &&
        (cell.mergedInto && byKey.get(cell.mergedInto) ? (
          <MergedPart cell={cell} main={byKey.get(cell.mergedInto)!} />
        ) : (
          <CellEditor cell={cell} />
        ))}
    </>
  );
}
