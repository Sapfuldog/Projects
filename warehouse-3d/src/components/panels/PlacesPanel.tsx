import { useStore, useWarehouse } from '../../store';
import type { PlaceKind } from '../../types';
import { PLACE_KINDS } from '../../lib/demo';
import { Hint, Section, Select, Text } from '../ui';
import { Icon } from '../icons';

/** Места учёта виртуального склада: кабинеты, сотрудники, ремонт, в пути. */
export function PlacesPanel() {
  const w = useWarehouse();
  const st = useStore.getState;
  if (!w) return null;
  return (
    <Section
      title={`Места учёта (${w.places.length})`}
      actions={
        <button className="btn small primary" onClick={() => st().addPlace('storage')}>
          + Место
        </button>
      }
    >
      <Hint>
        Виртуальный склад не имеет адресного хранения: ТМЦ учитываются по местам — кабинет, сотрудник, сервисный центр,
        «в пути». Код места совпадает с кодом в учётной системе.
      </Hint>
      <div className="list">
        {w.places.map((p) => (
          <div key={p.id} className="place-row">
            <Text label="Код" value={p.code} mono onChange={(v) => st().updatePlace(p.id, { code: v })} />
            <Text label="Наименование" value={p.name} onChange={(v) => st().updatePlace(p.id, { name: v })} />
            <Select<PlaceKind>
              label="Вид"
              value={p.kind}
              onChange={(v) => st().updatePlace(p.id, { kind: v })}
              options={(Object.keys(PLACE_KINDS) as PlaceKind[]).map((k) => ({ value: k, label: PLACE_KINDS[k] }))}
            />
            <Text
              label="Примечание"
              value={p.note ?? ''}
              onChange={(v) => st().updatePlace(p.id, { note: v || undefined })}
            />
            <button
              className="icon-btn small"
              title="Удалить"
              onClick={() => st().ask(`Удалить место «${p.name}»?`, () => st().deletePlace(p.id))}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
