import { useMemo, useState } from 'react';
import { useStore, useWarehouse, type DashLevel } from '../store';
import type { CellType, Room, Warehouse } from '../types';
import { Viewport } from '../components/Viewport';
import { Icon, type IconName } from '../components/icons';
import { Columns, HBars, Histogram, Lines, Sparkline } from '../components/charts';
import { RackFacade, MAP_MODES, type MapMode } from '../components/RackMap';
import { Meter } from '../components/CellCard';
import { pct } from '../components/ui';
import { useMonitor, useProductsMap, usePartyName, useTareTypes, useProducts } from '../lib/derived';
import { monitorOf, type Monitor } from '../lib/monitor';
import { HIST_LABELS, eventFeed, fmtTons, movesByDay, timeAgo, type LocStats } from '../lib/analytics';
import { VIOLATIONS, type Level } from '../lib/control';
import { CELL_TYPES } from '../lib/materials';
import { ROOM_KINDS } from '../lib/demo';
import { fillColor, LEVEL_COLOR } from '../lib/colors';
import { polygonCentroid } from '../lib/geometry';
import { rackContext } from '../lib/rack';

const LEVELS: { id: DashLevel; title: string; icon: IconName }[] = [
  { id: 'warehouses', title: 'Склады', icon: 'warehouse' },
  { id: 'rooms', title: 'Помещения', icon: 'building' },
  { id: 'cells', title: 'Ячейки', icon: 'grid' },
];

export function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
  progress,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
  progress?: number;
  onClick?: () => void;
}) {
  return (
    <button
      className={`kpi ${tone ? `tone-${tone}` : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="kpi-icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value}</span>
        {sub && <span className="kpi-sub">{sub}</span>}
        {progress !== undefined && (
          <span className="kpi-bar">
            <i style={{ width: `${Math.round(Math.min(1, progress) * 100)}%`, background: fillColor(progress) }} />
          </span>
        )}
      </span>
    </button>
  );
}

const problemsOf = (m: Monitor) => {
  const out: Record<Level, number> = { critical: 0, warning: 0, info: 0 };
  for (const v of m.violations) out[VIOLATIONS[v.kind].level]++;
  return out;
};

/** KPI виртуального склада: единицы учёта по видам мест. */
function VirtualKpis({ w, m }: { w: Warehouse; m: Monitor }) {
  const units = (kind?: string) =>
    w.places.filter((p) => !kind || p.kind === kind).reduce((s, p) => s + (m.usage.get(p.code)?.qty ?? 0), 0);
  const total = units();
  const moves = (m.inv?.events ?? []).filter((e) => e.at > Date.now() - 30 * 86400000).length;
  return (
    <div className="kpis">
      <Kpi icon="virtual" label="Мест учёта" value={w.places.length} sub="склад, кабинеты, сотрудники, ремонт" />
      <Kpi
        icon="boxes"
        label="Единиц на учёте"
        value={Math.round(total).toLocaleString('ru-RU')}
        sub={`позиций ${new Set([...m.usage.values()].flatMap((u) => Object.keys(u.byProduct))).size}`}
      />
      <Kpi
        icon="user"
        label="Выдано сотрудникам"
        value={Math.round(units('person'))}
        progress={total ? units('person') / total : 0}
        sub={`${total ? Math.round((units('person') / total) * 100) : 0}% от всего`}
      />
      <Kpi
        icon="wrench"
        label="В ремонте"
        value={Math.round(units('repair'))}
        tone={units('repair') ? 'warn' : 'ok'}
        sub={`в пути ${Math.round(units('transit'))}`}
      />
      <Kpi icon="refresh" label="Перемещений за 30 дней" value={moves} sub="выдача, возврат, ремонт" />
    </div>
  );
}

/** KPI по месту хранения (склад, помещение). */
function LocKpis({ s, m, label }: { s: LocStats; m: Monitor; label: string }) {
  const st = useStore.getState;
  const pr = problemsOf(m);
  return (
    <div className="kpis">
      <Kpi
        icon="grid"
        label={`Ячеек · ${label}`}
        value={s.cells.toLocaleString('ru-RU')}
        sub={`занято ${s.occupied.toLocaleString('ru-RU')} · свободно ${s.free.toLocaleString('ru-RU')}`}
      />
      <Kpi icon="boxes" label="Заполнение" value={pct(s.fill)} progress={s.fill} sub="средняя по доступным ячейкам" />
      <Kpi
        icon="pallet"
        label="Места: паллеты, короба, баллоны"
        value={s.places ? pct(s.usedPlaces / s.places) : '—'}
        progress={s.places ? s.usedPlaces / s.places : undefined}
        sub={`${s.usedPlaces.toLocaleString('ru-RU')} из ${s.places.toLocaleString('ru-RU')}`}
      />
      <Kpi icon="weight" label="Груз на хранении" value={fmtTons(s.weight)} sub={`допустимо ${fmtTons(s.capacity)}`} />
      <Kpi
        icon="shield"
        label="Нарушения хранения"
        value={pr.critical + pr.warning}
        tone={pr.critical ? 'bad' : pr.warning ? 'warn' : 'ok'}
        sub={`критичных ${pr.critical} · внимание ${pr.warning} · без движения ${pr.info}`}
        onClick={() => st().setSection('control')}
      />
    </div>
  );
}

// ---------- Уровень «Склады» ----------

function WarehouseCard({ w, m, current }: { w: Warehouse; m: Monitor; current: boolean }) {
  const st = useStore.getState;
  const s = m.stats.all;
  const pr = problemsOf(m);
  const hist = (m.inv?.history ?? []).slice(-30).map((h) => (h.cells ? h.occupied / h.cells : 0));
  return (
    <div className={`card whcard ${current ? 'active' : ''}`}>
      <div className="whcard-head">
        <span className={`whcard-icon ${w.kind}`}>
          <Icon name={w.kind === 'virtual' ? 'virtual' : 'warehouse'} size={22} />
        </span>
        <div className="grow">
          <b>{w.name}</b>
          <div className="muted small">
            {w.kind === 'virtual' ? 'Виртуальный склад · учёт по местам' : w.address || 'Физический склад'}
          </div>
        </div>
        {pr.critical + pr.warning > 0 && (
          <span className={`badge ${pr.critical ? 'bad' : 'warn'}`}>{pr.critical + pr.warning} наруш.</span>
        )}
      </div>
      <div className="whcard-ring">
        {w.kind === 'virtual' ? (
          <div className="ring virtual" style={{ '--p': 1, '--c': '#0f9fb3' } as React.CSSProperties}>
            <span>
              {Math.round([...m.usage.values()].reduce((x, u) => x + u.qty, 0))}
              <em>ед.</em>
            </span>
          </div>
        ) : (
          <div className="ring" style={{ '--p': s.fill, '--c': fillColor(s.fill) } as React.CSSProperties}>
            <span>{pct(s.fill)}</span>
          </div>
        )}
        <div className="whcard-metrics">
          <span>
            <em>{w.kind === 'virtual' ? 'Мест учёта' : 'Ячеек'}</em>
            <b>
              {s.occupied.toLocaleString('ru-RU')} / {s.cells.toLocaleString('ru-RU')}
            </b>
          </span>
          {w.kind === 'physical' && (
            <>
              <span>
                <em>Помещений</em>
                <b>
                  {w.rooms.length} · этажей {w.floors.length}
                </b>
              </span>
              <span>
                <em>Места</em>
                <b>
                  {s.usedPlaces.toLocaleString('ru-RU')} / {s.places.toLocaleString('ru-RU')}
                </b>
              </span>
              <span>
                <em>Груз</em>
                <b>{fmtTons(s.weight)}</b>
              </span>
            </>
          )}
          {w.kind === 'virtual' && (
            <span>
              <em>Единиц учёта</em>
              <b>{[...m.usage.values()].reduce((x, u) => x + u.qty, 0).toLocaleString('ru-RU')}</b>
            </span>
          )}
        </div>
      </div>
      <div className="whcard-foot">
        <Sparkline values={hist} width={150} height={30} />
        <span className="muted small">{m.inv?.updatedAt ? `обновлено ${timeAgo(m.inv.updatedAt)}` : 'нет данных'}</span>
        <button
          className="btn small primary"
          onClick={() => {
            st().setCurrent(w.id);
            st().setLevel('rooms');
          }}
        >
          Открыть
        </button>
      </div>
    </div>
  );
}

function WarehousesLevel() {
  const warehouses = useStore((s) => s.warehouses);
  const inventory = useStore((s) => s.inventory);
  const currentId = useStore((s) => s.currentId);
  const products = useProducts();
  const tare = useTareTypes();
  const st = useStore.getState;
  const list = useMemo(
    () => warehouses.map((w) => ({ w, m: monitorOf(w, inventory[w.id], products, tare) })),
    [warehouses, inventory, products, tare],
  );
  const total = list.reduce(
    (a, { w, m }) => {
      const s = m.stats.all;
      const pr = problemsOf(m);
      a.cells += s.cells;
      a.occupied += s.occupied;
      a.places += s.places;
      a.used += s.usedPlaces;
      a.weight += s.weight;
      if (w.kind === 'physical') {
        a.fillSum += s.fill * (s.cells - s.blocked);
        a.avail += s.cells - s.blocked;
      }
      a.bad += pr.critical;
      a.warn += pr.warning;
      if (w.kind === 'virtual') a.virtual++;
      return a;
    },
    { cells: 0, occupied: 0, places: 0, used: 0, weight: 0, fillSum: 0, avail: 0, bad: 0, warn: 0, virtual: 0 },
  );
  const fill = total.avail ? total.fillSum / total.avail : 0;
  return (
    <>
      <div className="kpis">
        <Kpi
          icon="warehouse"
          label="Объектов"
          value={list.length}
          sub={`физических ${list.length - total.virtual} · виртуальных ${total.virtual}`}
        />
        <Kpi
          icon="grid"
          label="Ячеек и мест учёта"
          value={total.cells.toLocaleString('ru-RU')}
          sub={`занято ${total.occupied.toLocaleString('ru-RU')}`}
        />
        <Kpi icon="boxes" label="Заполнение" value={pct(fill)} progress={fill} sub="физические склады" />
        <Kpi
          icon="pallet"
          label="Места"
          value={total.places ? pct(total.used / total.places) : '—'}
          progress={total.places ? total.used / total.places : undefined}
          sub={`${total.used.toLocaleString('ru-RU')} из ${total.places.toLocaleString('ru-RU')}`}
        />
        <Kpi
          icon="shield"
          label="Нарушения"
          value={total.bad + total.warn}
          tone={total.bad ? 'bad' : total.warn ? 'warn' : 'ok'}
          sub={`критичных ${total.bad}`}
          onClick={() => st().setSection('control')}
        />
      </div>
      <div className="whcards">
        {list.map(({ w, m }) => (
          <WarehouseCard key={w.id} w={w} m={m} current={w.id === currentId} />
        ))}
        <button
          className="card whcard add"
          onClick={() => {
            st().setSection('settings');
          }}
        >
          <Icon name="plus" size={28} />
          <span>Добавить склад, двор или виртуальный склад</span>
        </button>
      </div>
      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <h3>Заполнение объектов</h3>
          </header>
          <HBars
            items={list
              .filter(({ w }) => w.kind === 'physical')
              .map(({ w, m }) => ({
                key: w.id,
                label: w.name,
                sub: `${m.stats.all.occupied.toLocaleString('ru-RU')} из ${m.stats.all.cells.toLocaleString('ru-RU')}`,
                value: m.stats.all.fill,
                display: pct(m.stats.all.fill),
                color: fillColor(m.stats.all.fill),
                onClick: () => {
                  st().setCurrent(w.id);
                  st().setLevel('rooms');
                },
              }))}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Занятые ячейки, % — 60 дней</h3>
          </header>
          <Lines
            max={100}
            format={(v) => `${Math.round(v)}%`}
            series={list
              .filter(({ w }) => w.kind === 'physical')
              .map(({ w, m }, i) => ({
                label: w.name,
                color: `var(--series-${(i % 6) + 1})`,
                points: (m.inv?.history ?? []).map((h) => ({ x: h.at, y: h.cells ? (h.occupied / h.cells) * 100 : 0 })),
              }))}
          />
        </section>
      </div>
    </>
  );
}

// ---------- Уровень «Помещения» ----------

const kindIcon = (r: Room): IconName =>
  r.hazard ? 'alert' : r.kind === 'yard' ? 'metal' : r.kind === 'canopy' ? 'pallet' : 'building';

function RoomRow({ r, s, problems, active }: { r: Room; s?: LocStats; problems: number; active: boolean }) {
  const st = useStore.getState;
  const w = useWarehouse()!;
  const floor = w.floors.find((f) => f.id === r.floorId);
  return (
    <button
      className={`roomrow ${active ? 'active' : ''}`}
      onClick={() => {
        st().setDashRoom(r.id);
        st().select({ kind: 'room', id: r.id });
        const c = polygonCentroid(r.points);
        if (floor && w.floors.length > 1) st().setFloorFilter(floor.elevation > 0 ? floor.id : null);
        st().focusOn(c.x, floor?.elevation ?? 0, c.y);
      }}
    >
      <span className="roomrow-icon" style={{ background: r.hazard ? '#e5484d' : r.color }}>
        <Icon name={kindIcon(r)} size={16} />
      </span>
      <span className="grow">
        <b>{r.name}</b>
        <span className="muted small">
          {ROOM_KINDS[r.kind].short}
          {floor && w.floors.length > 1 ? ` · ${floor.name}` : ''}
          {r.temp ? ` · ${r.temp}` : ''}
          {s ? ` · ${s.occupied}/${s.cells} яч.` : ''}
        </span>
        {s && (
          <span className="roomrow-bar">
            <i style={{ width: `${Math.round(s.fill * 100)}%`, background: fillColor(s.fill) }} />
          </span>
        )}
      </span>
      <span className="roomrow-value">
        <b>{s ? pct(s.fill) : '—'}</b>
        {problems > 0 && <span className="badge bad">{problems}</span>}
      </span>
    </button>
  );
}

function RoomsLevel() {
  const w = useWarehouse();
  const m = useMonitor();
  const products = useProductsMap();
  const dashRoomId = useStore((s) => s.dashRoomId);
  const party = usePartyName();
  const st = useStore.getState;
  const feed = useMemo(() => (m ? eventFeed(m.inv, products, (c) => party(c), 12) : []), [m, products, party]);
  const moves = useMemo(() => movesByDay(m?.inv?.events ?? [], 14), [m]);
  if (!w || !m) return null;
  const s = m.stats.all;
  const roomProblems = (id: string) =>
    m.violations.filter(
      (v) =>
        VIOLATIONS[v.kind].level !== 'info' &&
        (m.idx.byAddress.get(v.address)?.roomId === id ||
          (v.rackId &&
            rackContext(
              w,
              w.racks.find((r) => r.id === v.rackId)!,
            ).room?.id === id)),
    ).length;
  const history = m.inv?.history ?? [];
  const floors = [...w.floors].sort((a, b) => a.elevation - b.elevation);
  return (
    <>
      {w.kind === 'virtual' ? <VirtualKpis w={w} m={m} /> : <LocKpis s={s} m={m} label="весь склад" />}
      <div className="home-main">
        <section className="card home-3d">
          <Viewport mode="monitor" />
        </section>
        <aside className="card home-rooms">
          <header className="card-head">
            <h3>{w.kind === 'virtual' ? 'Места учёта' : 'Помещения и площадки'}</h3>
            <span className="muted small">{w.rooms.length || w.places.length}</span>
          </header>
          <div className="roomlist">
            {w.kind === 'physical' &&
              floors.map((f) => {
                const rooms = w.rooms.filter((r) => (r.floorId ?? floors[0]?.id) === f.id);
                if (!rooms.length) return null;
                return (
                  <div key={f.id}>
                    {floors.length > 1 && (
                      <div className="roomlist-floor">
                        <Icon name="floors" size={14} /> {f.name} · отметка {f.elevation.toLocaleString('ru-RU')} м
                      </div>
                    )}
                    {rooms.map((r) => (
                      <RoomRow
                        key={r.id}
                        r={r}
                        s={m.stats.byRoom.get(r.id)}
                        problems={roomProblems(r.id)}
                        active={dashRoomId === r.id}
                      />
                    ))}
                  </div>
                );
              })}
            {w.kind === 'virtual' &&
              w.places.map((pl) => {
                const u = m.usage.get(pl.code);
                return (
                  <button key={pl.id} className="roomrow" onClick={() => st().openCell(pl.code)}>
                    <span className="roomrow-icon" style={{ background: '#0f9fb3' }}>
                      <Icon name="virtual" size={16} />
                    </span>
                    <span className="grow">
                      <b>{pl.name}</b>
                      <span className="muted small">{pl.code}</span>
                    </span>
                    <span className="roomrow-value">
                      <b>{Math.round(u?.qty ?? 0)}</b>
                    </span>
                  </button>
                );
              })}
          </div>
        </aside>
      </div>
      <div className="grid-3">
        <section className="card">
          <header className="card-head">
            <h3>История заполнения</h3>
          </header>
          <Lines
            max={100}
            format={(v) => `${Math.round(v)}%`}
            series={[
              {
                label: 'Занятые ячейки',
                color: 'var(--series-1)',
                points: history.map((h) => ({ x: h.at, y: h.cells ? (h.occupied / h.cells) * 100 : 0 })),
              },
              {
                label: 'Занятые места',
                color: 'var(--series-2)',
                points: history.map((h) => ({ x: h.at, y: h.places ? (h.usedPlaces / h.places) * 100 : 0 })),
              },
            ]}
          />
        </section>
        <section className="card">
          <header className="card-head">
            <h3>Движения по ячейкам, 14 дней</h3>
          </header>
          <Columns
            data={moves.map((d) => ({ x: d.day, values: [d.in, d.out, d.move] }))}
            series={['Приход', 'Выдача', 'Перемещения']}
          />
        </section>
        <section className="card feed-card">
          <header className="card-head">
            <h3>Лента учётной системы</h3>
            <span className="live-dot" title="Данные обновляются" />
          </header>
          <div className="feed">
            {!feed.length && <div className="muted small">Событий нет</div>}
            {feed.map((f) => (
              <button
                key={f.key}
                className={`feed-item op-${f.type}`}
                onClick={() => f.addresses[0] && st().openCell(f.addresses[0])}
              >
                <i />
                <span className="grow">
                  <b>{f.title}</b>
                  <span>{f.sub}</span>
                </span>
                <span className="muted small">{timeAgo(f.at)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

// ---------- Уровень «Ячейки» ----------

function CellsLevel() {
  const w = useWarehouse();
  const m = useMonitor();
  const dashRoomId = useStore((s) => s.dashRoomId);
  const [mode, setMode] = useState<MapMode>('fill');
  const st = useStore.getState;
  if (!w || !m) return null;
  const rooms = w.rooms.filter((r) => m.stats.byRoom.has(r.id));
  const room = rooms.find((r) => r.id === dashRoomId) ?? rooms[0];
  const s = room ? (m.stats.byRoom.get(room.id) ?? m.stats.all) : m.stats.all;
  const racks = room ? w.racks.filter((r) => rackContext(w, r).room?.id === room.id) : [];
  const types = Object.keys(s.byType) as CellType[];
  const problems = m.violations
    .filter(
      (v) => (room ? m.idx.byAddress.get(v.address)?.roomId === room.id : true) && VIOLATIONS[v.kind].level !== 'info',
    )
    .slice(0, 10);
  const idle = m.violations.filter(
    (v) => v.kind === 'idle' && (!room || m.idx.byAddress.get(v.address)?.roomId === room.id),
  );
  const active = [...m.activity.values()]
    .filter((a) => !room || m.idx.byAddress.get(a.address)?.roomId === room.id)
    .slice(0, 8);
  return (
    <>
      <div className="room-tabs">
        {rooms.map((r) => (
          <button
            key={r.id}
            className={`chip ${room?.id === r.id ? 'active' : ''}`}
            onClick={() => st().setDashRoom(r.id)}
          >
            <i className="dot" style={{ background: r.hazard ? '#e5484d' : r.color }} />
            {r.name}
          </button>
        ))}
      </div>
      <div className="typecards">
        {types.map((t) => {
          const x = s.byType[t]!;
          const f = x.places ? x.used / x.places : x.cells ? x.occupied / x.cells : 0;
          return (
            <div key={t} className="card typecard">
              <div className="typecard-head">
                <i style={{ background: CELL_TYPES[t].color }} />
                <b>{CELL_TYPES[t].title}</b>
              </div>
              <div className="typecard-value">{pct(f)}</div>
              <Meter value={f} />
              <div className="muted small">
                ячеек {x.occupied}/{x.cells}
                {x.places ? ` · ${CELL_TYPES[t].placeUnit} ${x.used}/${x.places}` : ''}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid-cells">
        <section className="card">
          <header className="card-head">
            <h3>Карта ячеек: {room?.name ?? w.name}</h3>
            <div className="seg small">
              {MAP_MODES.map((x) => (
                <button key={x.value} className={mode === x.value ? 'active' : ''} onClick={() => setMode(x.value)}>
                  {x.label}
                </button>
              ))}
            </div>
          </header>
          <div className="rackstrips">
            {racks.map((r) => (
              <div key={r.id} className="rackstrip">
                <button
                  className="rackstrip-code"
                  onClick={() => (st().select({ kind: 'rack', id: r.id }), st().setSection('cells'))}
                >
                  {r.code}
                  <em>{pct(m.stats.byRack.get(r.id)?.fill ?? 0)}</em>
                </button>
                <RackFacade
                  rack={r}
                  cells={m.idx.byRack.get(r.id) ?? []}
                  m={m}
                  mode={mode}
                  compact
                  onPick={(c) => st().openCell(c.address)}
                />
              </div>
            ))}
            {!racks.length && <p className="muted">В помещении нет стеллажей.</p>}
          </div>
        </section>
        <div className="col">
          <section className="card">
            <header className="card-head">
              <h3>Распределение заполнения</h3>
            </header>
            <Histogram
              values={s.hist}
              labels={HIST_LABELS}
              colors={['#cbd5e1', fillColor(0.12), fillColor(0.38), fillColor(0.62), fillColor(0.87), fillColor(1)]}
            />
          </section>
          <section className="card">
            <header className="card-head">
              <h3>Проблемные ячейки</h3>
              <button className="btn small" onClick={() => st().setSection('control')}>
                Все
              </button>
            </header>
            <div className="list compact">
              {!problems.length && <div className="muted small">Нарушений нет</div>}
              {problems.map((v, i) => (
                <button key={i} className="list-item" onClick={() => st().openCell(v.address)}>
                  <i className="dot" style={{ background: LEVEL_COLOR[VIOLATIONS[v.kind].level] }} />
                  <span className="grow">
                    <b className="mono">{v.address}</b> <span className="muted small">{VIOLATIONS[v.kind].title}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="card">
            <header className="card-head">
              <h3>Обращаемость</h3>
              <span className="muted small">без движения 90+ дней: {idle.length}</span>
            </header>
            <HBars
              items={active.map((a) => ({
                key: a.address,
                label: a.address,
                sub: `класс ${a.abc}`,
                value: a.ops / (active[0]?.ops || 1),
                display: `${a.ops}`,
                onClick: () => st().openCell(a.address),
              }))}
            />
          </section>
        </div>
      </div>
    </>
  );
}

export function HomePage() {
  const level = useStore((s) => s.level);
  const w = useWarehouse();
  const st = useStore.getState;
  return (
    <div className="page home">
      <div className="page-head">
        <div>
          <h1>Обзор</h1>
          <p className="muted">
            {level === 'warehouses'
              ? 'Все склады, площадки и виртуальные склады'
              : `${w?.name ?? ''}${w?.address ? ` · ${w.address}` : ''}`}
          </p>
        </div>
        <div className="seg levels" role="tablist">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={level === l.id ? 'active' : ''}
              onClick={() => st().setLevel(l.id)}
              role="tab"
            >
              <Icon name={l.icon} size={16} />
              {l.title}
            </button>
          ))}
        </div>
      </div>
      {level === 'warehouses' && <WarehousesLevel />}
      {level === 'rooms' && <RoomsLevel />}
      {level === 'cells' && <CellsLevel />}
    </div>
  );
}
