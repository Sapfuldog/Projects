import { useState } from 'react';
import { useStore, useWarehouse } from '../store';
import { ObjectsPanel } from '../components/panels/ObjectsPanel';
import { ConnectPanel } from '../components/panels/ConnectPanel';
import { Section, Text, Hint } from '../components/ui';
import { Icon, type IconName } from '../components/icons';

type Tab = 'objects' | 'connect' | 'profile';

const TABS: { id: Tab; title: string; icon: IconName }[] = [
  { id: 'objects', title: 'Объекты и данные', icon: 'warehouse' },
  { id: 'connect', title: 'Подключение', icon: 'link' },
  { id: 'profile', title: 'Профиль и вид', icon: 'user' },
];

function Profile() {
  const user = useStore((s) => s.user);
  const theme = useStore((s) => s.theme);
  const w = useWarehouse();
  const st = useStore.getState;
  return (
    <>
      <Section title="Пользователь">
        <Text
          label="Имя (подписывает операции в журнале)"
          value={user.name}
          onChange={(v) => st().setUser({ name: v || 'Оператор' })}
        />
        <Text label="Должность" value={user.role} onChange={(v) => st().setUser({ role: v })} />
      </Section>
      <Section title="Оформление">
        <div className="chips">
          <button className={`chip ${theme === 'dark' ? 'active' : ''}`} onClick={() => st().setTheme('dark')}>
            <Icon name="moon" size={14} /> Тёмная
          </button>
          <button className={`chip ${theme === 'light' ? 'active' : ''}`} onClick={() => st().setTheme('light')}>
            <Icon name="sun" size={14} /> Светлая
          </button>
        </div>
      </Section>
      {w?.connection.type === 'internal' && (
        <Section title="Демо-данные">
          <Hint>
            Пересоздать остатки и историю операций за 30 дней для текущего склада (структура склада не меняется).
          </Hint>
          <button
            className="btn small danger"
            onClick={() => {
              if (!confirm('Заменить остатки, документы и журнал операций текущего склада демо-данными?')) return;
              st().resetDemoInventory();
              st().toast('Демо-данные пересозданы');
            }}
          >
            Пересоздать демо-остатки
          </button>
        </Section>
      )}
    </>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('objects');
  return (
    <div className="page settings">
      <div className="page-head">
        <h1>Настройки</h1>
      </div>
      <div className="settings-grid">
        <nav className="card settings-nav">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} />
              <span>{t.title}</span>
            </button>
          ))}
        </nav>
        <div className="card settings-body">
          {tab === 'objects' && <ObjectsPanel />}
          {tab === 'connect' && <ConnectPanel />}
          {tab === 'profile' && <Profile />}
        </div>
      </div>
    </div>
  );
}
