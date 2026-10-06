import { useEffect } from 'react';
import { useStore, useWarehouse } from '../store';
import type { Step } from '../types';
import { Viewport } from '../components/Viewport';
import { Icon, type IconName } from '../components/icons';
import { RoomsPanel } from '../components/panels/RoomsPanel';
import { ZonesPanel } from '../components/panels/ZonesPanel';
import { RacksPanel } from '../components/panels/RacksPanel';
import { MezzaninePanel } from '../components/panels/MezzaninePanel';
import { CellsPanel } from '../components/panels/CellsPanel';
import { EquipmentPanel } from '../components/panels/EquipmentPanel';
import { PlacesPanel } from '../components/panels/PlacesPanel';
import { useCells } from '../lib/derived';

const TABS: { id: Step; title: string; icon: IconName }[] = [
  { id: 'rooms', title: 'Здания', icon: 'building' },
  { id: 'zones', title: 'Зоны', icon: 'zone' },
  { id: 'racks', title: 'Стеллажи', icon: 'rack' },
  { id: 'mezzanine', title: 'Мезонины', icon: 'stairs' },
  { id: 'cells', title: 'Ячейки', icon: 'cells' },
  { id: 'equipment', title: 'Техника', icon: 'forklift' },
  { id: 'other', title: 'Другое', icon: 'dots' },
];

function Panel({ step }: { step: Step }) {
  switch (step) {
    case 'zones':
      return <ZonesPanel />;
    case 'racks':
      return <RacksPanel />;
    case 'mezzanine':
      return <MezzaninePanel />;
    case 'cells':
      return <CellsPanel />;
    case 'equipment':
      return <EquipmentPanel group="equipment" />;
    case 'other':
      return <EquipmentPanel group="other" />;
    case 'places':
      return <PlacesPanel />;
    default:
      return <RoomsPanel />;
  }
}

/** Конструктор склада: здания и этажи, зоны, стеллажи, мезонины, ячейки, оборудование; для виртуального — места учёта. */
export function WarehousePage() {
  const step = useStore((s) => s.step);
  const w = useWarehouse();
  const { cells } = useCells();
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const st = useStore.getState;
  const virtual = w?.kind === 'virtual';
  const tabs = virtual ? [{ id: 'places' as Step, title: 'Места учёта', icon: 'virtual' as IconName }] : TABS;
  const tab = tabs.some((t) => t.id === step) ? step : tabs[0].id;

  useEffect(() => {
    if (tab !== step) st().setStep(tab);
  }, [tab, step, st]);

  return (
    <div className="page warehouse">
      <div className="card wh-view">
        <Viewport mode="build" />
      </div>
      <aside className="card constructor">
        <div className="constructor-head">
          <div>
            <h2>Конструктор</h2>
            <div className="muted small">{w?.name}</div>
          </div>
          <div className="seg small">
            <button disabled={!past} onClick={() => st().undo()} title="Отменить (Ctrl+Z)">
              <Icon name="undo" size={16} />
            </button>
            <button disabled={!future} onClick={() => st().redo()} title="Повторить (Ctrl+Shift+Z)">
              <Icon name="redo" size={16} />
            </button>
          </div>
        </div>
        <nav className={`ctabs n${tabs.length}`}>
          {tabs.map((t) => (
            <button key={t.id} className={`ctab ${tab === t.id ? 'active' : ''}`} onClick={() => st().setStep(t.id)}>
              <Icon name={t.icon} size={19} />
              <span>{t.title}</span>
            </button>
          ))}
        </nav>
        <div className="constructor-body">
          {w ? <Panel step={tab} /> : <p className="muted">Создайте склад в настройках.</p>}
        </div>
        <div className="constructor-foot">
          <span className="muted small">
            {virtual
              ? `${w?.places.length ?? 0} мест учёта`
              : `${w?.floors.length ?? 0} эт. · ${w?.rooms.length ?? 0} помещ. · ${w?.zones.length ?? 0} зон · ${w?.racks.length ?? 0} стелл. · ${w?.mezzanines.length ?? 0} мезон. · ${cells.length.toLocaleString('ru-RU')} яч.`}
          </span>
          <span className="muted small">Изменения сохраняются в браузере автоматически.</span>
        </div>
      </aside>
    </div>
  );
}
