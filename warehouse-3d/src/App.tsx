import { useEffect } from 'react';
import { useStore, useWarehouse, type ViewMode } from './store';
import type { Step } from './types';
import { useConnectorRunner } from './lib/connectors';
import { useCells } from './lib/derived';
import { Scene3D } from './components/scene/Scene3D';
import { PlanEditor } from './components/plan/PlanEditor';
import { Inspector } from './components/Inspector';
import { ObjectsPanel } from './components/panels/ObjectsPanel';
import { RoomsPanel } from './components/panels/RoomsPanel';
import { ZonesPanel } from './components/panels/ZonesPanel';
import { RacksPanel } from './components/panels/RacksPanel';
import { CellsPanel } from './components/panels/CellsPanel';
import { ConnectPanel } from './components/panels/ConnectPanel';
import { FillPanel } from './components/panels/FillPanel';

const STEPS: { id: Step; title: string; short: string }[] = [
  { id: 'objects', title: 'Объекты', short: 'Объекты' },
  { id: 'rooms', title: 'Помещения', short: 'Помещ.' },
  { id: 'zones', title: 'Зоны', short: 'Зоны' },
  { id: 'racks', title: 'Стеллажи', short: 'Стелл.' },
  { id: 'cells', title: 'Ячейки', short: 'Ячейки' },
  { id: 'connect', title: 'Подключение', short: 'Подкл.' },
  { id: 'fill', title: 'Заполнение', short: 'Заполн.' },
];

const PANELS: Record<Step, () => React.ReactElement | null> = {
  objects: ObjectsPanel,
  rooms: RoomsPanel,
  zones: ZonesPanel,
  racks: RacksPanel,
  cells: CellsPanel,
  connect: ConnectPanel,
  fill: FillPanel,
};

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
      const s = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (typing) return;
      if (s.draw) {
        if (e.key === 'Escape') s.cancelDraw();
        if (e.key === 'Enter') s.finishDraw();
        if (e.key === 'Backspace') {
          e.preventDefault();
          s.undoDrawPoint();
        }
        return;
      }
      if (e.key === 'Escape') s.select(null);
      if (e.key === 'Delete' && s.selection?.kind === 'rack') {
        s.deleteRack(s.selection.id);
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function StepNav() {
  const step = useStore((s) => s.step);
  const w = useWarehouse();
  const hasFills = useStore((s) => !!(s.currentId && s.fills[s.currentId]));
  const { cells } = useCells();
  const done: Record<Step, boolean> = {
    objects: !!w,
    rooms: !!w?.rooms.length,
    zones: !!w?.zones.length,
    racks: !!w?.racks.length,
    cells: cells.length > 0,
    connect: !!w && w.connection.type !== 'none',
    fill: hasFills,
  };
  return (
    <nav className="steps">
      {STEPS.map((s, i) => (
        <button
          key={s.id}
          className={`step ${step === s.id ? 'active' : ''} ${done[s.id] ? 'done' : ''}`}
          onClick={() => useStore.getState().setStep(s.id)}
          title={s.title}
        >
          <span className="step-num">{done[s.id] && step !== s.id ? '✓' : i + 1}</span>
          <span className="step-title">{s.title}</span>
          <span className="step-short">{s.short}</span>
        </button>
      ))}
    </nav>
  );
}

function TopBar() {
  const warehouses = useStore((s) => s.warehouses);
  const currentId = useStore((s) => s.currentId);
  const view = useStore((s) => s.view);
  const show = useStore((s) => s.show);
  const theme = useStore((s) => s.theme);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const st = useStore.getState;
  const views: { v: ViewMode; label: string }[] = [
    { v: '3d', label: '3D' },
    { v: 'split', label: '3D + план' },
    { v: 'plan', label: 'План' },
  ];
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">▦</span>
        <span className="brand-name">Склад 3D</span>
      </div>
      <select
        className="wh-select"
        value={currentId ?? ''}
        onChange={(e) => st().setCurrent(e.target.value)}
        title="Текущий объект"
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <div className="seg small">
        <button disabled={!canUndo} onClick={() => st().undo()} title="Отменить (Ctrl+Z)">
          ↶
        </button>
        <button disabled={!canRedo} onClick={() => st().redo()} title="Повторить (Ctrl+Shift+Z)">
          ↷
        </button>
      </div>
      <div className="grow" />
      <div className="seg small">
        {views.map((x) => (
          <button key={x.v} className={view === x.v ? 'active' : ''} onClick={() => st().setView(x.v)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="seg small toggles">
        <button className={show.walls ? 'active' : ''} onClick={() => st().toggleShow('walls')} title="Стены помещений">
          Стены
        </button>
        <button
          className={show.zones ? 'active' : ''}
          onClick={() => st().toggleShow('zones')}
          title="Объём зон размещения"
        >
          Зоны
        </button>
        <button className={show.cells ? 'active' : ''} onClick={() => st().toggleShow('cells')} title="Ячейки">
          Ячейки
        </button>
        <button className={show.labels ? 'active' : ''} onClick={() => st().toggleShow('labels')} title="Подписи">
          Подписи
        </button>
      </div>
      <button
        className="icon-btn"
        onClick={() => st().setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="Тема оформления"
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  );
}

export function App() {
  const hydrated = useStore((s) => s.hydrated);
  const theme = useStore((s) => s.theme);
  const step = useStore((s) => s.step);
  const view = useStore((s) => s.view);
  const w = useWarehouse();
  useConnectorRunner();
  useHotkeys();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (!hydrated) return <div className="loading">Загрузка…</div>;
  const Panel = PANELS[step];

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <aside className="sidebar">
          <StepNav />
          <div className="panel">{w ? <Panel /> : <ObjectsPanel />}</div>
        </aside>
        <section className={`viewport view-${view}`}>
          {view !== 'plan' && (
            <div className="view-3d">
              <Scene3D />
            </div>
          )}
          {view !== '3d' && (
            <div className="view-plan">
              <PlanEditor />
            </div>
          )}
          <Inspector />
        </section>
      </div>
    </div>
  );
}
