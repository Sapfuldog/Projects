import { useEffect, useRef } from 'react';
import type { Connection, Warehouse } from '../types';
import { useStore } from '../store';
import { cellsOf } from './monitor';
import { extractRows, importSnapshot, parseHeaders, parsePayload, structurePayload } from './snapshot';

// Обмен с учётной системой: опрос REST, WebSocket, демо-поток. Монтируется один раз в корне.

export async function fetchRows(conn: Connection): Promise<Record<string, unknown>[]> {
  if (!conn.url) throw new Error('Не указан адрес API');
  const res = await fetch(conn.url, { headers: parseHeaders(conn.headers) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return extractRows(parsePayload(await res.text()), conn.path);
}

/** Принять записи среза для склада. */
export function applyRows(w: Warehouse, rows: Record<string, unknown>[], source: string, replace: boolean) {
  const s = useStore.getState();
  const r = importSnapshot(rows, w.connection.mapping, cellsOf(w).cells, s.products, s.tareTypes, s.inventory[w.id], {
    replace,
  });
  s.applySnapshot(w.id, r, source);
  return r;
}

/** Выгрузить структуру мест хранения в учётную систему (POST). */
export async function pushStructure(w: Warehouse): Promise<number> {
  const conn = w.connection;
  if (!conn.pushUrl) throw new Error('Не указан адрес для выгрузки');
  const { cells } = cellsOf(w);
  const res = await fetch(conn.pushUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...parseHeaders(conn.headers) },
    body: JSON.stringify(structurePayload(w, cells)),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return cells.length;
}

const fail = (id: string, source: string, e: unknown) =>
  useStore.getState().setSync(id, {
    at: Date.now(),
    source,
    received: 0,
    matched: 0,
    unmatched: [],
    error: e instanceof Error ? e.message : String(e),
  });

/** Подключение одного склада. */
function useWarehouseConnector(w: Warehouse | undefined) {
  const wRef = useRef(w);
  wRef.current = w;
  const conn = w?.connection;
  const id = w?.id;
  const deps = [id, conn?.type, conn?.active, conn?.url, conn?.interval, conn?.headers, conn?.path, conn?.demoInterval];

  useEffect(() => {
    if (!id || !conn || !conn.active) return;
    const st = () => useStore.getState();

    if (conn.type === 'demo') {
      const t = setInterval(() => st().demoStep(id), Math.max(1, conn.demoInterval) * 1000);
      return () => clearInterval(t);
    }

    if (conn.type === 'rest') {
      let stopped = false;
      const poll = async () => {
        try {
          const rows = await fetchRows(conn);
          const cur = wRef.current;
          if (!stopped && cur && cur.id === id) applyRows(cur, rows, `REST ${conn.url}`, true);
        } catch (e) {
          if (!stopped) fail(id, `REST ${conn.url}`, e);
        }
      };
      poll();
      const t = setInterval(poll, Math.max(5, conn.interval) * 1000);
      return () => {
        stopped = true;
        clearInterval(t);
      };
    }

    if (conn.type === 'ws') {
      let ws: WebSocket | null = null;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let delay = 1000;
      let stopped = false;
      const open = () => {
        try {
          ws = new WebSocket(conn.url);
        } catch (e) {
          fail(id, `WebSocket ${conn.url}`, e);
          return;
        }
        ws.onopen = () => (delay = 1000);
        ws.onmessage = (ev) => {
          const cur = wRef.current;
          if (!cur || cur.id !== id) return;
          try {
            const payload = parsePayload(String(ev.data));
            // Полный срез — { full: true, items: [...] }, иначе — изменения по ячейкам
            const full = !!(payload && typeof payload === 'object' && (payload as { full?: boolean }).full);
            applyRows(cur, extractRows(payload, conn.path || (full ? 'items' : '')), `WebSocket ${conn.url}`, full);
          } catch (e) {
            fail(id, `WebSocket ${conn.url}`, e);
          }
        };
        ws.onclose = () => {
          if (stopped) return;
          fail(
            id,
            `WebSocket ${conn.url}`,
            new Error(`Соединение закрыто, повтор через ${Math.round(delay / 1000)} с`),
          );
          retry = setTimeout(open, delay);
          delay = Math.min(30000, delay * 2);
        };
      };
      open();
      return () => {
        stopped = true;
        clearTimeout(retry);
        ws?.close();
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Runner({ w }: { w: Warehouse }) {
  useWarehouseConnector(w);
  return null;
}

/** Подключения всех складов: демо-поток, опрос REST, WebSocket. */
export function ConnectorRunners() {
  const warehouses = useStore((s) => s.warehouses);
  return (
    <>
      {warehouses.map((w) => (
        <Runner key={w.id} w={w} />
      ))}
    </>
  );
}
