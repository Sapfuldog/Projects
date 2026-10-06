import { useEffect, useMemo, useState } from 'react';
import { useStore, useWarehouse } from '../store';
import type { Cell, CellType, Rack } from '../types';
import { useMonitor } from '../lib/derived';
import { CELL_TYPES } from '../lib/materials';
import { RACK_SPEC, rackContext } from '../lib/rack';
import { ROOM_KINDS, ZONE_TYPES } from '../lib/demo';
import { fillColor } from '../lib/colors';
import { normAddr } from '../lib/snapshot';
import { RackFacade, MAP_MODES, type MapMode } from '../components/RackMap';
import { CellDetails, RackSummary } from '../components/CellCard';
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

/** Раздел «Ячейки»: дерево мест хранения, карта стеллажа, карточка ячейки. */
export function CellsPage() {
  const w = useWarehouse();
  const m = useMonitor();
  const selection = useStore((s) => s.selection);
  const st = useStore.getState;
  const [node, setNode] = useState<Node>(null);
  const [mode, setMode] = useState<MapMode>('fill');
  const [query, setQuery] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [typeFilter, setTypeFilter] = useState<CellType | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const selCell = selection?.kind === 'cell' ? m?.idx.byKey.get(selection.id) : undefined;
  const rackId = selection?.kind === 'rack' ? selection.id : selCell?.rackId;
  const rack = rackId ? w?.racks.find((r) => r.id === rackId) : undefined;

  // При открытии без выбора — первый стеллаж с нарушениями или первый стеллаж
  useEffect(() => {
    if (!w || !m || selection || node || w.kind === 'virtual') return;
    const v = m.violations.find((x) => x.rackId && x.kind !== 'idle');
    const r = w.racks.find((x) => x.id === v?.rackId) ?? w.racks[0];
    if (r) st().select({ kind: 'rack', id: r.id });
  }, [w, m, selection, node, st]);

  const zoneOfRack = useMemo(() => new Map(w?.racks.map((r) => [r.id, r.zoneId]) ?? []), [w]);
  const expanded = (id: string, def: boolean) => open[id] ?? def;
  const toggle = (id: string, def: boolean) => setOpen((o) => ({ ...o, [id]: !(o[id] ?? def) }));

  if (!w || !m) return null;

  const scan = () => {
    const q = normAddr(query);
    if (!q) return;
    const c =
      m.idx.cells.find((x) => normAddr(x.address) === q) ?? m.idx.cells.find((x) => normAddr(x.address).includes(q));
    if (c) {
      st().select({ kind: 'cell', id: c.key, rackId: c.rackId });
      setNode(null);
    } else st().toast(`Ячейка «${query}» не найдена`, 'error');
  };

  const rackVisible = (r: Rack) => {
    if (typeFilter && !(m.idx.byRack.get(r.id) ?? []).some((c) => c.cellType === typeFilter)) return false;
    if (onlyProblems && !m.violations.some((v) => v.rackId === r.id)) return false;
    return true;
  };

  // ----- Виртуальный склад: места учёта -----
  if (w.kind === 'virtual') {
    const places = m.idx.cells;
    return (
      <div className="page cells-page">
        <aside className="card tree">
          <div className="tree-head">
            <h3>Места учёта</h3>
          </div>
          <div className="tree-body">
            {places.map((c) => (
              <button
                key={c.key}
                className={`tree-row lvl-1 ${selCell?.key === c.key ? 'active' : ''}`}
                onClick={() => st().select({ kind: 'cell', id: c.key, rackId: '' })}
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
        <section className="card cells-detail wide">
          {selCell ? <CellDetails cell={selCell} /> : <p className="muted">Выберите место учёта.</p>}
        </section>
      </div>
    );
  }

  const floors = [...w.floors].sort((a, b) => a.elevation - b.elevation);
  const nodeRacks: Rack[] =
    node?.kind === 'room'
      ? w.racks.filter((r) => rackContext(w, r).room?.id === node.id && rackVisible(r))
      : node?.kind === 'zone'
        ? w.racks.filter((r) => r.zoneId === node.id && rackVisible(r))
        : [];
  const selectRack = (r: Rack) => {
    setNode(null);
    st().select({ kind: 'rack', id: r.id });
  };
  const pick = (c: Cell) => st().select({ kind: 'cell', id: c.key, rackId: c.rackId });

  return (
    <div className="page cells-page">
      <aside className="card tree">
        <div className="tree-head">
          <div className="scan">
            <Icon name="scan" size={17} />
            <input
              placeholder="Адрес ячейки или штрихкод"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && scan()}
            />
            <button className="btn small primary" onClick={scan}>
              Найти
            </button>
          </div>
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
                  const roomOpen = expanded(room.id, rack ? rackContext(w, rack).room?.id === room.id : false);
                  return (
                    <div key={room.id}>
                      <button
                        className={`tree-row lvl-0 ${node?.kind === 'room' && node.id === room.id ? 'active' : ''}`}
                        onClick={() => {
                          const selected = node?.kind === 'room' && node.id === room.id;
                          setNode({ kind: 'room', id: room.id });
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
                        <FillPill value={rs.fill} />
                      </button>
                      {roomOpen &&
                        w.zones
                          .filter((z) => z.roomId === room.id && m.stats.byZone.has(z.id))
                          .map((z) => {
                            const zs = m.stats.byZone.get(z.id)!;
                            const racks = w.racks.filter((r) => r.zoneId === z.id && rackVisible(r));
                            const zoneOpen = expanded(z.id, true);
                            return (
                              <div key={z.id}>
                                <button
                                  className={`tree-row lvl-1 ${node?.kind === 'zone' && node.id === z.id ? 'active' : ''}`}
                                  onClick={() => {
                                    setNode({ kind: 'zone', id: z.id });
                                    toggle(z.id, true);
                                  }}
                                >
                                  <span className="tree-swatch" style={{ background: z.color }} />
                                  <span className="grow">
                                    {z.name}
                                    <em>
                                      {z.code} · {ZONE_TYPES[z.type].title.toLowerCase()} · ≤ {z.height} м
                                    </em>
                                  </span>
                                  <FillPill value={zs.fill} />
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
                                        <FillPill value={s?.fill ?? 0} />
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
        <header className="card-head">
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
                {RACK_SPEC[rack.kind].title} · {rack.sections} секций × {rack.tiers.length} ярусов · щёлкните ячейку,
                чтобы открыть карточку
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
                <RackFacade rack={r} cells={m.idx.byRack.get(r.id) ?? []} m={m} mode={mode} compact onPick={pick} />
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
            />
            <div className="cells-legend">
              <span>
                <i className="lg blocked" /> заблокирована
              </span>
              <span>
                <i className="lg reserved" /> закреплена за кладовой
              </span>
              <span>
                <i className="lg crit" /> нарушение
              </span>
              <span className="muted">Цифры — занято мест из доступных; полоса сверху секции — нагрузка на раму.</span>
            </div>
            {zoneOfRack.get(rack.id) && (
              <div className="neighbors">
                <span className="muted small">Соседние стеллажи:</span>
                {w.racks
                  .filter((r) => r.zoneId === rack.zoneId && r.id !== rack.id)
                  .slice(0, 14)
                  .map((r) => (
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
      </section>

      <aside className="card cells-detail">
        {selCell ? (
          <CellDetails cell={selCell} />
        ) : rack ? (
          <>
            <RackSummary rack={rack} />
            <p className="hint">Выберите ячейку на карте стеллажа, чтобы увидеть содержимое, партии и движения.</p>
          </>
        ) : (
          <p className="muted">Выберите ячейку.</p>
        )}
      </aside>
    </div>
  );
}
