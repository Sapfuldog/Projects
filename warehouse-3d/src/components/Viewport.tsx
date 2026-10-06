import { useRef, useState, useEffect } from 'react';
import { useStore, useWarehouse, type FillFilter, type Show, type ViewMode } from '../store';
import { Scene3D } from './scene/Scene3D';
import { PlanEditor } from './plan/PlanEditor';
import { Inspector } from './Inspector';
import { Icon, type IconName } from './icons';
import { EQUIPMENT } from '../lib/equipment';
import { useProducts } from '../lib/derived';
import type { ColorMode } from '../types';

const LAYERS: { key: keyof Show; title: string }[] = [
  { key: 'walls', title: 'Стены помещений' },
  { key: 'zones', title: 'Зоны размещения' },
  { key: 'racks', title: 'Стеллажи' },
  { key: 'cells', title: 'Ячейки' },
  { key: 'cargo', title: 'Груз (заполнение)' },
  { key: 'equipment', title: 'Оборудование' },
  { key: 'labels', title: 'Подписи' },
  { key: 'callouts', title: 'Выноски загрузки' },
];

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'fill', label: 'Заполненность' },
  { value: 'load', label: 'Нагрузка (вес / Г)' },
  { value: 'sku', label: 'Товар' },
  { value: 'zone', label: 'Зона' },
];

const FILL_FILTERS: { value: FillFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'empty', label: 'Пустые' },
  { value: 'partial', label: 'Частично' },
  { value: 'full', label: 'Полные' },
];

function Popover({
  icon,
  label,
  children,
  badge,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
  badge?: number;
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
      <button className={`vt-btn ${open ? 'active' : ''}`} onClick={() => setOpen(!open)}>
        <Icon name={icon} size={17} />
        <span>{label}</span>
        {!!badge && <span className="vt-badge">{badge}</span>}
      </button>
      {open && <div className="vt-panel">{children}</div>}
    </div>
  );
}

function ViewToolbar({ monitor }: { monitor: boolean }) {
  const view = useStore((s) => s.view);
  const show = useStore((s) => s.show);
  const colorMode = useStore((s) => s.colorMode);
  const tierFilter = useStore((s) => s.tierFilter);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const fillFilter = useStore((s) => s.fillFilter);
  const productFilter = useStore((s) => s.productFilter);
  const highlight = useStore((s) => s.highlight);
  const w = useWarehouse();
  const products = useProducts();
  const st = useStore.getState;
  const maxTier = Math.max(0, ...(w?.racks.map((r) => r.tiers.length) ?? [0]));
  const active = (tierFilter ? 1 : 0) + (zoneFilter ? 1 : 0) + (fillFilter !== 'all' ? 1 : 0) + (productFilter ? 1 : 0);
  const views: { v: ViewMode; label: string; icon: IconName }[] = [
    { v: '3d', label: '3D', icon: 'cube' },
    { v: 'plan', label: 'План', icon: 'plan' },
    ...(monitor ? [] : [{ v: 'split' as ViewMode, label: '3D + план', icon: 'split' as IconName }]),
  ];
  return (
    <div className="view-toolbar">
      {views.map((x) => (
        <button
          key={x.v}
          className={`vt-btn ${view === x.v || (monitor && x.v === '3d' && view === 'split') ? 'primary' : ''}`}
          onClick={() => st().setView(x.v)}
        >
          <Icon name={x.icon} size={17} />
          <span>{x.label}</span>
        </button>
      ))}
      <Popover icon="layers" label="Слои">
        <div className="vt-title">Слои</div>
        {LAYERS.map((l) => (
          <label key={l.key} className="check">
            <input type="checkbox" checked={show[l.key]} onChange={() => st().toggleShow(l.key)} />
            <span>{l.title}</span>
          </label>
        ))}
        <div className="vt-title">Цвет груза</div>
        <div className="chips">
          {COLOR_MODES.map((m) => (
            <button
              key={m.value}
              className={`chip ${colorMode === m.value ? 'active' : ''}`}
              onClick={() => st().setColorMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Popover>
      <Popover icon="filter" label="Фильтры" badge={active + (highlight.length ? 1 : 0)}>
        <div className="vt-title">Заполнение ячеек</div>
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
        <div className="vt-title">Зона</div>
        <select className="input" value={zoneFilter ?? ''} onChange={(e) => st().setZoneFilter(e.target.value || null)}>
          <option value="">Все зоны</option>
          {w?.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <div className="vt-title">Где лежит товар</div>
        <select
          className="input"
          value={productFilter ?? ''}
          onChange={(e) => st().setProductFilter(e.target.value || null)}
        >
          <option value="">—</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {(active > 0 || highlight.length > 0) && (
          <button
            className="btn small"
            onClick={() => {
              st().resetFilters();
              st().setHighlight([]);
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </Popover>
    </div>
  );
}

/** Окно просмотра склада: 3D и/или план, панель «3D / План / Слои / Фильтры», карточка выбранного объекта. */
export function Viewport({ monitor = false }: { monitor?: boolean }) {
  const view = useStore((s) => s.view);
  const placing = useStore((s) => s.placing);
  const highlight = useStore((s) => s.highlight);
  const mode = monitor && view === 'split' ? '3d' : view;
  return (
    <div className={`viewport mode-${mode}`}>
      {mode !== 'plan' && (
        <div className="view-3d">
          <Scene3D monitor={monitor} />
        </div>
      )}
      {mode !== '3d' && (
        <div className="view-plan">
          <PlanEditor />
        </div>
      )}
      <ViewToolbar monitor={monitor} />
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
          Подсвечено ячеек: {highlight.length}
          <button className="btn small" onClick={() => useStore.getState().setHighlight([])}>
            Скрыть
          </button>
        </div>
      )}
      <Inspector />
    </div>
  );
}
