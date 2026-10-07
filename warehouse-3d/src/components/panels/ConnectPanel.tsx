import { useRef, useState } from 'react';
import { useStore, useWarehouse } from '../../store';
import type { ConnectionType, FieldMapping } from '../../types';
import { cellsOf } from '../../lib/monitor';
import { useInventory, useProductsMap, useTareMap } from '../../lib/derived';
import { SNAPSHOT_FIELDS, extractRows, parsePayload, snapshotRows, structurePayload, toCSV } from '../../lib/snapshot';
import { applyRows, fetchRows, pushStructure } from '../../lib/connectors';
import { timeAgo } from '../../lib/analytics';
import { Check, Hint, Num, Section, Text, download } from '../ui';
import { Icon } from '../icons';
import { useServer } from '../../lib/shared';

const TYPES: { value: ConnectionType; title: string; hint: string }[] = [
  { value: 'none', title: 'Нет', hint: 'Данные не обновляются' },
  { value: 'demo', title: 'Демо-поток', hint: 'Имитация учётной системы: выдача, приход, баллоны' },
  { value: 'rest', title: 'REST API', hint: 'Опрос среза остатков (JSON или CSV)' },
  { value: 'ws', title: 'WebSocket', hint: 'Изменения по ячейкам в реальном времени' },
  { value: 'file', title: 'Файл', hint: 'Выгрузка из 1С/WMS: CSV или JSON' },
];

/** Подключение к учётной системе: тип источника, сопоставление полей, проверка, выгрузка структуры. */
export function ConnectPanel() {
  const w = useWarehouse();
  const inv = useInventory();
  const products = useProductsMap();
  const tare = useTareMap();
  const sync = useStore((s) => (s.currentId ? s.sync[s.currentId] : undefined));
  const st = useStore.getState;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const serverMode = useServer((s) => s.mode === 'server');
  if (!w) return null;
  const c = w.connection;
  const up = st().updateConnection;
  const setMap = (k: keyof FieldMapping, v: string) => up({ mapping: { ...c.mapping, [k]: v } });

  const runFile = async (f: File) => {
    try {
      const rows = extractRows(parsePayload(await f.text()), c.path);
      if (!rows.length) throw new Error('В файле нет записей');
      const r = applyRows(w, rows, `Файл ${f.name}`, true);
      st().toast(
        `Срез принят: записей ${r.received}, ячеек ${r.matched}${r.unmatched.length ? `, не найдено адресов ${r.unmatched.length}` : ''}`,
      );
      setPreview(rows.slice(0, 5));
    } catch (e) {
      st().toast(`Не удалось прочитать файл: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const testRest = async () => {
    setBusy(true);
    try {
      const rows = await fetchRows(c);
      setPreview(rows.slice(0, 5));
      const r = applyRows(w, rows, `REST ${c.url}`, true);
      st().toast(`Получено записей: ${r.received}, сопоставлено ячеек: ${r.matched}`);
    } catch (e) {
      st().toast(`Ошибка запроса: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section title="Источник данных">
        <Hint>
          Приложение не ведёт учёт: остатки, партии и движения приходят из учётной системы (1С:УПП/ERP, WMS). Здесь
          настраивается, откуда брать срез остатков по ячейкам.
        </Hint>
        <div className="type-grid">
          {TYPES.map((t) => (
            <button
              key={t.value}
              className={`type-card ${c.type === t.value ? 'active' : ''}`}
              onClick={() => up({ type: t.value, active: t.value === 'demo' })}
            >
              <b>{t.title}</b>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
        {c.type === 'demo' && (
          <>
            <div className="grid2">
              <Num
                label="Период обновления"
                unit="с"
                value={c.demoInterval}
                min={1}
                max={120}
                onChange={(v) => up({ demoInterval: v })}
              />
              <div className="field">
                <span className="field-label">&nbsp;</span>
                <Check label="Поток включён" checked={c.active} onChange={(v) => up({ active: v })} />
              </div>
            </div>
            <div className="row wrap">
              <button
                className="btn small"
                onClick={() =>
                  st().ask(
                    'Пересоздать демо-срез остатков? Текущие остатки склада будут заменены.',
                    () => st().resetDemoData(w.id),
                    'Пересоздать',
                    false,
                  )
                }
              >
                <Icon name="refresh" size={15} /> Пересоздать демо-срез
              </button>
              <button
                className="btn small danger"
                onClick={() => st().ask('Очистить остатки склада?', () => st().clearInventory(w.id), 'Очистить')}
              >
                Очистить остатки
              </button>
            </div>
          </>
        )}
        {(c.type === 'rest' || c.type === 'ws') && (
          <>
            <Text
              label={c.type === 'rest' ? 'Адрес API (GET)' : 'Адрес WebSocket'}
              value={c.url}
              mono
              placeholder={
                c.type === 'rest'
                  ? serverMode
                    ? 'erp/items'
                    : 'https://erp.zavod.local/api/stock'
                  : 'wss://wms.zavod.local/stock'
              }
              onChange={(v) => up({ url: v })}
            />
            {c.type === 'rest' && serverMode && (
              <Hint>
                Через сервер компании: адрес <code>erp/…</code> — запрос уйдёт на учётную систему из настроек сервера
                (ERP_URL) без ошибок CORS, логин и пароль хранятся на сервере.
              </Hint>
            )}
            <div className="grid2">
              <Text
                label="Путь к массиву в ответе"
                value={c.path}
                mono
                placeholder="data.items"
                onChange={(v) => up({ path: v })}
              />
              {c.type === 'rest' && (
                <Num label="Период опроса" unit="с" value={c.interval} min={5} onChange={(v) => up({ interval: v })} />
              )}
            </div>
            <Text
              label='Заголовки (JSON), например {"Authorization": "Bearer …"}'
              value={c.headers}
              mono
              onChange={(v) => up({ headers: v })}
            />
            <div className="row wrap">
              <Check label="Подключение активно" checked={c.active} onChange={(v) => up({ active: v })} />
              {c.type === 'rest' && (
                <button className="btn small primary" disabled={!c.url || busy} onClick={testRest}>
                  {busy ? 'Запрос…' : 'Получить срез сейчас'}
                </button>
              )}
            </div>
            {c.type === 'ws' && (
              <Hint>
                Сообщение с полным срезом: <code>{'{"full": true, "items": [...]}'}</code>; иначе — записи только по
                изменившимся ячейкам.
              </Hint>
            )}
          </>
        )}
        {c.type === 'file' && (
          <>
            <div className="dropzone" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={22} />
              <div>Загрузить срез остатков: CSV (разделитель «;») или JSON</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt,text/csv,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) runFile(f);
                e.target.value = '';
              }}
            />
          </>
        )}
        {sync && (
          <div className={`sync ${sync.error ? 'error' : ''}`}>
            <b>{sync.error ? 'Ошибка' : 'Последний обмен'}</b> · {sync.source} · {timeAgo(sync.at)}
            {sync.error ? (
              <div>{sync.error}</div>
            ) : (
              <div>
                Записей: {sync.received} · ячеек сопоставлено: {sync.matched}
              </div>
            )}
            {sync.unmatched.length > 0 && (
              <div className="muted small">Адреса не найдены: {sync.unmatched.slice(0, 12).join(', ')}</div>
            )}
          </div>
        )}
        {inv?.updatedAt ? <p className="hint">Срез остатков обновлён {timeAgo(inv.updatedAt)}.</p> : null}
      </Section>

      {c.type !== 'demo' && c.type !== 'none' && (
        <Section title="Сопоставление полей">
          <Hint>Укажите, как называются поля в выгрузке учётной системы. Вложенные поля — через точку: stock.qty.</Hint>
          <div className="mapping">
            {SNAPSHOT_FIELDS.map((f) => (
              <Text
                key={f.key}
                label={`${f.title}${f.hint ? ` — ${f.hint}` : ''}`}
                value={c.mapping[f.key] ?? ''}
                mono
                onChange={(v) => setMap(f.key, v)}
              />
            ))}
          </div>
          {preview && (
            <>
              <h4>Пример полученных записей</h4>
              <pre className="code-block">{JSON.stringify(preview, null, 1)}</pre>
            </>
          )}
        </Section>
      )}

      <Section title="Обмен со структурой склада">
        <Hint>
          Шаблон среза — текущие остатки в формате обмена (CSV). Структура мест — адреса ячеек с типами, размерами
          Ш×Г×В, местами и нагрузками для настройки адресного хранения в учётной системе.
        </Hint>
        <div className="row wrap">
          <button
            className="btn small"
            onClick={() => {
              const { header, rows } = snapshotRows(inv, products, tare);
              download(
                `срез_${w.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`,
                toCSV(header, rows),
                'text/csv;charset=utf-8',
              );
            }}
          >
            <Icon name="download" size={15} /> Шаблон / срез CSV
          </button>
          <button
            className="btn small"
            onClick={() =>
              download(
                `структура_${w.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`,
                JSON.stringify(structurePayload(w, cellsOf(w).cells), null, 1),
                'application/json',
              )
            }
          >
            <Icon name="download" size={15} /> Структура мест JSON
          </button>
        </div>
        <Text
          label="Выгрузить структуру в учётную систему (POST)"
          value={c.pushUrl}
          mono
          placeholder="https://erp.zavod.local/api/locations"
          onChange={(v) => up({ pushUrl: v })}
        />
        <button
          className="btn small"
          disabled={!c.pushUrl}
          onClick={async () => {
            try {
              const n = await pushStructure(w);
              st().toast(`Отправлено ячеек: ${n}`);
            } catch (e) {
              st().toast(`Ошибка выгрузки: ${e instanceof Error ? e.message : e}`, 'error');
            }
          }}
        >
          Отправить структуру
        </button>
      </Section>
    </>
  );
}
