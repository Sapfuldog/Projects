import { useRef, useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { ConnectionType, FieldMapping } from '../../types';
import { applyRows, fetchRows, parsePayload, pushStructure, structurePayload } from '../../lib/connectors';
import { useCells } from '../../lib/derived';
import { extractRows, toCSV } from '../../lib/fill';
import { Hint, Num, Section, Text, download } from '../ui';

const TYPES: { value: ConnectionType; title: string; desc: string }[] = [
  { value: 'internal', title: 'Внутренний учёт', desc: 'Остатки, поставки и заказы в этом приложении' },
  { value: 'none', title: 'Нет', desc: 'Только структура склада' },
  { value: 'demo', title: 'Демо-симулятор', desc: 'Случайное заполнение для проверки' },
  { value: 'rest', title: 'REST API', desc: 'Опрос WMS / 1С / БД по HTTP' },
  { value: 'ws', title: 'WebSocket', desc: 'Изменения в реальном времени' },
  { value: 'file', title: 'Файл', desc: 'CSV из Excel или JSON' },
];

const MAPPING_FIELDS: { key: keyof FieldMapping; label: string; hint: string }[] = [
  { key: 'address', label: 'Адрес ячейки*', hint: 'обязательно' },
  { key: 'fill', label: 'Заполненность', hint: '0..1 или 0..100 %' },
  { key: 'qty', label: 'Количество', hint: 'если нет заполненности' },
  { key: 'capacity', label: 'Вместимость', hint: 'заполн. = кол-во / вместимость' },
  { key: 'weight', label: 'Вес, кг', hint: 'сравнивается с Г' },
  { key: 'sku', label: 'Артикул / SKU', hint: '' },
  { key: 'name', label: 'Наименование', hint: '' },
];

const SAMPLE = `{
  "items": [
    { "address": "A-01-01-01", "fill": 0.8, "weight": 640, "sku": "12345", "name": "Вода 0,5л" },
    { "address": "A-01-02-03", "qty": 12, "capacity": 40, "weight": 210 }
  ]
}`;

function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s} с назад`;
  if (s < 3600) return `${Math.round(s / 60)} мин назад`;
  return new Date(ts).toLocaleString('ru-RU');
}

export function ConnectPanel() {
  const w = useWarehouse();
  const sync = useStore((s) => (s.currentId ? s.sync[s.currentId] : undefined));
  const hasFills = useStore((s) => !!(s.currentId && s.fills[s.currentId]));
  const { cells } = useCells();
  const st = useStore.getState;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!w) return null;
  const c = w.connection;
  const up = st().updateConnection;

  const testRest = async () => {
    setBusy(true);
    setMsg('');
    try {
      const rows = await fetchRows(c);
      const r = applyRows(w, rows, `REST ${c.url}`, true);
      setMsg(`Получено записей: ${r.received}, сопоставлено ячеек: ${r.matched}`);
    } catch (e) {
      setMsg(`Ошибка: ${e instanceof Error ? e.message : e}. Проверьте адрес и разрешение CORS на сервере.`);
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (f: File) => {
    try {
      const rows = extractRows(parsePayload(await f.text()), c.path);
      const r = applyRows(w, rows, `Файл ${f.name}`, true);
      setMsg(`Файл «${f.name}»: записей ${r.received}, сопоставлено ячеек ${r.matched}`);
    } catch (e) {
      setMsg(`Ошибка чтения файла: ${e instanceof Error ? e.message : e}`);
    }
  };

  const push = async () => {
    setBusy(true);
    try {
      const n = await pushStructure(w);
      setMsg(`Структура отправлена: ${n} ячеек`);
    } catch (e) {
      setMsg(`Ошибка отправки: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const templateCSV = () =>
    download(
      `шаблон_заполнения_${w.name}.csv`,
      toCSV(
        [
          c.mapping.address || 'address',
          c.mapping.fill || 'fill',
          c.mapping.weight || 'weight',
          c.mapping.sku || 'sku',
          c.mapping.name || 'name',
        ],
        cells.slice(0, 5000).map((x) => [x.address, '', '', '', '']),
      ),
      'text/csv;charset=utf-8',
    );

  return (
    <>
      <Section title="Источник данных о заполнении">
        <div className="type-grid">
          {TYPES.map((t) => (
            <button
              key={t.value}
              className={`type-card ${c.type === t.value ? 'active' : ''}`}
              onClick={() => up({ type: t.value, active: t.value === 'demo' ? true : false })}
            >
              <b>{t.title}</b>
              <span>{t.desc}</span>
            </button>
          ))}
        </div>

        {c.type === 'internal' && (
          <div className="note">
            Заполнение ячеек считается по остаткам из разделов «Поставки», «Заказы» и «Остатки»: объём товара
            относительно объёма ячейки (Д×Ш×В), вес — относительно Г.
          </div>
        )}
        {c.type === 'demo' && (
          <>
            <div className="grid2">
              <Num
                label="Средняя заполненность"
                unit="%"
                value={Math.round(c.demoTarget * 100)}
                min={0}
                max={100}
                onChange={(v) => up({ demoTarget: v / 100 })}
              />
              <Num
                label="Обновлять каждые"
                unit="с"
                value={c.demoInterval}
                min={1}
                max={600}
                onChange={(v) => up({ demoInterval: v })}
              />
            </div>
            <div className="row">
              <button className={`btn ${c.active ? 'active' : 'primary'}`} onClick={() => up({ active: !c.active })}>
                {c.active ? '■ Остановить' : '▶ Запустить'}
              </button>
            </div>
          </>
        )}

        {(c.type === 'rest' || c.type === 'ws') && (
          <>
            <Text
              label={c.type === 'rest' ? 'URL (GET, JSON или CSV)' : 'URL WebSocket (ws:// или wss://)'}
              mono
              placeholder={c.type === 'rest' ? 'https://wms.example.ru/api/stock' : 'wss://wms.example.ru/stock'}
              value={c.url}
              onChange={(v) => up({ url: v.trim() })}
            />
            {c.type === 'rest' && (
              <>
                <Text
                  label='Заголовки (JSON), напр. {"Authorization":"Bearer …"}'
                  mono
                  value={c.headers}
                  onChange={(v) => up({ headers: v })}
                />
                <Num
                  label="Опрашивать каждые"
                  unit="с"
                  value={c.interval}
                  min={5}
                  max={86400}
                  onChange={(v) => up({ interval: v })}
                />
              </>
            )}
            <div className="row wrap">
              {c.type === 'rest' && (
                <button className="btn" disabled={busy || !c.url} onClick={testRest}>
                  Загрузить сейчас
                </button>
              )}
              <button
                className={`btn ${c.active ? 'active' : 'primary'}`}
                disabled={!c.url}
                onClick={() => up({ active: !c.active })}
              >
                {c.active ? '■ Отключить' : c.type === 'rest' ? '▶ Автообновление' : '▶ Подключиться'}
              </button>
            </div>
          </>
        )}

        {c.type === 'file' && (
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) loadFile(f);
            }}
            onClick={() => fileRef.current?.click()}
          >
            Перетащите CSV/JSON сюда или нажмите, чтобы выбрать файл
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {msg && <div className="note">{msg}</div>}
        {sync && (
          <div className={`sync ${sync.error ? 'error' : ''}`}>
            <div>
              <b>{sync.error ? 'Ошибка' : 'Последнее обновление'}</b> · {timeAgo(sync.at)} · {sync.source}
            </div>
            {sync.error ? (
              <div>{sync.error}</div>
            ) : (
              <div>
                Записей: {sync.received.toLocaleString('ru-RU')} · сопоставлено ячеек:{' '}
                {sync.matched.toLocaleString('ru-RU')}
                {sync.unmatched.length > 0 && (
                  <details>
                    <summary>
                      Не найдены адреса ({sync.unmatched.length}
                      {sync.unmatched.length >= 50 ? '+' : ''})
                    </summary>
                    <div className="mono small">{sync.unmatched.join(', ')}</div>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
        {hasFills && (
          <button className="btn small" onClick={() => (up({ active: false }), st().clearFills(w.id))}>
            Очистить данные заполнения
          </button>
        )}
      </Section>

      {(c.type === 'rest' || c.type === 'ws' || c.type === 'file') && (
        <Section title="Сопоставление полей">
          <Text
            label="Путь к массиву записей (пусто — корень)"
            mono
            placeholder="data.items"
            value={c.path}
            onChange={(v) => up({ path: v.trim() })}
          />
          <div className="mapping">
            {MAPPING_FIELDS.map((f) => (
              <Text
                key={f.key}
                label={
                  <>
                    {f.label} <span className="muted">{f.hint}</span>
                  </>
                }
                mono
                value={c.mapping[f.key]}
                onChange={(v) => up({ mapping: { ...c.mapping, [f.key]: v.trim() } })}
              />
            ))}
          </div>
          <Hint>
            Ожидаемый формат (поля переименовываются выше, вложенные — через точку, например <code>stock.qty</code>):
          </Hint>
          <pre className="code-block">{SAMPLE}</pre>
          <Hint>
            Поддерживаются также CSV с заголовком (разделитель «;» или «,») и словарь вида{' '}
            <code>{'{"A-01-01-01": {"fill": 0.5}}'}</code>. Несколько записей на один адрес суммируются.
          </Hint>
        </Section>
      )}

      <Section title="Выгрузка структуры в учётную систему">
        <Hint>Передайте адреса и параметры ячеек (Д, Ш, В, Г) в WMS/1С, чтобы адреса совпадали.</Hint>
        <div className="row wrap">
          <button
            className="btn small"
            onClick={() =>
              download(
                `структура_${w.name}.json`,
                JSON.stringify(structurePayload(w, cells), null, 1),
                'application/json',
              )
            }
          >
            JSON структуры
          </button>
          <button className="btn small" onClick={templateCSV}>
            Шаблон CSV для заполнения
          </button>
        </div>
        <Text
          label="URL для отправки структуры (POST JSON)"
          mono
          placeholder="https://wms.example.ru/api/locations"
          value={c.pushUrl}
          onChange={(v) => up({ pushUrl: v.trim() })}
        />
        <button className="btn small" disabled={!c.pushUrl || busy} onClick={push}>
          Отправить структуру
        </button>
      </Section>
    </>
  );
}
