import { useRef } from 'react';
import { useStore, useWarehouse } from '../../store';
import { monitorOf } from '../../lib/monitor';
import { polygonArea } from '../../lib/geometry';
import type { Inventory, Warehouse } from '../../types';
import { Hint, Section, Select, Text, download, pct } from '../ui';
import { Meter } from '../CellCard';
import { Icon } from '../icons';

interface ExportFile {
  format: 'warehouse-3d';
  version: 3;
  exportedAt: string;
  warehouses: Warehouse[];
  inventory?: Record<string, Inventory>;
}

function WarehouseCard({ w, current }: { w: Warehouse; current: boolean }) {
  const st = useStore.getState;
  const inv = useStore((s) => s.inventory[w.id]);
  const products = useStore((s) => s.products);
  const tare = useStore((s) => s.tareTypes);
  const m = monitorOf(w, inv, products, tare);
  const s = m.stats.all;
  const area = w.rooms.reduce((sum, r) => sum + polygonArea(r.points), 0);
  return (
    <div className={`card ${current ? 'active' : ''}`} onClick={() => !current && st().setCurrent(w.id)}>
      <div className="card-title">
        <span>
          <Icon name={w.kind === 'virtual' ? 'virtual' : 'warehouse'} size={16} /> {w.name}
        </span>
        {current && <span className="badge">открыт</span>}
      </div>
      {w.address && <div className="muted small">{w.address}</div>}
      <div className="card-metrics">
        {w.kind === 'physical' ? (
          <>
            <span>{w.rooms.length} помещ.</span>
            <span>{w.floors.length} эт.</span>
            <span>{Math.round(area).toLocaleString('ru-RU')} м²</span>
            <span>{w.racks.length} стелл.</span>
            <span>{w.mezzanines.length} мезон.</span>
          </>
        ) : (
          <span>{w.places.length} мест учёта</span>
        )}
        <span>{s.cells.toLocaleString('ru-RU')} яч.</span>
      </div>
      {s.cells > 0 && <Meter value={s.fill} label="Заполнение" sub={pct(s.fill)} />}
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {!current && (
          <button className="btn small" onClick={() => st().setCurrent(w.id)}>
            Открыть
          </button>
        )}
        <button className="btn small" onClick={() => st().duplicateWarehouse(w.id)}>
          Копия
        </button>
        <button
          className="btn small danger"
          onClick={() =>
            st().ask(`Удалить объект «${w.name}» со всей структурой и срезом остатков?`, () =>
              st().deleteWarehouse(w.id),
            )
          }
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

export function ObjectsPanel() {
  const warehouses = useStore((s) => s.warehouses);
  const currentId = useStore((s) => s.currentId);
  const w = useWarehouse();
  const st = useStore.getState;
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = (only?: Warehouse) => {
    const s = st();
    const list = only ? [only] : s.warehouses;
    const data: ExportFile = {
      format: 'warehouse-3d',
      version: 3,
      exportedAt: new Date().toISOString(),
      warehouses: list,
      inventory: Object.fromEntries(list.filter((x) => s.inventory[x.id]).map((x) => [x.id, s.inventory[x.id]])),
    };
    const name = only ? only.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') : 'склады';
    download(`${name}.json`, JSON.stringify(data), 'application/json');
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<ExportFile> | Warehouse;
      const list = 'warehouses' in data && Array.isArray(data.warehouses) ? data.warehouses : [data as Warehouse];
      if (!list.every((x) => x && Array.isArray(x.rooms) && Array.isArray(x.racks) && Array.isArray(x.floors)))
        throw new Error('Неизвестный формат файла (нужна выгрузка версии 3)');
      st().importWarehouses(list, 'inventory' in data ? data.inventory : undefined);
      st().toast(`Загружено объектов: ${list.length}`);
    } catch (e) {
      st().toast(`Не удалось загрузить: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  return (
    <>
      <Section title="Объекты">
        <Hint>
          Склады завода: здания и помещения, дворовые территории, навесы — и виртуальные склады (учёт по местам без
          адресов, например IT-оборудование). Можно создать сколько угодно объектов.
        </Hint>
        <div className="row wrap">
          <button
            className="btn small primary"
            onClick={() => (st().createWarehouse('empty'), st().setSection('warehouse', 'rooms'))}
          >
            <Icon name="warehouse" size={15} /> Новый склад
          </button>
          <button
            className="btn small"
            onClick={() => (st().createWarehouse('virtual'), st().setSection('warehouse', 'places'))}
          >
            <Icon name="virtual" size={15} /> Виртуальный склад
          </button>
          <button className="btn small" onClick={() => st().createWarehouse('demo')}>
            + Демо: склад завода
          </button>
          <button className="btn small" onClick={() => st().createWarehouse('demo-it')}>
            + Демо: IT-склад
          </button>
        </div>
        <div className="cards">
          {warehouses.map((x) => (
            <WarehouseCard key={x.id} w={x} current={x.id === currentId} />
          ))}
        </div>
      </Section>

      {w && (
        <Section title="Карточка объекта">
          <Text label="Название" value={w.name} onChange={(v) => st().updateWarehouse({ name: v })} />
          <Text label="Адрес / площадка" value={w.address} onChange={(v) => st().updateWarehouse({ address: v })} />
          <Text label="Описание" value={w.description} onChange={(v) => st().updateWarehouse({ description: v })} />
          <div className="grid2">
            <Select
              label="Вид объекта"
              value={w.kind}
              onChange={(v) => st().updateWarehouse({ kind: v })}
              options={[
                { value: 'physical', label: 'Физический (здания, двор)' },
                { value: 'virtual', label: 'Виртуальный (места учёта)' },
              ]}
            />
            <Text
              label="Шаблон адреса ячейки"
              value={w.addressTemplate}
              mono
              onChange={(v) => st().updateWarehouse({ addressTemplate: v })}
            />
          </div>
          <Hint>
            В шаблоне: <code>{'{room}'}</code> помещение, <code>{'{zone}'}</code> зона, <code>{'{rack}'}</code> стеллаж,{' '}
            <code>{'{section}'}</code> секция, <code>{'{tier}'}</code> ярус, <code>{'{cell}'}</code> место.
          </Hint>
        </Section>
      )}

      <Section title="Резервная копия">
        <Hint>
          Структура и срезы хранятся в браузере. Для переноса на другой компьютер выгрузите файл и загрузите его там.
        </Hint>
        <div className="row wrap">
          {w && (
            <button className="btn small" onClick={() => exportAll(w)}>
              Выгрузить текущий
            </button>
          )}
          <button className="btn small" onClick={() => exportAll()}>
            Выгрузить все
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            Загрузить из файла…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </Section>
    </>
  );
}
