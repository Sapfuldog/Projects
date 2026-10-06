import { useEffect } from 'react';
import { useStore, useWarehouse } from '../store';
import type { Step } from '../types';
import { Viewport } from '../components/Viewport';
import { Icon, type IconName } from '../components/icons';
import { RoomsPanel } from '../components/panels/RoomsPanel';
import { ZonesPanel } from '../components/panels/ZonesPanel';
import { RacksPanel } from '../components/panels/RacksPanel';
import { CellsPanel } from '../components/panels/CellsPanel';
import { EquipmentPanel } from '../components/panels/EquipmentPanel';
import { useCells } from '../lib/derived';

const TABS: { id: Step; title: string; icon: IconName }[] = [
  { id: 'rooms', title: 'Здания', icon: 'building' },
  { id: 'zones', title: 'Зоны', icon: 'zone' },
  { id: 'racks', title: 'Стеллажи', icon: 'rack' },
  { id: 'cells', title: 'Ячейки', icon: 'cells' },
  { id: 'equipment', title: 'Оборудование', icon: 'forklift' },
  { id: 'other', title: 'Другое', icon: 'dots' },
];

function Panel({ step }: { step: Step }) {
  switch (step) {
    case 'zones':
      return <ZonesPanel />;
    case 'racks':
      return <RacksPanel />;
    case 'cells':
      return <CellsPanel />;
    case 'equipment':
      return <EquipmentPanel group="equipment" />;
    case 'other':
      return <EquipmentPanel group="other" />;
    default:
      return <RoomsPanel />;
  }
}

export function WarehousePage() {
  const step = useStore((s) => s.step);
  const w = useWarehouse();
  const { cells } = useCells();
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const st = useStore.getState;
  const tab = TABS.some((t) => t.id === step) ? step : 'rooms';

  useEffect(() => {
    if (tab !== step) st().setStep(tab);
  }, [tab, step, st]);

  return (
    <div className="page warehouse">
      <div className="card wh-view">
        <Viewport />
      </div>
      <aside className="card constructor">
        <div className="constructor-head">
          <h2>Конструктор склада</h2>
          <div className="seg small">
            <button disabled={!past} onClick={() => st().undo()} title="Отменить (Ctrl+Z)">
              <Icon name="undo" size={16} />
            </button>
            <button disabled={!future} onClick={() => st().redo()} title="Повторить (Ctrl+Shift+Z)">
              <Icon name="redo" size={16} />
            </button>
          </div>
        </div>
        <nav className="ctabs">
          {TABS.map((t) => (
            <button key={t.id} className={`ctab ${tab === t.id ? 'active' : ''}`} onClick={() => st().setStep(t.id)}>
              <Icon name={t.icon} size={20} />
              <span>{t.title}</span>
            </button>
          ))}
        </nav>
        <div className="constructor-body">{w ? <Panel step={tab} /> : <p className="muted">Создайте склад.</p>}</div>
        <div className="constructor-foot">
          <span className="muted small">
            {w?.rooms.length ?? 0} помещ. · {w?.zones.length ?? 0} зон · {w?.racks.length ?? 0} стелл. ·{' '}
            {cells.length.toLocaleString('ru-RU')} яч. · {w?.equipment.length ?? 0} обор.
          </span>
          <button className="btn primary block" onClick={() => st().toast('Изменения сохранены в браузере')}>
            <Icon name="save" size={16} /> Сохранить изменения
          </button>
        </div>
      </aside>
    </div>
  );
}
