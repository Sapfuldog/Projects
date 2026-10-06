import { useEffect, useRef } from 'react';
import type { Cell, Connection, Warehouse } from '../types';
import { useStore, useWarehouse } from '../store';
import { cellsOf } from './derived';
import { extractRows, matchRecords, parseCSV, simulateFill } from './fill';
import { rackContext } from './rack';

export function parseHeaders(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  const v = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Заголовки должны быть JSON-объектом');
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
}

/** Разбирает текст ответа: JSON или CSV. */
export function parsePayload(text: string): unknown {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
  return parseCSV(text);
}

export async function fetchRows(conn: Connection): Promise<Record<string, unknown>[]> {
  if (!conn.url) throw new Error('Не указан адрес API');
  const res = await fetch(conn.url, { headers: parseHeaders(conn.headers) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return extractRows(parsePayload(await res.text()), conn.path);
}

/** Структура ячеек для выгрузки во внешнюю систему (WMS/1С). */
export function structurePayload(w: Warehouse, cells: Cell[]) {
  const rackById = new Map(w.racks.map((r) => [r.id, r]));
  return {
    warehouse: { id: w.id, name: w.name, address: w.address },
    generatedAt: new Date().toISOString(),
    cells: cells.map((c) => {
      const rack = rackById.get(c.rackId)!;
      const { zone, room } = rackContext(w, rack);
      return {
        address: c.address,
        room: room?.code,
        zone: zone?.code,
        rack: rack.code,
        section: c.section,
        tier: c.tier,
        cell: c.pos,
        length: c.length,
        width: c.width,
        height: c.height,
        maxLoad: c.maxLoad,
        blocked: c.blocked,
      };
    }),
  };
}

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

/** Применяет записи к текущему складу и обновляет статус синхронизации. */
export function applyRows(w: Warehouse, rows: Record<string, unknown>[], source: string, replace: boolean) {
  const { cells } = cellsOf(w);
  const res = matchRecords(rows, w.connection, cells);
  const st = useStore.getState();
  st.setFills(w.id, res.fills, replace);
  st.setSync(w.id, { at: Date.now(), source, received: res.received, matched: res.matched, unmatched: res.unmatched });
  return res;
}

/**
 * Запускает активное подключение текущего склада: демо-симулятор, опрос REST API или WebSocket.
 * Монтируется один раз в корне приложения.
 */
export function useConnectorRunner() {
  const w = useWarehouse();
  const wRef = useRef(w);
  wRef.current = w;
  const conn = w?.connection;
  const id = w?.id;
  const deps = [
    id,
    conn?.type,
    conn?.active,
    conn?.url,
    conn?.interval,
    conn?.headers,
    conn?.path,
    conn?.demoInterval,
    conn?.demoTarget,
  ];

  useEffect(() => {
    if (!id || !conn || !conn.active) return;
    const st = () => useStore.getState();
    const fail = (source: string, e: unknown) =>
      st().setSync(id, {
        at: Date.now(),
        source,
        received: 0,
        matched: 0,
        unmatched: [],
        error: e instanceof Error ? e.message : String(e),
      });

    if (conn.type === 'demo') {
      const tick = () => {
        const cur = wRef.current;
        if (!cur || cur.id !== id) return;
        const { cells } = cellsOf(cur);
        const prev = st().fills[id] ?? {};
        const next = simulateFill(cells, prev, cur.connection.demoTarget);
        st().setFills(id, next, true);
        st().setSync(id, {
          at: Date.now(),
          source: 'Демо-симулятор',
          received: cells.length,
          matched: cells.length,
          unmatched: [],
        });
      };
      tick();
      const t = setInterval(tick, Math.max(1, conn.demoInterval) * 1000);
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
          if (!stopped) fail(`REST ${conn.url}`, e);
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
          fail(`WebSocket ${conn.url}`, e);
          return;
        }
        ws.onopen = () => (delay = 1000);
        ws.onmessage = (ev) => {
          const cur = wRef.current;
          if (!cur || cur.id !== id) return;
          try {
            const rows = extractRows(parsePayload(String(ev.data)), conn.path);
            applyRows(cur, rows, `WebSocket ${conn.url}`, false);
          } catch (e) {
            fail(`WebSocket ${conn.url}`, e);
          }
        };
        ws.onclose = () => {
          if (stopped) return;
          fail(`WebSocket ${conn.url}`, new Error(`Соединение закрыто, повтор через ${Math.round(delay / 1000)} с`));
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
