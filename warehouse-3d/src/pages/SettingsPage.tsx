import { useState } from 'react';
import { useStore } from '../store';
import type { TareKind } from '../types';
import { ObjectsPanel } from '../components/panels/ObjectsPanel';
import { ConnectPanel } from '../components/panels/ConnectPanel';
import { Icon, type IconName } from '../components/icons';
import { Check, ColorField, Hint, Num, Section, Select, Text } from '../components/ui';
import { TARE_KINDS } from '../lib/materials';

type Tab = 'objects' | 'source' | 'consumers' | 'tare' | 'user';

const TABS: { id: Tab; title: string; icon: IconName }[] = [
  { id: 'objects', title: 'Объекты', icon: 'warehouse' },
  { id: 'source', title: 'Учётная система', icon: 'link' },
  { id: 'consumers', title: 'Кладовые', icon: 'issue' },
  { id: 'tare', title: 'Виды тары', icon: 'pallet' },
  { id: 'user', title: 'Пользователь', icon: 'user' },
];

function Consumers() {
  const consumers = useStore((s) => s.consumers);
  const st = useStore.getState;
  return (
    <Section
      title="Кладовые производства"
      actions={
        <button className="btn small primary" onClick={() => st().addConsumer()}>
          + Кладовая
        </button>
      }
    >
      <Hint>
        Получатели ТМЦ из зоны выдачи: кладовые цехов и участков. Код совпадает с кодом получателя в учётной системе; за
        кладовой можно закрепить места в зоне выдачи (в конструкторе, раздел «Ячейки»).
      </Hint>
      <div className="list">
        {consumers.map((c) => (
          <div key={c.id} className="consumer-row">
            <Text label="Код" value={c.code} mono onChange={(v) => st().updateConsumer(c.id, { code: v })} />
            <Text label="Наименование" value={c.name} onChange={(v) => st().updateConsumer(c.id, { name: v })} />
            <Text label="Цех / участок" value={c.shop} onChange={(v) => st().updateConsumer(c.id, { shop: v })} />
            <Text
              label="Ответственный"
              value={c.responsible ?? ''}
              onChange={(v) => st().updateConsumer(c.id, { responsible: v })}
            />
            <button
              className="icon-btn small"
              title="Удалить"
              onClick={() => st().ask(`Удалить кладовую ${c.code}?`, () => st().deleteConsumer(c.id))}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TareTypes() {
  const tare = useStore((s) => s.tareTypes);
  const st = useStore.getState;
  return (
    <Section
      title="Виды тары"
      actions={
        <button className="btn small primary" onClick={() => st().addTareType()}>
          + Вид тары
        </button>
      }
    >
      <Hint>Поддоны, ящики, бочки, кабельные барабаны, кассеты и газовые баллоны. Цвет баллона — по виду газа.</Hint>
      <div className="list">
        {tare.map((t) => (
          <details key={t.id} className="tare-row">
            <summary>
              <i className="dot" style={{ background: t.color ?? '#a16207' }} />
              <b>{t.name}</b>
              <span className="muted small">
                {t.code} · {TARE_KINDS[t.kind]} · {t.length}×{t.width}×{t.height} мм · {t.weight} кг
              </span>
            </summary>
            <div className="grid3">
              <Text label="Код" value={t.code} mono onChange={(v) => st().updateTareType(t.id, { code: v })} />
              <Text label="Наименование" value={t.name} onChange={(v) => st().updateTareType(t.id, { name: v })} />
              <Select<TareKind>
                label="Вид"
                value={t.kind}
                onChange={(v) => st().updateTareType(t.id, { kind: v })}
                options={(Object.keys(TARE_KINDS) as TareKind[]).map((k) => ({ value: k, label: TARE_KINDS[k] }))}
              />
              <Num
                label="Длина"
                unit="мм"
                value={t.length}
                min={1}
                onChange={(v) => st().updateTareType(t.id, { length: v })}
              />
              <Num
                label="Ширина"
                unit="мм"
                value={t.width}
                min={1}
                onChange={(v) => st().updateTareType(t.id, { width: v })}
              />
              <Num
                label="Высота"
                unit="мм"
                value={t.height}
                min={1}
                onChange={(v) => st().updateTareType(t.id, { height: v })}
              />
              <Num
                label="Вес пустой"
                unit="кг"
                value={t.weight}
                min={0}
                step={0.1}
                onChange={(v) => st().updateTareType(t.id, { weight: v })}
              />
              <ColorField
                label="Цвет"
                value={t.color ?? '#a16207'}
                onChange={(v) => st().updateTareType(t.id, { color: v })}
              />
              <div className="field">
                <span className="field-label">&nbsp;</span>
                <Check
                  label="Возвратная"
                  checked={t.returnable}
                  onChange={(v) => st().updateTareType(t.id, { returnable: v })}
                />
              </div>
            </div>
            <button
              className="btn small danger"
              onClick={() => st().ask(`Удалить вид тары «${t.name}»?`, () => st().deleteTareType(t.id))}
            >
              Удалить
            </button>
          </details>
        ))}
      </div>
    </Section>
  );
}

function UserTab() {
  const user = useStore((s) => s.user);
  const theme = useStore((s) => s.theme);
  const st = useStore.getState;
  return (
    <Section title="Пользователь и оформление">
      <div className="grid2">
        <Text label="Имя" value={user.name} onChange={(v) => st().setUser({ name: v })} />
        <Text label="Должность / подразделение" value={user.role} onChange={(v) => st().setUser({ role: v })} />
      </div>
      <Select
        label="Тема"
        value={theme}
        onChange={(v) => st().setTheme(v)}
        options={[
          { value: 'dark', label: 'Тёмная' },
          { value: 'light', label: 'Светлая' },
        ]}
      />
    </Section>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('objects');
  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
          <p className="muted">Объекты, подключение к учётной системе и справочники</p>
        </div>
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
          {tab === 'source' && <ConnectPanel />}
          {tab === 'consumers' && <Consumers />}
          {tab === 'tare' && <TareTypes />}
          {tab === 'user' && <UserTab />}
        </div>
      </div>
    </div>
  );
}
