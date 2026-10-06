import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { del, get, set } from 'idb-keyval';
import type {
  CellFill,
  CellOverride,
  ColorMode,
  Connection,
  Pt,
  Rack,
  Room,
  Selection,
  Step,
  SyncStatus,
  Warehouse,
  Zone,
} from './types';
import { demoWarehouse, emptyWarehouse, newRoom, newZone, uid } from './lib/demo';
import { pointInPolygon, polygonCentroid } from './lib/geometry';

export type ViewMode = '3d' | 'plan' | 'split';

export interface DrawState {
  target: 'room' | 'zone';
  /** Перерисовать контур существующего помещения/зоны */
  replaceId?: string;
  points: Pt[];
}

interface Show {
  walls: boolean;
  zones: boolean;
  labels: boolean;
  cells: boolean;
}

export interface Focus {
  x: number;
  y: number;
  z: number;
  /** Желаемое положение камеры (если не задано — сохраняется текущее направление) */
  cam?: { x: number; y: number; z: number };
  /** Счётчик, чтобы повторный фокус на ту же точку срабатывал */
  n: number;
}

interface State {
  warehouses: Warehouse[];
  currentId: string | null;
  fills: Record<string, Record<string, CellFill>>;
  sync: Record<string, SyncStatus>;
  step: Step;
  view: ViewMode;
  theme: 'light' | 'dark';
  selection: Selection;
  colorMode: ColorMode;
  show: Show;
  tierFilter: number | null;
  draw: DrawState | null;
  snap: number;
  focus: Focus | null;
  search: string;
  past: Warehouse[][];
  future: Warehouse[][];
  hydrated: boolean;
}

interface Actions {
  setStep: (s: Step) => void;
  setView: (v: ViewMode) => void;
  setTheme: (t: 'light' | 'dark') => void;
  select: (s: Selection) => void;
  setColorMode: (m: ColorMode) => void;
  toggleShow: (k: keyof Show) => void;
  setTierFilter: (t: number | null) => void;
  setSnap: (v: number) => void;
  setSearch: (v: string) => void;
  focusOn: (x: number, y: number, z: number, cam?: Focus['cam']) => void;

  createWarehouse: (kind: 'empty' | 'demo') => string;
  duplicateWarehouse: (id: string) => void;
  deleteWarehouse: (id: string) => void;
  setCurrent: (id: string) => void;
  updateWarehouse: (
    patch: Partial<Pick<Warehouse, 'name' | 'address' | 'description' | 'addressTemplate' | 'pad'>>,
  ) => void;
  importWarehouses: (list: Warehouse[], fills?: Record<string, Record<string, CellFill>>) => void;

  addRoom: (points?: Pt[]) => string;
  updateRoom: (id: string, patch: Partial<Room>, record?: boolean) => void;
  deleteRoom: (id: string) => void;

  addZone: (roomId: string, points: Pt[]) => string;
  updateZone: (id: string, patch: Partial<Zone>, record?: boolean) => void;
  deleteZone: (id: string) => void;

  addRacks: (racks: Rack[]) => void;
  updateRack: (id: string, patch: Partial<Rack>, record?: boolean) => void;
  deleteRack: (id: string) => void;
  deleteRacks: (ids: string[]) => void;
  /** Сдвиг помещения/зоны вместе со всем содержимым относительно исходного состояния склада. */
  moveShape: (target: 'room' | 'zone', id: string, dx: number, dy: number, orig: Warehouse) => void;
  setCellOverride: (rackId: string, key: string, ov: CellOverride | null) => void;

  updateConnection: (patch: Partial<Connection>) => void;
  setFills: (warehouseId: string, fills: Record<string, CellFill>, replace?: boolean) => void;
  clearFills: (warehouseId: string) => void;
  setSync: (warehouseId: string, s: SyncStatus) => void;

  startDraw: (target: DrawState['target'], replaceId?: string) => void;
  addDrawPoint: (p: Pt) => void;
  undoDrawPoint: () => void;
  finishDraw: () => void;
  cancelDraw: () => void;

  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
}

export type Store = State & Actions;

// IndexedDB вместо localStorage: заполнение тысяч ячеек не влезает в 5 МБ.
// Запись откладывается, чтобы частые обновления заполнения не нагружали браузер.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await get<string>(name)) ?? null;
    } catch {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    }
  },
  setItem: (name, value) => {
    clearTimeout(pending.get(name));
    pending.set(
      name,
      setTimeout(() => {
        set(name, value).catch(() => {
          try {
            localStorage.setItem(name, value);
          } catch {
            /* хранилище недоступно — работаем без сохранения */
          }
        });
      }, 600),
    );
  },
  removeItem: async (name) => {
    try {
      await del(name);
    } catch {
      /* ignore */
    }
  },
};

const HISTORY_LIMIT = 60;

export const useStore = create<Store>()(
  persist(
    immer((setState, getState) => {
      /** Изменить текущий склад с записью в историю для отмены. */
      const mutate = (fn: (w: Warehouse) => void, record = true) =>
        setState((s) => {
          const w = s.warehouses.find((x) => x.id === s.currentId);
          if (!w) return;
          if (record) {
            s.past.push(getState().warehouses);
            if (s.past.length > HISTORY_LIMIT) s.past.shift();
            s.future = [];
          }
          fn(w);
          w.updatedAt = Date.now();
        });

      const current = () => {
        const s = getState();
        return s.warehouses.find((w) => w.id === s.currentId);
      };

      return {
        warehouses: [],
        currentId: null,
        fills: {},
        sync: {},
        step: 'objects',
        view: 'split',
        theme: 'light',
        selection: null,
        colorMode: 'fill',
        show: { walls: true, zones: true, labels: true, cells: true },
        tierFilter: null,
        draw: null,
        snap: 0.5,
        focus: null,
        search: '',
        past: [],
        future: [],
        hydrated: false,

        setStep: (step) =>
          setState((s) => {
            s.step = step;
            s.draw = null;
          }),
        setView: (v) => setState((s) => void (s.view = v)),
        setTheme: (t) => setState((s) => void (s.theme = t)),
        select: (sel) => setState((s) => void (s.selection = sel)),
        setColorMode: (m) => setState((s) => void (s.colorMode = m)),
        toggleShow: (k) => setState((s) => void (s.show[k] = !s.show[k])),
        setTierFilter: (t) => setState((s) => void (s.tierFilter = t)),
        setSnap: (v) => setState((s) => void (s.snap = v)),
        setSearch: (v) => setState((s) => void (s.search = v)),
        focusOn: (x, y, z, cam) => setState((s) => void (s.focus = { x, y, z, cam, n: (s.focus?.n ?? 0) + 1 })),

        createWarehouse: (kind) => {
          const w = kind === 'demo' ? demoWarehouse() : emptyWarehouse(`Склад ${getState().warehouses.length + 1}`);
          setState((s) => {
            s.warehouses.push(w);
            s.currentId = w.id;
            s.selection = null;
            s.past = [];
            s.future = [];
          });
          return w.id;
        },
        duplicateWarehouse: (id) => {
          const src = getState().warehouses.find((w) => w.id === id);
          if (!src) return;
          const copy: Warehouse = JSON.parse(JSON.stringify(src));
          copy.id = uid('w');
          copy.name = `${src.name} (копия)`;
          copy.createdAt = copy.updatedAt = Date.now();
          copy.connection.active = false;
          setState((s) => {
            s.warehouses.push(copy);
          });
        },
        deleteWarehouse: (id) =>
          setState((s) => {
            s.warehouses = s.warehouses.filter((w) => w.id !== id);
            delete s.fills[id];
            delete s.sync[id];
            if (s.currentId === id) s.currentId = s.warehouses[0]?.id ?? null;
            s.selection = null;
            s.past = [];
            s.future = [];
          }),
        setCurrent: (id) =>
          setState((s) => {
            s.currentId = id;
            s.selection = null;
            s.draw = null;
            s.tierFilter = null;
            s.past = [];
            s.future = [];
          }),
        updateWarehouse: (patch) => mutate((w) => void Object.assign(w, patch)),
        importWarehouses: (list, fills) =>
          setState((s) => {
            for (const w of list) {
              const existing = s.warehouses.findIndex((x) => x.id === w.id);
              if (existing >= 0) s.warehouses[existing] = w;
              else s.warehouses.push(w);
              if (fills?.[w.id]) s.fills[w.id] = fills[w.id];
            }
            if (list[0]) s.currentId = list[0].id;
            s.selection = null;
          }),

        addRoom: (points) => {
          const w = current();
          const room = newRoom(w?.rooms.length ?? 0, points);
          if (points === undefined && w?.rooms.length) {
            // Ставим новое помещение правее существующих
            const maxX = Math.max(...w.rooms.flatMap((r) => r.points.map((p) => p.x)));
            room.points = room.points.map((p) => ({ x: p.x + maxX + 4, y: p.y }));
          }
          mutate((w) => void w.rooms.push(room));
          setState((s) => void (s.selection = { kind: 'room', id: room.id }));
          return room.id;
        },
        updateRoom: (id, patch, record = true) =>
          mutate((w) => {
            const r = w.rooms.find((x) => x.id === id);
            if (r) Object.assign(r, patch);
          }, record),
        deleteRoom: (id) =>
          mutate((w) => {
            const zoneIds = new Set(w.zones.filter((z) => z.roomId === id).map((z) => z.id));
            w.rooms = w.rooms.filter((r) => r.id !== id);
            w.zones = w.zones.filter((z) => z.roomId !== id);
            w.racks = w.racks.filter((r) => !zoneIds.has(r.zoneId));
          }),

        addZone: (roomId, points) => {
          const w = current();
          const z = newZone(
            roomId,
            w?.zones.length ?? 0,
            points,
            Math.max(1, (w?.rooms.find((r) => r.id === roomId)?.height ?? 8) - 1.5),
          );
          mutate((w) => void w.zones.push(z));
          setState((s) => void (s.selection = { kind: 'zone', id: z.id }));
          return z.id;
        },
        updateZone: (id, patch, record = true) =>
          mutate((w) => {
            const z = w.zones.find((x) => x.id === id);
            if (z) Object.assign(z, patch);
          }, record),
        deleteZone: (id) =>
          mutate((w) => {
            w.zones = w.zones.filter((z) => z.id !== id);
            w.racks = w.racks.filter((r) => r.zoneId !== id);
          }),

        addRacks: (racks) => {
          mutate((w) => void w.racks.push(...racks));
          if (racks.length) setState((s) => void (s.selection = { kind: 'rack', id: racks[racks.length - 1].id }));
        },
        updateRack: (id, patch, record = true) =>
          mutate((w) => {
            const r = w.racks.find((x) => x.id === id);
            if (r) Object.assign(r, patch);
          }, record),
        deleteRack: (id) =>
          mutate((w) => {
            w.racks = w.racks.filter((r) => r.id !== id);
          }),
        deleteRacks: (ids) =>
          mutate((w) => {
            const set = new Set(ids);
            w.racks = w.racks.filter((r) => !set.has(r.id));
          }),
        moveShape: (target, id, dx, dy, orig) =>
          mutate((w) => {
            const mv = (pts: Pt[]) =>
              pts.map((p) => ({ x: Math.round((p.x + dx) * 100) / 100, y: Math.round((p.y + dy) * 100) / 100 }));
            const zoneIds = new Set(
              target === 'room' ? orig.zones.filter((z) => z.roomId === id).map((z) => z.id) : [id],
            );
            if (target === 'room') {
              const r = w.rooms.find((x) => x.id === id);
              const o = orig.rooms.find((x) => x.id === id);
              if (r && o) r.points = mv(o.points);
            }
            for (const z of w.zones) {
              const o = orig.zones.find((x) => x.id === z.id);
              if (o && zoneIds.has(z.id)) z.points = mv(o.points);
            }
            for (const r of w.racks) {
              const o = orig.racks.find((x) => x.id === r.id);
              if (o && zoneIds.has(r.zoneId)) {
                r.x = Math.round((o.x + dx) * 100) / 100;
                r.y = Math.round((o.y + dy) * 100) / 100;
              }
            }
          }, false),
        setCellOverride: (rackId, key, ov) =>
          mutate((w) => {
            const r = w.racks.find((x) => x.id === rackId);
            if (!r) return;
            const clean =
              ov &&
              Object.fromEntries(Object.entries(ov).filter(([, v]) => v !== undefined && v !== '' && v !== false));
            if (!clean || !Object.keys(clean).length) delete r.overrides[key];
            else r.overrides[key] = clean as CellOverride;
          }),

        updateConnection: (patch) => mutate((w) => void Object.assign(w.connection, patch), false),
        setFills: (warehouseId, fills, replace = false) =>
          setState((s) => {
            s.fills[warehouseId] = replace ? fills : { ...(s.fills[warehouseId] ?? {}), ...fills };
          }),
        clearFills: (warehouseId) => setState((s) => void delete s.fills[warehouseId]),
        setSync: (warehouseId, st) => setState((s) => void (s.sync[warehouseId] = st)),

        startDraw: (target, replaceId) =>
          setState((s) => {
            s.draw = { target, replaceId, points: [] };
            if (s.view === '3d') s.view = 'split';
          }),
        addDrawPoint: (p) => setState((s) => void s.draw?.points.push(p)),
        undoDrawPoint: () => setState((s) => void s.draw?.points.pop()),
        cancelDraw: () => setState((s) => void (s.draw = null)),
        finishDraw: () => {
          const { draw } = getState();
          const w = current();
          if (!draw || !w || draw.points.length < 3) return;
          const pts = draw.points;
          setState((s) => void (s.draw = null));
          if (draw.replaceId) {
            if (draw.target === 'room') getState().updateRoom(draw.replaceId, { points: pts });
            else getState().updateZone(draw.replaceId, { points: pts });
            return;
          }
          if (draw.target === 'room') {
            getState().addRoom(pts);
          } else {
            const c = polygonCentroid(pts);
            const room = w.rooms.find((r) => pointInPolygon(c, r.points)) ?? w.rooms[0];
            if (room) getState().addZone(room.id, pts);
          }
        },

        checkpoint: () =>
          setState((s) => {
            s.past.push(getState().warehouses);
            if (s.past.length > HISTORY_LIMIT) s.past.shift();
            s.future = [];
          }),
        undo: () =>
          setState((s) => {
            const prev = s.past.pop();
            if (!prev) return;
            s.future.push(getState().warehouses);
            s.warehouses = prev;
          }),
        redo: () =>
          setState((s) => {
            const next = s.future.pop();
            if (!next) return;
            s.past.push(getState().warehouses);
            s.warehouses = next;
          }),
      };
    }),
    {
      name: 'warehouse-3d',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        warehouses: s.warehouses,
        currentId: s.currentId,
        fills: s.fills,
        step: s.step,
        view: s.view,
        theme: s.theme,
        colorMode: s.colorMode,
        show: s.show,
        snap: s.snap,
      }),
      onRehydrateStorage: () => () => {
        const s = useStore.getState();
        if (!s.warehouses.length) s.createWarehouse('demo');
        else if (!s.warehouses.some((w) => w.id === s.currentId)) s.setCurrent(s.warehouses[0].id);
        useStore.setState({ hydrated: true, past: [], future: [] });
      },
    },
  ),
);

/** Текущий склад (или undefined). */
export const useWarehouse = () => useStore((s) => s.warehouses.find((w) => w.id === s.currentId));
