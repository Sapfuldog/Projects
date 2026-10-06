import { useEffect } from 'react';
import { useStore } from './store';
import type { Section } from './types';
import { useConnectorRunner } from './lib/connectors';
import { ConfirmDialog, MobileTabs, NavRail, Toasts, TopBar } from './components/shell/Shell';
import { HomePage } from './pages/HomePage';
import { WarehousePage } from './pages/WarehousePage';
import { StockPage } from './pages/StockPage';
import { DocsPage } from './pages/DocsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

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
      if (s.placing && e.key === 'Escape') return s.startPlacing(null);
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
      if (e.key === 'Delete' && s.section === 'warehouse') {
        if (s.selection?.kind === 'rack') s.deleteRack(s.selection.id);
        else if (s.selection?.kind === 'equipment') s.deleteEquipment(s.selection.id);
        else return;
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Page({ section }: { section: Section }) {
  switch (section) {
    case 'warehouse':
      return <WarehousePage />;
    case 'stock':
      return <StockPage />;
    case 'inbound':
      return <DocsPage key="inbound" kind="receipt" />;
    case 'orders':
      return <DocsPage key="orders" kind="order" />;
    case 'analytics':
      return <AnalyticsPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <HomePage />;
  }
}

export function App() {
  const hydrated = useStore((s) => s.hydrated);
  const theme = useStore((s) => s.theme);
  const section = useStore((s) => s.section);
  useConnectorRunner();
  useHotkeys();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (!hydrated) return <div className="loading">Загрузка…</div>;

  return (
    <div className="shell">
      <NavRail />
      <main className="main">
        <TopBar />
        <div className="content">
          <Page section={section} />
        </div>
      </main>
      <MobileTabs />
      <Toasts />
      <ConfirmDialog />
    </div>
  );
}
