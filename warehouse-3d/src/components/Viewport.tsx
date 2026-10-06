import { useEffect, useRef, useState } from 'react';
import { useStore, useWarehouse, type FillFilter, type Show, type ViewMode, type WallMode } from '../store';
import { Scene3D, type SceneMode } from './scene/Scene3D';
import { PlanEditor } from './plan/PlanEditor';
import { Inspector } from './Inspector';
import { VirtualBoard } from './VirtualBoard';
import { Icon, type IconName } from './icons';
import { EQUIPMENT } from '../lib/equipment';
import { useMonitor, useProducts } from '../lib/derived';
import { CELL_TYPES, GROUPS } from '../lib/materials';
import { LEVEL_COLOR } from '../lib/colors';
import type { CellType, ColorMode, MaterialGroup } from '../types';

const LAYERS: { key: keyof Show; title: string }[] = [
  { key: 'zones', title: 'Зоны и разметка пола' },
  { key: 'racks', title: 'Стеллажи' },
  { key: 'cargo', title: 'Груз в ячейках' },
  { key: 'equipment', title: 'Оборудование' },
  { key: 'people', title: 'Люди и деревья' },
  { key: 'labels', title: 'Подписи' },
  { key: 'callouts', title: 'Выноски по помещениям' },
  { key: 'heights', title: 'Высоты: отметки, ярусы, предел зоны' },
];

export const COLOR_MODES: { value: ColorMode; label: string; hint: string }[] = [
  { value: 'real', label: 'Как есть', hint: 'Натуральные цвета: короба, металл, ЛКМ, баллоны по цвету газа' },
  { value: 'fill', label: 'Заполнение', hint: 'Зелёный — свободно, красный — заполнено' },
  { value: 'load', label: 'Нагрузка', hint: 'Вес груза к допустимой нагрузке ячейки' },
  { value: 'group', label: 'Группы ТМЦ', hint: 'Металлопрокат, ЛКМ, газы, полуфабрикаты…' },
  { value: 'control', label: 'Контроль', hint: 'Нарушения правил хранения' },
  { value: 'age', label: 'Движение', hint: 'Давность последнего движения по ячейке' },
];

const FILL_FILTERS: { value: FillFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'empty', label: 'Свободные' },
  { value: 'partial', label: 'Частично' },
  { value: 'full', label: 'Полные' },
  { value: 'problems', label: 'С нарушениями' },
];

const WALLS: { value: WallMode; label: string }[] = [
  { value: 'cut', label: 'Срез' },
  { value: 'full', label: 'Полные' },
  { value: 'none', label: 'Скрыть' },
];

function Popover({
  icon,
  label,
  children,
  badge,
  wide,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
  badge?: number;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="vt-pop" ref={ref}>
      <button className={`vt-btn ${open ? 'active' : ''}`} onClick={() => setOpen(!open)} title={label}>
        <Icon name={icon} size={17} />
        <span>{label}</span>
        {!!badge && <span className="vt-badge">{badge}</span>}
      </button>
      {open && <div className={`vt-panel ${wide ? 'wide' : ''}`}>{children}</div>}
    </div>
  );
}

function FloorSwitch() {
  const w = useWarehouse();
  const floorFilter = useStore((s) => s.floorFilter);
  const explode = useStore((s) => s.explode);
  const st = useStore.getState;
  if (!w || w.kind === 'virtual' || w.floors.length < 2) return null;
  const floors = [...w.floors].sort((a, b) => b.elevation - a.elevation);
  return (
    <div className="floor-switch" aria-label="Этажи">
      <button
        className={explode ? 'active' : ''}
        onClick={() => st().setExplode(!explode)}
        title="Разнести этажи по высоте"
      >
        <Icon name="floors" size={16} />
      </button>
      {floors.map((f) => (
        <button
          key={f.id}
          className={floorFilter === f.id ? 'active' : ''}
          onClick={() => st().setFloorFilter(floorFilter === f.id ? null : f.id)}
          title={`${f.name}: отметка ${f.elevation.toLocaleString('ru-RU')} м`}
        >
          {f.name.replace(' этаж', '')}
        </button>
      ))}
      <button
        className={floorFilter === null ? 'active' : ''}
        onClick={() => st().setFloorFilter(null)}
        title="Все этажи"
      >
        Все
      </button>
    </div>
  );
}

function Legend() {
  const mode = useStore((s) => s.colorMode);
  if (mode === 'real') return null;
  return (
    <div className="legend3d">
      {(mode === 'fill' || mode === 'load') && (
        <>
          <span>{mode === 'fill' ? 'Заполнение' : 'Нагрузка'}</span>
          <i className="grad fill" />
          <span className="muted">0 → 100%</span>
          {mode === 'load' && (
            <span className="chipx">
              <i style={{ background: '#c026d3' }} />
              перегруз
            </span>
          )}
          {mode === 'fill' && (
            <span className="chipx">
              <i style={{ background: '#4ade80', opacity: 0.6 }} />
              свободна
            </span>
          )}
        </>
      )}
      {mode === 'control' &&
        (
          [
            ['critical', 'Критично'],
            ['warning', 'Внимание'],
            ['info', 'К сведению'],
            ['ok', 'Норма'],
          ] as const
        ).map(([k, t]) => (
          <span key={k} className="chipx">
            <i style={{ background: LEVEL_COLOR[k] }} />
            {t}
          </span>
        ))}
      {mode === 'age' && (
        <>
          <span>Последнее движение</span>
          <i className="grad age" />
          <span className="muted">сегодня → 90+ дней</span>
        </>
      )}
      {mode === 'group' &&
        (
          [
            'metal',
            'welding',
            'paint',
            'gas',
            'valves',
            'cable',
            'electro',
            'tools',
            'semi',
            'finished',
          ] as MaterialGroup[]
        ).map((g) => (
          <span key={g} className="chipx">
            <i style={{ background: GROUPS[g].color }} />
            {GROUPS[g].short}
          </span>
        ))}
    </div>
  );
}

function ViewToolbar({ mode }: { mode: SceneMode }) {
  const view = useStore((s) => s.view);
  const show = useStore((s) => s.show);
  const colorMode = useStore((s) => s.colorMode);
  const wallMode = useStore((s) => s.wallMode);
  const clip = useStore((s) => s.clip);
  const tierFilter = useStore((s) => s.tierFilter);
  const typeFilter = useStore((s) => s.typeFilter);
  const groupFilter = useStore((s) => s.groupFilter);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const fillFilter = useStore((s) => s.fillFilter);
  const productFilter = useStore((s) => s.productFilter);
  const highlight = useStore((s) => s.highlight);
  const w = useWarehouse();
  const products = useProducts();
  const m = useMonitor();
  const st = useStore.getState;
  const maxTier = Math.max(0, ...(w?.racks.map((r) => r.tiers.length) ?? [0]));
  const maxH = Math.ceil(
    Math.max(6, ...(w?.rooms.map((r) => (w.floors.find((f) => f.id === r.floorId)?.elevation ?? 0) + r.height) ?? [6])),
  );
  const active =
    (tierFilter ? 1 : 0) +
    (zoneFilter ? 1 : 0) +
    (fillFilter !== 'all' ? 1 : 0) +
    (productFilter ? 1 : 0) +
    (typeFilter ? 1 : 0) +
    (groupFilter ? 1 : 0);
  const types = [...new Set(m?.idx.cells.map((c) => c.cellType) ?? [])] as CellType[];
  const views: { v: ViewMode; label: string; icon: IconName }[] = [
    { v: '3d', label: '3D', icon: 'cube' },
    { v: 'plan', label: 'План', icon: 'plan' },
    ...(mode === 'build' ? [{ v: 'split' as ViewMode, label: '3D + план', icon: 'split' as IconName }] : []),
  ];
  const cur = mode === 'monitor' && view === 'split' ? '3d' : view;
  return (
    <div className="view-toolbar">
      <div className="vt-seg">
        {views.map((x) => (
          <button key={x.v} className={cur === x.v ? 'active' : ''} onClick={() => st().setView(x.v)} title={x.label}>
            <Icon name={x.icon} size={16} />
            <span>{x.label}</span>
          </button>
        ))}
      </div>
      <Popover icon="camera" label="Вид">
        <div className="vt-title">Камера</div>
        <div className="chips">
          <button className="chip" onClick={() => st().cameraPreset('iso')}>
            Изометрия
          </button>
          <button className="chip" onClick={() => st().cameraPreset('top')}>
            Сверху
          </button>
          <button className="chip" onClick={() => st().cameraPreset('front')}>
            Спереди
          </button>
          <button className="chip" onClick={() => st().cameraPreset('fit')}>
            Весь объект
          </button>
        </div>
        <div className="vt-title">Стены</div>
        <div className="chips">
          {WALLS.map((x) => (
            <button
              key={x.value}
              className={`chip ${wallMode === x.value ? 'active' : ''}`}
              onClick={() => st().setWallMode(x.value)}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="vt-title">
          Срез по высоте{' '}
          <span className="muted">{clip === null ? 'выкл.' : `до ${clip.toLocaleString('ru-RU')} м`}</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={maxH + 0.5}
          step={0.1}
          value={clip ?? maxH + 0.5}
          onChange={(e) => {
            const v = Number(e.target.value);
            st().setClip(v > maxH ? null : v);
          }}
        />
        <p className="hint">
          Срез убирает всё выше заданной отметки: видно ярусы стеллажей, уровни мезонина, нижний этаж.
        </p>
      </Popover>
      <Popover icon="layers" label="Слои">
        {LAYERS.map((l) => (
          <label key={l.key} className="check">
            <input type="checkbox" checked={show[l.key]} onChange={() => st().toggleShow(l.key)} />
            <span>{l.title}</span>
          </label>
        ))}
      </Popover>
      <Popover icon="eye" label={COLOR_MODES.find((c) => c.value === colorMode)?.label ?? 'Цвет'}>
        <div className="vt-title">Окраска груза</div>
        <div className="list">
          {COLOR_MODES.map((c) => (
            <button
              key={c.value}
              className={`list-item ${colorMode === c.value ? 'active' : ''}`}
              onClick={() => st().setColorMode(c.value)}
            >
              <span className="grow">
                <b>{c.label}</b>
                <div className="muted small">{c.hint}</div>
              </span>
            </button>
          ))}
        </div>
      </Popover>
      <Popover icon="filter" label="Фильтры" badge={active + (highlight.length ? 1 : 0)} wide>
        <div className="vt-title">Ячейки</div>
        <div className="chips">
          {FILL_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`chip ${fillFilter === f.value ? 'active' : ''}`}
              onClick={() => st().setFillFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="vt-title">Тип ячейки</div>
        <div className="chips">
          <button className={`chip ${typeFilter === null ? 'active' : ''}`} onClick={() => st().setTypeFilter(null)}>
            все
          </button>
          {types.map((t) => (
            <button
              key={t}
              className={`chip ${typeFilter === t ? 'active' : ''}`}
              onClick={() => st().setTypeFilter(t)}
            >
              <i className="dot" style={{ background: CELL_TYPES[t].color }} />
              {CELL_TYPES[t].title}
            </button>
          ))}
        </div>
        <div className="vt-title">Ярус</div>
        <div className="chips">
          <button className={`chip ${tierFilter === null ? 'active' : ''}`} onClick={() => st().setTierFilter(null)}>
            все
          </button>
          {Array.from({ length: maxTier }, (_, i) => (
            <button
              key={i}
              className={`chip ${tierFilter === i + 1 ? 'active' : ''}`}
              onClick={() => st().setTierFilter(i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="grid2">
          <label className="field">
            <span className="field-label">Группа ТМЦ</span>
            <select
              value={groupFilter ?? ''}
              onChange={(e) => st().setGroupFilter((e.target.value || null) as MaterialGroup | null)}
            >
              <option value="">Все группы</option>
              {(Object.keys(GROUPS) as MaterialGroup[]).map((g) => (
                <option key={g} value={g}>
                  {GROUPS[g].title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Зона</span>
            <select value={zoneFilter ?? ''} onChange={(e) => st().setZoneFilter(e.target.value || null)}>
              <option value="">Все зоны</option>
              {w?.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.code} · {z.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field-label">Где лежит ТМЦ</span>
          <select value={productFilter ?? ''} onChange={(e) => st().setProductFilter(e.target.value || null)}>
            <option value="">—</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {(active > 0 || highlight.length > 0) && (
          <button className="btn small" onClick={() => st().resetFilters()}>
            Сбросить фильтры
          </button>
        )}
      </Popover>
    </div>
  );
}

/** Окно склада: 3D и/или план, панель вида, этажи, легенда, карточка выбранного объекта. */
export function Viewport({ mode = 'monitor' }: { mode?: SceneMode }) {
  const w = useWarehouse();
  const view = useStore((s) => s.view);
  const placing = useStore((s) => s.placing);
  const highlight = useStore((s) => s.highlight);
  const selected = useStore((s) => !!s.selection);
  if (w?.kind === 'virtual') {
    return (
      <div className={`viewport mode-virtual ${selected ? 'has-inspector' : ''}`}>
        <VirtualBoard />
        <Inspector mode={mode} />
      </div>
    );
  }
  const shown = mode === 'monitor' && view === 'split' ? '3d' : view;
  return (
    <div className={`viewport mode-${shown}`}>
      {shown !== 'plan' && (
        <div className="view-3d">
          <Scene3D mode={mode} />
        </div>
      )}
      {shown !== '3d' && (
        <div className="view-plan">
          <PlanEditor mode={mode} />
        </div>
      )}
      <ViewToolbar mode={mode} />
      <FloorSwitch />
      <Legend />
      {placing && (
        <div className="place-hint">
          <Icon name="target" size={16} />
          Щёлкните на 3D или на плане, чтобы поставить «{EQUIPMENT[placing].title}»
          <button className="btn small" onClick={() => useStore.getState().startPlacing(null)}>
            Отмена
          </button>
        </div>
      )}
      {highlight.length > 0 && !placing && (
        <div className="place-hint info">
          Подсвечено мест: {highlight.length}
          <button className="btn small" onClick={() => useStore.getState().setHighlight([])}>
            Скрыть
          </button>
        </div>
      )}
      <Inspector mode={mode} />
    </div>
  );
}
