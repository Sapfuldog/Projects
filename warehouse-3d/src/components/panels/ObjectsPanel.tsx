import { useRef } from 'react';
import { useStore, useWarehouse } from '../../store';
import { cellsOf, internalFills } from '../../lib/derived';
import { computeStats } from '../../lib/fill';
import { polygonArea } from '../../lib/geometry';
import type { CellFill, Warehouse } from '../../types';
import { Bar, Hint, Section, Text, download, pct } from '../ui';

interface ExportFile {
  format: 'warehouse-3d';
  version: 1;
  exportedAt: string;
  warehouses: Warehouse[];
  fills?: Record<string, Record<string, CellFill>>;
}

function WarehouseCard({ w, current }: { w: Warehouse; current: boolean }) {
  const st = useStore.getState;
  const stored = useStore((s) => s.fills[w.id]);
  const inv = useStore((s) => s.inventory[w.id]);
  const products = useStore((s) => s.products);
  const { cells } = cellsOf(w);
  const fills = w.connection.type === 'internal' ? internalFills(cells, inv, products) : stored;
  const stats = computeStats(cells, fills ?? {}).all;
  const area = w.rooms.reduce((s, r) => s + polygonArea(r.points), 0);
  return (
    <div className={`card ${current ? 'active' : ''}`} onClick={() => !current && st().setCurrent(w.id)}>
      <div className="card-title">
        <span>{w.name}</span>
        {current && <span className="badge">открыт</span>}
      </div>
      {w.address && <div className="muted small">{w.address}</div>}
      <div className="card-metrics">
        <span>{w.rooms.length} помещ.</span>
        <span>{Math.round(area).toLocaleString('ru-RU')} м²</span>
        <span>{w.zones.length} зон</span>
        <span>{w.racks.length} стелл.</span>
        <span>{cells.length.toLocaleString('ru-RU')} яч.</span>
      </div>
      {fills && stats.available > 0 && (
        <div className="card-fill">
          <Bar value={stats.avgFill} />
          <span className="small">заполнено {pct(stats.avgFill)}</span>
        </div>
      )}
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
            confirm(`Удалить объект «${w.name}» со всеми помещениями и стеллажами?`) && st().deleteWarehouse(w.id)
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
      version: 1,
      exportedAt: new Date().toISOString(),
      warehouses: list,
      fills: Object.fromEntries(list.filter((x) => s.fills[x.id]).map((x) => [x.id, s.fills[x.id]])),
    };
    const name = only ? only.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') : 'склады';
    download(`${name}.json`, JSON.stringify(data, null, 1), 'application/json');
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<ExportFile> | Warehouse;
      const list = 'warehouses' in data && Array.isArray(data.warehouses) ? data.warehouses : [data as Warehouse];
      if (!list.every((x) => x && Array.isArray(x.rooms) && Array.isArray(x.racks)))
        throw new Error('Неизвестный формат файла');
      st().importWarehouses(list, 'fills' in data ? data.fills : undefined);
      alert(`Загружено объектов: ${list.length}`);
    } catch (e) {
      alert(`Не удалось загрузить: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <>
      <Section
        title="Объекты"
        actions={
          <>
            <button className="btn small primary" onClick={() => st().createWarehouse('empty')}>
              + Новый склад
            </button>
            <button className="btn small" onClick={() => st().createWarehouse('demo')}>
              + Демо
            </button>
          </>
        }
      >
        <Hint>
          Создайте сколько угодно объектов (складов). Порядок работы: форма помещений → зоны размещения и их высота →
          стеллажи, ярусы и ячейки (Д×Ш×В, Г) → подключение к учётной системе → заполнение.
        </Hint>
        <div className="cards">
          {warehouses.map((x) => (
            <WarehouseCard key={x.id} w={x} current={x.id === currentId} />
          ))}
        </div>
      </Section>

      {w && (
        <Section title="Карточка объекта">
          <Text label="Название" value={w.name} onChange={(v) => st().updateWarehouse({ name: v })} />
          <Text label="Адрес" value={w.address} onChange={(v) => st().updateWarehouse({ address: v })} />
          <Text label="Описание" value={w.description} onChange={(v) => st().updateWarehouse({ description: v })} />
          <div className="row">
            <button className="btn" onClick={() => st().setSection('warehouse', 'rooms')}>
              Далее: помещения →
            </button>
          </div>
        </Section>
      )}

      <Section title="Резервная копия">
        <Hint>Данные хранятся в браузере. Для переноса на другой компьютер выгрузите файл и загрузите его там.</Hint>
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
