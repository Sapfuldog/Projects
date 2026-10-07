import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useWarehouse } from '../store';
import type { Cell, CellType, MaterialGroup, Rack } from '../types';
import { useMonitor } from '../lib/derived';
import { CELL_TYPES, GROUPS } from '../lib/materials';
import { RACK_SPEC, rackContext } from '../lib/rack';
import { ROOM_KINDS, ZONE_TYPES } from '../lib/demo';
import { fillColor } from '../lib/colors';
import { normAddr } from '../lib/snapshot';
import { fold, searchCells } from '../lib/search';
import { RackFacade, MAP_MODES, mainProduct, type MapMode } from '../components/RackMap';
import { CellDetails, RackSummary } from '../components/CellCard';
import { CellStockTable } from '../components/CellStock';
import { Icon } from '../components/icons';
import { pct } from '../components/ui';

type Node = { kind: 'room' | 'zone'; id: string } | null;

function FillPill({ value }: { value: number }) {
  return (
    <span className="fillpill" style={{ background: fillColor(value) }}>
      {pct(value)}
    </span>
  );
}

/** Число найденных ячеек вместо заполнения, когда идёт поиск. */
function Hits({ n }: { n: number }) {
  return <span className={`hits ${n ? '' : 'zero'}`}>{n}</span>;
}

/** Поиск по адресу ячейки (сканер штрихкода — адрес и Enter) и по номенклатуре: ТМЦ, артикул, партия, плавка. */
function CellSearch({ cells, onExact }: { cells: Cell[]; onExact: (c: Cell) => void }) {
  const search = useStore((s) => s.search);
  const st = useStore.getState;
  const enter = () => {
    const q = normAddr(search);
    if (!q) return;
    const c = cells.find((x) => normAddr(x.address) === q);
    if (c) onExact(c);
  };
  return (
    <label className="scan">
      <Icon name="search" size={16} />
      <input
        id="cells-search"
        placeholder="Адрес, ТМЦ, артикул, партия, плавка"
        value={search}
        onChange={(e) => st().setSearch(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && enter()}
      />
      {search && (
        <button className="icon-btn small" onClick={() => st().setSearch('')} title="Сбросить поиск">
          <Icon name="close" size={13} />
        </button>
      )}
    </label>
  );
}

/** Раздел «Ячейки»: дерево мест хранения, карта стеллажа, номенклатура в ячейках, карточка ячейки. */
export function CellsPage() {
  const w = useWarehouse();
  const m = useMonitor();
  const selection = useStore((s) => s.selection);
  const search = useStore((s) => s.search);
  const st = useStore.getState;
  const [node, setNode] = useState<Node>(null);
  const [mode, setMode] = useState<MapMode>('fill');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [typeFilter, setTypeFilter] = useState<CellType | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const mapRef = useRef<HTMLElement>(null);

  const selCell = selection?.kind === 'cell' ? m?.idx.byKey.get(selection.id) : undefined;
  const rackId = selection?.kind === 'rack' ? selection.id : selCell?.rackId;
  const rack = rackId ? w?.racks.find((r) => r.id === rackId) : undefined;
  const searching = search.trim().length > 0;

  // При открытии без выбора — первый стеллаж с нарушениями или первый стеллаж
  useEffect(() => {
    if (!w || !m || selection || node || w.kind === 'virtual') return;
    const v = m.violations.find((x) => x.rackId && x.kind !== 'idle');
    const r = w.racks.find((x) => x.id === v?.rackId) ?? w.racks[0];
    if (r) st().select({ kind: 'rack', id: r.id });
  }, [w, m, selection, node, st]);

  // Найденные ячейки и их число по стеллажам, зонам и помещениям
  const found = useMemo(() => {
    if (!m || !searching) return null;
    const cells = searchCells(m, search);
    const by = new Map<string, number>();
    const add = (k: string | undefined) => k && by.set(k, (by.get(k) ?? 0) + 1);
    for (const a of cells) {
      const c = m.idx.byAddress.get(a);
      if (!c) continue;
      add(c.rackId || c.key);
      add(c.zoneId);
      add(c.roomId);
    }
    return { cells, by };
  }, [m, search, searching]);
  const hits = (id: string) => found?.by.get(id) ?? 0;

  const rackVisible = (r: Rack) => {
    if (!m) return false;
    if (typeFilter && !(m.idx.byRack.get(r.id) ?? []).some((c) => c.cellType === typeFilter)) return false;
    if (onlyProblems && !m.violations.some((v) => v.rackId === r.id)) return false;
    return true;
  };
  const nodeRacks: Rack[] =
    !w || !node
      ? []
      : w.racks.filter(
          (r) =>
            (node.kind === 'room' ? rackContext(w, r).room?.id === node.id : r.zoneId === node.id) &&
            rackVisible(r) &&
            (!found || hits(r.id) > 0),
        );
  const nodeKey = nodeRacks.map((r) => r.id).join();

  // Ячейки для таблицы номенклатуры: при поиске — весь склад, иначе выбранный стеллаж, зона или помещение
  const scope = useMemo<Cell[]>(() => {
    if (!m || !w) return [];
    if (searching || w.kind === 'virtual') return m.idx.cells;
    if (node) return nodeKey.split(',').flatMap((id) => m.idx.byRack.get(id) ?? []);
    if (rack) return m.idx.byRack.get(rack.id) ?? [];
    return [];
  }, [m, w, searching, node, nodeKey, rack]);

  if (!w || !m) return null;

  const pick = (c: Cell) => st().select({ kind: 'cell', id: c.key, rackId: c.rackId });
  const exactProduct = searching
    ? [...m.pm.values()].find((p) => fold(p.sku) === fold(search.trim()) || fold(p.name) === fold(search.trim()))
    : undefined;
  const productCard = exactProduct && (
    <button
      className="btn small"
      onClick={() => {
        st().setSection('items');
        st().openProduct(exactProduct.id);
      }}
    >
      <Icon name="boxes" size={14} /> Карточка ТМЦ
    </button>
  );
  const closeCard = () => st().select(rack ? { kind: 'rack', id: rack.id } : null);
  const detail = (
    <aside className={`card cells-detail ${selCell ? 'sheet' : ''}`}>
      {selCell && (
        <div className="sheet-bar">
          <span className="muted small">{selCell.virtual ? 'Место учёта' : 'Карточка ячейки'}</span>
          <button className="icon-btn small" onClick={closeCard} title="Закрыть карточку">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {selCell ? (
        <CellDetails cell={selCell} />
      ) : rack ? (
        <>
          <RackSummary rack={rack} />
          <p className="hint">Выберите ячейку на карте или в списке, чтобы открыть её карточку: партии и движения.</p>
        </>
      ) : (
        <p className="muted">
          {w.kind === 'virtual' ? 'Выберите место учёта.' : 'Выберите стеллаж в дереве или ячейку в списке.'}
        </p>
      )}
    </aside>
  );

  // ----- Виртуальный склад: места учёта -----
  if (w.kind === 'virtual') {
    const places = m.idx.cells;
    return (
      <div className="page cells-page">
        <aside className="card tree">
          <div className="tree-head">
            <h3>Места учёта</h3>
            <CellSearch cells={places} onExact={pick} />
          </div>
          <div className="tree-body">
            {places.map((c) => (
              <button
                key={c.key}
                className={`tree-row lvl-1 ${selCell?.key === c.key ? 'active' : ''} ${found && !found.cells.has(c.address) ? 'nohit' : ''}`}
                onClick={() => pick(c)}
              >
                <Icon name="virtual" size={15} />
                <span className="grow">
                  {c.note}
                  <em>{c.address}</em>
                </span>
                <b>{Math.round(m.usage.get(c.address)?.qty ?? 0)}</b>
              </button>
            ))}
          </div>
        </aside>
        <section className="card cells-map">
          <CellStockTable
            cells={scope}
            m={m}
            q={search}
            onReset={() => st().setSearch('')}
            selectedKey={selCell?.key}
            onPick={pick}
            title="Номенклатура по местам учёта"
            extra={productCard}
          />
        </section>
        {detail}
      </div>
    );
  }

  const floors = [...w.floors].sort((a, b) => a.elevation - b.elevation);
  const expanded = (roomId: string) => {
    if (open[roomId] !== undefined) return open[roomId];
    if (found) return hits(roomId) > 0;
    return rack ? rackContext(w, rack).room?.id === roomId : false;
  };
  // Выбор в дереве во время поиска: карта под списком найденного — прокрутить к ней
  const showMapOf = () => {
    if (searching) requestAnimationFrame(() => mapRef.current?.scrollIntoView({ block: 'start' }));
  };
  const selectRack = (r: Rack) => {
    setNode(null);
    st().select({ kind: 'rack', id: r.id });
    showMapOf();
  };
  const rackGroups = rack
    ? [
        ...new Set(
          (m.idx.byRack.get(rack.id) ?? [])
            .map((c) => mainProduct(m.usage.get(c.address), m)?.group)
            .filter((g): g is MaterialGroup => !!g),
        ),
      ]
    : [];
  const neighbors = rack ? w.racks.filter((r) => r.zoneId === rack.zoneId && r.id !== rack.id).slice(0, 14) : [];
  // При поиске карта показывается только для стеллажа с находками или выбранной ячейки
  const showMap =
    !searching || !!selCell || (node ? nodeRacks.some((r) => hits(r.id) > 0) : !!rack && hits(rack.id) > 0);
  const tableTitle = searching
    ? 'Поиск по складу'
    : node
      ? `Номенклатура: ${node.kind === 'room' ? w.rooms.find((r) => r.id === node.id)?.name : w.zones.find((z) => z.id === node.id)?.name}`
      : rack
        ? `Номенклатура на стеллаже ${rack.code}`
        : 'Номенклатура в ячейках';

  const table = (
    <CellStockTable
      cells={scope}
      m={m}
      q={search}
      onReset={() => st().setSearch('')}
      selectedKey={selCell?.key}
      onPick={pick}
      title={tableTitle}
      extra={productCard}
    />
  );

  return (
    <div className="page cells-page">
      <aside className="card tree">
        <div className="tree-head">
          <CellSearch cells={m.idx.cells} onExact={pick} />
          <div className="chips">
            <button className={`chip ${!typeFilter ? 'active' : ''}`} onClick={() => setTypeFilter(null)}>
              Все
            </button>
            {(Object.keys(m.stats.all.byType) as CellType[]).map((t) => (
              <button
                key={t}
                className={`chip ${typeFilter === t ? 'active' : ''}`}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              >
                <i className="dot" style={{ background: CELL_TYPES[t].color }} />
                {CELL_TYPES[t].short}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
            <span>Только стеллажи с нарушениями</span>
          </label>
        </div>
        <div className="tree-body">
          {found && (
            <div className="tree-found">
              <Icon name="search" size={14} /> Найдено ячеек: <b>{found.cells.size}</b>
            </div>
          )}
          {floors.map((f) => {
            const rooms = w.rooms.filter((r) => (r.floorId ?? floors[0].id) === f.id && m.stats.byRoom.has(r.id));
            if (!rooms.length) return null;
            return (
              <div key={f.id}>
                {floors.length > 1 && (
                  <div className="tree-floor">
                    <Icon name="floors" size={14} /> {f.name} · {f.elevation.toLocaleString('ru-RU')} м
                  </div>
                )}
                {rooms.map((room) => {
                  const rs = m.stats.byRoom.get(room.id)!;
                  const roomOpen = expanded(room.id);
                  return (
                    <div key={room.id}>
                      <button
                        className={`tree-row lvl-0 ${node?.kind === 'room' && node.id === room.id ? 'active' : ''} ${found && !hits(room.id) ? 'nohit' : ''}`}
                        onClick={() => {
                          const selected = node?.kind === 'room' && node.id === room.id;
                          setNode({ kind: 'room', id: room.id });
                          showMapOf();
                          setOpen((o) => ({ ...o, [room.id]: selected ? !roomOpen : true }));
                        }}
                      >
                        <Icon name="chevron" size={14} className={roomOpen ? '' : 'rot'} />
                        <span className="tree-swatch" style={{ background: room.hazard ? '#e5484d' : room.color }} />
                        <span className="grow">
                          {room.name}
                          <em>
                            {ROOM_KINDS[room.kind].short}
                            {room.temp ? ` · ${room.temp}` : ''}
                          </em>
                        </span>
                        {found ? <Hits n={hits(room.id)} /> : <FillPill value={rs.fill} />}
                      </button>
                      {roomOpen &&
                        w.zones
                          .filter((z) => z.roomId === room.id && m.stats.byZone.has(z.id))
                          .map((z) => {
                            const zs = m.stats.byZone.get(z.id)!;
                            const racks = w.racks.filter(
                              (r) => r.zoneId === z.id && rackVisible(r) && (!found || hits(r.id) > 0),
                            );
                            const zoneOpen = open[z.id] ?? true;
                            if (found && !hits(z.id)) return null;
                            return (
                              <div key={z.id}>
                                <button
                                  className={`tree-row lvl-1 ${node?.kind === 'zone' && node.id === z.id ? 'active' : ''}`}
                                  onClick={() => {
                                    setNode({ kind: 'zone', id: z.id });
                                    showMapOf();
                                    setOpen((o) => ({ ...o, [z.id]: !(o[z.id] ?? true) }));
                                  }}
                                >
                                  <span className="tree-swatch" style={{ background: z.color }} />
                                  <span className="grow">
                                    {z.name}
                                    <em>
                                      {z.code} · {ZONE_TYPES[z.type].title.toLowerCase()} · ≤ {z.height} м
                                    </em>
                                  </span>
                                  {found ? <Hits n={hits(z.id)} /> : <FillPill value={zs.fill} />}
                                </button>
                                {zoneOpen &&
                                  racks.map((r) => {
                                    const s = m.stats.byRack.get(r.id);
                                    const bad = m.violations.some((v) => v.rackId === r.id && v.kind !== 'idle');
                                    return (
                                      <button
                                        key={r.id}
                                        className={`tree-row lvl-2 ${rack?.id === r.id && !node ? 'active' : ''}`}
                                        onClick={() => selectRack(r)}
                                      >
                                        <b className="tree-code">{r.code}</b>
                                        <span className="grow">
                                          {RACK_SPEC[r.kind].title}
                                          {r.mezzanineId ? ` · уровень ${(r.deck ?? 1) + 1}` : ''}
                                          <em>
                                            {s?.occupied ?? 0}/{s?.cells ?? 0} яч.
                                          </em>
                                        </span>
                                        {bad && <i className="dot" style={{ background: '#e5484d' }} />}
                                        {found ? <Hits n={hits(r.id)} /> : <FillPill value={s?.fill ?? 0} />}
                                      </button>
                                    );
                                  })}
                              </div>
                            );
                          })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="card cells-map">
        {searching && table}
        {showMap && (
          <>
            <header className="card-head" ref={mapRef}>
              <div>
                <h3>
                  {node
                    ? node.kind === 'room'
                      ? w.rooms.find((r) => r.id === node.id)?.name
                      : w.zones.find((z) => z.id === node.id)?.name
                    : rack
                      ? `Стеллаж ${rack.code} — карта ячеек`
                      : 'Карта ячеек'}
                </h3>
                {rack && !node && (
                  <p className="muted small">
                    {RACK_SPEC[rack.kind].title} · {rack.sections} секций × {rack.tiers.length} ярусов · щёлкните
                    ячейку, чтобы открыть карточку
                  </p>
                )}
              </div>
              <div className="seg small">
                {MAP_MODES.map((x) => (
                  <button key={x.value} className={mode === x.value ? 'active' : ''} onClick={() => setMode(x.value)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </header>
            {node ? (
              <div className="rackstrips big">
                {nodeRacks.map((r) => (
                  <div key={r.id} className="rackstrip">
                    <button className="rackstrip-code" onClick={() => selectRack(r)}>
                      {r.code}
                      <em>
                        {RACK_SPEC[r.kind].title} · {pct(m.stats.byRack.get(r.id)?.fill ?? 0)}
                      </em>
                    </button>
                    <RackFacade
                      rack={r}
                      cells={m.idx.byRack.get(r.id) ?? []}
                      m={m}
                      mode={mode}
                      compact
                      onPick={pick}
                      highlight={found?.cells}
                    />
                  </div>
                ))}
                {!nodeRacks.length && <p className="muted">Нет стеллажей.</p>}
              </div>
            ) : rack ? (
              <>
                <RackFacade
                  rack={rack}
                  cells={m.idx.byRack.get(rack.id) ?? []}
                  m={m}
                  mode={mode}
                  selectedKey={selCell?.key}
                  onPick={pick}
                  highlight={found?.cells}
                />
                <div className="cells-legend">
                  {mode === 'group' ? (
                    rackGroups.map((g) => (
                      <span key={g}>
                        <i className="lg" style={{ background: GROUPS[g].color }} /> {GROUPS[g].title}
                      </span>
                    ))
                  ) : (
                    <>
                      <span>
                        <i className="lg blocked" /> заблокирована
                      </span>
                      <span>
                        <i className="lg reserved" /> закреплена за кладовой
                      </span>
                      <span>
                        <i className="lg crit" /> нарушение
                      </span>
                      {found && (
                        <span>
                          <i className="lg hit" /> найдено
                        </span>
                      )}
                      <span className="muted">
                        Цифры — занято мест из доступных; полоса сверху секции — нагрузка на раму.
                      </span>
                    </>
                  )}
                </div>
                {neighbors.length > 0 && (
                  <div className="neighbors">
                    <span className="muted small">Соседние стеллажи:</span>
                    {neighbors.map((r) => (
                      <button key={r.id} className="chip" onClick={() => selectRack(r)}>
                        {r.code} <span className="chip-n">{pct(m.stats.byRack.get(r.id)?.fill ?? 0)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Выберите стеллаж в дереве слева.</p>
            )}
          </>
        )}
        {!searching && (node || rack) && table}
      </section>

      {detail}
    </div>
  );
}
