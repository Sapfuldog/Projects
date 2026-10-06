import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { del, get, set } from 'idb-keyval';
import type {
  CellOverride,
  CellType,
  ColorMode,
  Connection,
  Consumer,
  Equipment,
  EquipmentType,
  Floor,
  Inventory,
  MaterialGroup,
  Mezzanine,
  PlaceKind,
  Product,
  Pt,
  Rack,
  Room,
  RoomKind,
  Section,
  Selection,
  Step,
  SyncStatus,
  TareType,
  VirtualPlace,
  Warehouse,
  WarehouseKind,
  Zone,
  ZoneType,
} from './types';
import {
  demoIT,
  demoShipyard,
  emptyWarehouse,
  newFloor,
  newMezzanine,
  newPlace,
  newRoom,
  newZone,
  uid,
} from './lib/demo';
import { pointInPolygon, polygonCentroid } from './lib/geometry';
import { newEquipment } from './lib/equipment';
import { cellUsage, emptyInventory } from './lib/inventory';
import { cellsOf, productsMap, tareMap } from './lib/monitor';
import { cellViewpoint } from './lib/rack';
import { DEFAULT_TARE } from './lib/materials';
import { DEMO_CONSUMERS, DEMO_PRODUCTS } from './lib/catalog';
import { demoSnapshot, demoTick } from './lib/demoData';
import { historyPoint, locationStats, pushHistory } from './lib/analytics';
import type { ImportResult } from './lib/snapshot';

export type ViewMode = '3d' | 'plan' | 'split';
/** Стены в 3D: срез (видно внутренности), полная высота, скрыть. */
export type WallMode = 'cut' | 'full' | 'none';
/** Уровень дашборда: склады, помещения, ячейки. */
export type DashLevel = 'warehouses' | 'rooms' | 'cells';
export type CamPreset = 'iso' | 'top' | 'front' | 'fit';

export interface DrawState {
  target: 'room' | 'zone';
  /** Перерисовать контур существующего помещения/зоны */
  replaceId?: string;
  points: Pt[];
}

export interface Show {
  zones: boolean;
  racks: boolean;
  cargo: boolean;
  equipment: boolean;
  people: boolean;
  labels: boolean;
  callouts: boolean;
  /** Отметки высот, линейка, ограничение высоты зоны */
  heights: boolean;
}

export const DEFAULT_SHOW: Show = {
  zones: true,
  racks: true,
  cargo: true,
  equipment: true,
  people: true,
  labels: true,
  callouts: true,
  heights: true,
};

export type FillFilter = 'all' | 'empty' | 'partial' | 'full' | 'problems';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'info' | 'error';
}

export interface User {
  name: string;
  role: string;
}

export interface Focus {
  x: number;
  y: number;
  z: number;
  /** Желаемое положение камеры (если не задано — сохраняется текущее направление) */
  cam?: { x: number; y: number; z: number };
  /** Счётчик, чтобы повторный фокус на ту же точку срабатывал */
  n: number;
  /** Когда запрошен (устаревшие запросы при повторном открытии 3D не выполняются) */
  at: number;
}

interface State {
  warehouses: Warehouse[];
  currentId: string | null;
  /** Каталог ТМЦ (из учётной системы) */
  products: Product[];
  tareTypes: TareType[];
  consumers: Consumer[];
  /** Срезы остатков по складам */
  inventory: Record<string, Inventory>;
  sync: Record<string, SyncStatus>;

  section: Section;
  step: Step;
  view: ViewMode;
  theme: 'light' | 'dark';
  selection: Selection;
  colorMode: ColorMode;
  show: Show;
  wallMode: WallMode;
  /** Показывать только этаж (null — все) */
  floorFilter: string | null;
  /** Разнести этажи по высоте */
  explode: boolean;
  /** Срез по высоте, м (null — без среза) */
  clip: number | null;
  tierFilter: number | null;
  typeFilter: CellType | null;
  groupFilter: MaterialGroup | null;
  fillFilter: FillFilter;
  productFilter: string | null;
  zoneFilter: string | null;
  /** Подсвеченные ячейки (где лежит товар, нарушения) */
  highlight: string[];
  level: DashLevel;
  /** Помещение, выбранное на дашборде */
  dashRoomId: string | null;
  draw: DrawState | null;
  snap: number;
  focus: Focus | null;
  camera: { preset: CamPreset; n: number; at: number } | null;
  search: string;
  past: Warehouse[][];
  future: Warehouse[][];
  hydrated: boolean;
  placing: EquipmentType | null;
  toasts: Toast[];
  notifSeenAt: number;
  user: User;
  openProductId: string | null;
  /** Открытый диалог подтверждения */
  dialog: { text: string; action: string; danger: boolean; onYes: () => void } | null;
}

interface Actions {
  setStep: (s: Step) => void;
  setView: (v: ViewMode) => void;
  setTheme: (t: 'light' | 'dark') => void;
  select: (s: Selection) => void;
  setColorMode: (m: ColorMode) => void;
  toggleShow: (k: keyof Show) => void;
  setWallMode: (m: WallMode) => void;
  setFloorFilter: (id: string | null) => void;
  setExplode: (v: boolean) => void;
  setClip: (v: number | null) => void;
  setTierFilter: (t: number | null) => void;
  setTypeFilter: (t: CellType | null) => void;
  setGroupFilter: (g: MaterialGroup | null) => void;
  setFillFilter: (f: FillFilter) => void;
  setProductFilter: (id: string | null) => void;
  setZoneFilter: (id: string | null) => void;
  resetFilters: () => void;
  setHighlight: (addresses: string[]) => void;
  setLevel: (l: DashLevel) => void;
  setDashRoom: (id: string | null) => void;
  setSnap: (v: number) => void;
  setSearch: (v: string) => void;
  focusOn: (x: number, y: number, z: number, cam?: Focus['cam']) => void;
  cameraPreset: (p: CamPreset) => void;

  createWarehouse: (kind: 'empty' | 'virtual' | 'demo' | 'demo-it') => string;
  duplicateWarehouse: (id: string) => void;
  deleteWarehouse: (id: string) => void;
  setCurrent: (id: string) => void;
  updateWarehouse: (
    patch: Partial<Pick<Warehouse, 'name' | 'address' | 'description' | 'addressTemplate' | 'pad' | 'kind'>>,
  ) => void;
  importWarehouses: (list: Warehouse[], inventory?: Record<string, Inventory>) => void;

  addFloor: () => void;
  updateFloor: (id: string, patch: Partial<Floor>) => void;
  deleteFloor: (id: string) => void;

  addRoom: (points?: Pt[], kind?: RoomKind) => string;
  updateRoom: (id: string, patch: Partial<Room>, record?: boolean) => void;
  deleteRoom: (id: string) => void;

  addZone: (roomId: string, points: Pt[], type?: ZoneType) => string;
  updateZone: (id: string, patch: Partial<Zone>, record?: boolean) => void;
  deleteZone: (id: string) => void;

  addRacks: (racks: Rack[]) => void;
  updateRack: (id: string, patch: Partial<Rack>, record?: boolean) => void;
  deleteRack: (id: string) => void;
  deleteRacks: (ids: string[]) => void;
  setCellOverride: (rackId: string, key: string, ov: CellOverride | null) => void;

  addMezzanine: (zoneId: string) => string | undefined;
  updateMezzanine: (id: string, patch: Partial<Mezzanine>, record?: boolean) => void;
  deleteMezzanine: (id: string) => void;

  addPlace: (kind?: PlaceKind) => void;
  updatePlace: (id: string, patch: Partial<VirtualPlace>) => void;
  deletePlace: (id: string) => void;

  /** Сдвиг помещения/зоны/мезонина вместе с содержимым относительно исходного состояния склада. */
  moveShape: (target: 'room' | 'zone' | 'mezzanine', id: string, dx: number, dy: number, orig: Warehouse) => void;

  startPlacing: (t: EquipmentType | null) => void;
  placeEquipment: (x: number, y: number) => void;
  addEquipment: (e: Equipment) => void;
  updateEquipment: (id: string, patch: Partial<Equipment>, record?: boolean) => void;
  deleteEquipment: (id: string) => void;

  startDraw: (target: DrawState['target'], replaceId?: string) => void;
  addDrawPoint: (p: Pt) => void;
  undoDrawPoint: () => void;
  finishDraw: () => void;
  cancelDraw: () => void;

  checkpoint: () => void;
  undo: () => void;
  redo: () => void;

  updateConnection: (patch: Partial<Connection>) => void;
  setSync: (warehouseId: string, s: SyncStatus) => void;
  /** Принять срез из учётной системы: остатки, новые позиции каталога, точка истории */
  applySnapshot: (warehouseId: string, r: ImportResult, source: string) => void;
  /** Демо-поток: очередная порция движений */
  demoStep: (warehouseId: string) => void;
  /** Пересоздать демо-срез остатков */
  resetDemoData: (warehouseId: string) => void;
  clearInventory: (warehouseId: string) => void;

  updateProduct: (id: string, patch: Partial<Product>) => void;
  importProducts: (list: Product[]) => void;
  addConsumer: () => void;
  updateConsumer: (id: string, patch: Partial<Consumer>) => void;
  deleteConsumer: (id: string) => void;
  addTareType: () => void;
  updateTareType: (id: string, patch: Partial<TareType>) => void;
  deleteTareType: (id: string) => void;

  setSection: (s: Section, step?: Step) => void;
  setUser: (u: Partial<User>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  markNotificationsSeen: () => void;
  /** Подтверждение действия во внутреннем диалоге (системные confirm() во встроенных окнах не работают) */
  ask: (text: string, onYes: () => void, action?: string, danger?: boolean) => void;
  closeDialog: () => void;
  openProduct: (id: string | null) => void;
  /** Показать ячейку в 3D на обзоре (камера наводится на неё) */
  showCell: (address: string) => void;
  /** Открыть ячейку в разделе «Ячейки» */
  openCell: (address: string) => void;
  /** Показать на 3D несколько ячеек (где лежит товар, нарушения) */
  showCells: (addresses: string[]) => void;
}

export type Store = State & Actions;

// IndexedDB вместо localStorage: срезы остатков тысяч ячеек не влезают в 5 МБ.
// Запись откладывается, чтобы частые обновления не нагружали браузер.
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
      }, 1500),
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
/** Как часто демо-поток обновляет точку истории, мс */
const HISTORY_EVERY = 60000;
const lastHistory = new Map<string, number>();

const demoCtx = (s: Pick<State, 'products' | 'tareTypes' | 'consumers'>) => ({
  products: productsMap(s.products),
  tareTypes: tareMap(s.tareTypes),
  consumers: s.consumers,
});

/** Точка истории заполнения по текущему срезу. */
function historyFor(w: Warehouse, inv: Inventory, s: Pick<State, 'products' | 'tareTypes'>) {
  const idx = cellsOf(w);
  const pm = productsMap(s.products);
  const usage = cellUsage(inv, pm, idx.byAddress, tareMap(s.tareTypes));
  return historyPoint(Date.now(), locationStats(idx.cells, usage, pm, inv.fills).all);
}

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
        products: [],
        tareTypes: DEFAULT_TARE,
        consumers: DEMO_CONSUMERS,
        inventory: {},
        sync: {},
        section: 'home',
        step: 'rooms',
        view: '3d',
        theme: 'dark',
        selection: null,
        colorMode: 'real',
        show: { ...DEFAULT_SHOW },
        wallMode: 'cut',
        floorFilter: null,
        explode: true,
        clip: null,
        tierFilter: null,
        typeFilter: null,
        groupFilter: null,
        fillFilter: 'all',
        productFilter: null,
        zoneFilter: null,
        highlight: [],
        level: 'rooms',
        dashRoomId: null,
        draw: null,
        snap: 0.5,
        focus: null,
        camera: null,
        search: '',
        past: [],
        future: [],
        hydrated: false,
        placing: null,
        toasts: [],
        notifSeenAt: 0,
        user: { name: 'Начальник склада', role: 'Центральный склад ТМЦ' },
        openProductId: null,
        dialog: null,

        setStep: (step) =>
          setState((s) => {
            s.step = step;
            s.draw = null;
            s.placing = null;
          }),
        setView: (v) => setState((s) => void (s.view = v)),
        setTheme: (t) => setState((s) => void (s.theme = t)),
        select: (sel) => setState((s) => void (s.selection = sel)),
        setColorMode: (m) => setState((s) => void (s.colorMode = m)),
        toggleShow: (k) => setState((s) => void (s.show[k] = !s.show[k])),
        setWallMode: (m) => setState((s) => void (s.wallMode = m)),
        setFloorFilter: (id) => setState((s) => void (s.floorFilter = id)),
        setExplode: (v) => setState((s) => void (s.explode = v)),
        setClip: (v) => setState((s) => void (s.clip = v)),
        setTierFilter: (t) => setState((s) => void (s.tierFilter = t)),
        setTypeFilter: (t) => setState((s) => void (s.typeFilter = t)),
        setGroupFilter: (g) => setState((s) => void (s.groupFilter = g)),
        setFillFilter: (f) => setState((s) => void (s.fillFilter = f)),
        setProductFilter: (id) => setState((s) => void (s.productFilter = id)),
        setZoneFilter: (id) => setState((s) => void (s.zoneFilter = id)),
        resetFilters: () =>
          setState((s) => {
            s.zoneFilter = null;
            s.fillFilter = 'all';
            s.productFilter = null;
            s.tierFilter = null;
            s.typeFilter = null;
            s.groupFilter = null;
            s.search = '';
            s.highlight = [];
          }),
        setHighlight: (addresses) => setState((s) => void (s.highlight = addresses)),
        setLevel: (l) => setState((s) => void (s.level = l)),
        setDashRoom: (id) => setState((s) => void (s.dashRoomId = id)),
        setSnap: (v) => setState((s) => void (s.snap = v)),
        setSearch: (v) => setState((s) => void (s.search = v)),
        focusOn: (x, y, z, cam) =>
          setState((s) => void (s.focus = { x, y, z, cam, n: (s.focus?.n ?? 0) + 1, at: Date.now() })),
        cameraPreset: (preset) =>
          setState((s) => void (s.camera = { preset, n: (s.camera?.n ?? 0) + 1, at: Date.now() })),

        createWarehouse: (kind) => {
          const s0 = getState();
          const n = s0.warehouses.length + 1;
          const w =
            kind === 'demo'
              ? demoShipyard()
              : kind === 'demo-it'
                ? demoIT()
                : emptyWarehouse(
                    kind === 'virtual' ? `Виртуальный склад №${n}` : `Склад №${n}`,
                    kind === 'virtual' ? 'virtual' : 'physical',
                  );
          if ((kind === 'demo' || kind === 'demo-it') && s0.warehouses.some((x) => x.name === w.name))
            w.name = `${w.name} (${n})`;
          setState((s) => {
            if (kind === 'demo' || kind === 'demo-it') {
              for (const p of DEMO_PRODUCTS) if (!s.products.some((x) => x.id === p.id)) s.products.push(p);
              for (const c of DEMO_CONSUMERS) if (!s.consumers.some((x) => x.id === c.id)) s.consumers.push(c);
              for (const t of DEFAULT_TARE) if (!s.tareTypes.some((x) => x.id === t.id)) s.tareTypes.push(t);
            }
          });
          const inv =
            kind === 'demo' || kind === 'demo-it'
              ? demoSnapshot(w, demoCtx(getState()), Date.now(), 7 + n)
              : emptyInventory();
          setState((s) => {
            s.warehouses.push(w);
            s.inventory[w.id] = inv;
            s.currentId = w.id;
            s.selection = null;
            s.floorFilter = null;
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
          if (copy.connection.type === 'demo') copy.connection.type = 'none';
          setState((s) => {
            s.warehouses.push(copy);
            s.inventory[copy.id] = emptyInventory();
          });
        },
        deleteWarehouse: (id) =>
          setState((s) => {
            s.warehouses = s.warehouses.filter((w) => w.id !== id);
            delete s.sync[id];
            delete s.inventory[id];
            if (s.currentId === id) s.currentId = s.warehouses[0]?.id ?? null;
            s.selection = null;
            s.past = [];
            s.future = [];
          }),
        setCurrent: (id) =>
          setState((s) => {
            if (s.currentId === id) return;
            s.currentId = id;
            s.selection = null;
            s.draw = null;
            s.tierFilter = null;
            s.zoneFilter = null;
            s.floorFilter = null;
            s.dashRoomId = null;
            s.highlight = [];
            s.past = [];
            s.future = [];
          }),
        updateWarehouse: (patch) => mutate((w) => void Object.assign(w, patch)),
        importWarehouses: (list, inventory) =>
          setState((s) => {
            for (const w of list) {
              const existing = s.warehouses.findIndex((x) => x.id === w.id);
              if (existing >= 0) s.warehouses[existing] = w;
              else s.warehouses.push(w);
              if (inventory?.[w.id]) s.inventory[w.id] = inventory[w.id];
              else s.inventory[w.id] ??= emptyInventory();
            }
            if (list[0]) s.currentId = list[0].id;
            s.selection = null;
          }),

        addFloor: () =>
          mutate((w) => {
            const top = w.floors.reduce(
              (m, f) => (f.elevation + f.height > m.elevation + m.height ? f : m),
              w.floors[0],
            );
            w.floors.push(
              newFloor(w.floors.length, top ? Math.round((top.elevation + top.height) * 100) / 100 : 0, 4.5),
            );
          }),
        updateFloor: (id, patch) =>
          mutate((w) => {
            const f = w.floors.find((x) => x.id === id);
            if (!f) return;
            Object.assign(f, patch);
            for (const r of w.rooms) if (r.floorId === id) r.elevation = f.elevation;
          }),
        deleteFloor: (id) =>
          mutate((w) => {
            if (w.floors.length <= 1) return;
            w.floors = w.floors.filter((f) => f.id !== id);
            const first = w.floors[0];
            for (const r of w.rooms)
              if (r.floorId === id) {
                r.floorId = first.id;
                r.elevation = first.elevation;
              }
          }),

        addRoom: (points, kind = 'storage') => {
          const w = current();
          const room = newRoom(w?.rooms.length ?? 0, points, kind);
          const floor = w?.floors.find((f) => f.id === getState().floorFilter) ?? w?.floors[0];
          if (floor) {
            room.floorId = floor.id;
            room.elevation = floor.elevation;
          }
          if (points === undefined && w?.rooms.length) {
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
            if (!r) return;
            Object.assign(r, patch);
            if (patch.floorId) r.elevation = w.floors.find((f) => f.id === patch.floorId)?.elevation ?? r.elevation;
          }, record),
        deleteRoom: (id) =>
          mutate((w) => {
            const zoneIds = new Set(w.zones.filter((z) => z.roomId === id).map((z) => z.id));
            w.rooms = w.rooms.filter((r) => r.id !== id);
            w.zones = w.zones.filter((z) => z.roomId !== id);
            w.racks = w.racks.filter((r) => !zoneIds.has(r.zoneId));
            w.mezzanines = w.mezzanines.filter((m) => !zoneIds.has(m.zoneId));
          }),

        addZone: (roomId, points, type = 'rack') => {
          const w = current();
          const room = w?.rooms.find((r) => r.id === roomId);
          const z = newZone(roomId, w?.zones.length ?? 0, points, Math.max(1, (room?.height ?? 8) - 1.5), type);
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
            w.mezzanines = w.mezzanines.filter((m) => m.zoneId !== id);
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
        deleteRack: (id) => mutate((w) => void (w.racks = w.racks.filter((r) => r.id !== id))),
        deleteRacks: (ids) =>
          mutate((w) => {
            const set = new Set(ids);
            w.racks = w.racks.filter((r) => !set.has(r.id));
          }),
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

        addMezzanine: (zoneId) => {
          const w = current();
          const zone = w?.zones.find((z) => z.id === zoneId);
          if (!w || !zone) return undefined;
          const c = polygonCentroid(zone.points);
          const m = newMezzanine(zoneId, Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, w.mezzanines.length);
          mutate((w) => void w.mezzanines.push(m));
          setState((s) => void (s.selection = { kind: 'mezzanine', id: m.id }));
          return m.id;
        },
        updateMezzanine: (id, patch, record = true) =>
          mutate((w) => {
            const m = w.mezzanines.find((x) => x.id === id);
            if (!m) return;
            const dx = (patch.x ?? m.x) - m.x;
            const dy = (patch.y ?? m.y) - m.y;
            Object.assign(m, patch);
            // Стеллажи на мезонине едут вместе с ним
            if (dx || dy)
              for (const r of w.racks)
                if (r.mezzanineId === id) {
                  r.x = Math.round((r.x + dx) * 100) / 100;
                  r.y = Math.round((r.y + dy) * 100) / 100;
                }
          }, record),
        deleteMezzanine: (id) =>
          mutate((w) => {
            w.mezzanines = w.mezzanines.filter((m) => m.id !== id);
            for (const r of w.racks)
              if (r.mezzanineId === id) {
                delete r.mezzanineId;
                delete r.deck;
              }
          }),

        addPlace: (kind = 'storage') => mutate((w) => void w.places.push(newPlace(w.places.length, kind))),
        updatePlace: (id, patch) =>
          mutate((w) => {
            const p = w.places.find((x) => x.id === id);
            if (p) Object.assign(p, patch);
          }),
        deletePlace: (id) => mutate((w) => void (w.places = w.places.filter((p) => p.id !== id))),

        moveShape: (target, id, dx, dy, orig) =>
          mutate((w) => {
            const r2 = (v: number) => Math.round(v * 100) / 100;
            const mv = (pts: Pt[]) => pts.map((p) => ({ x: r2(p.x + dx), y: r2(p.y + dy) }));
            if (target === 'mezzanine') {
              const m = w.mezzanines.find((x) => x.id === id);
              const o = orig.mezzanines.find((x) => x.id === id);
              if (!m || !o) return;
              m.x = r2(o.x + dx);
              m.y = r2(o.y + dy);
              for (const r of w.racks) {
                const or = orig.racks.find((x) => x.id === r.id);
                if (or && r.mezzanineId === id) {
                  r.x = r2(or.x + dx);
                  r.y = r2(or.y + dy);
                }
              }
              return;
            }
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
            const origRoom = orig.rooms.find((x) => x.id === id);
            if (target === 'room' && origRoom) {
              for (const e of w.equipment) {
                const o = orig.equipment.find((x) => x.id === e.id);
                if (o && pointInPolygon(o, origRoom.points)) {
                  e.x = r2(o.x + dx);
                  e.y = r2(o.y + dy);
                }
              }
            }
            for (const r of w.racks) {
              const o = orig.racks.find((x) => x.id === r.id);
              if (o && zoneIds.has(r.zoneId)) {
                r.x = r2(o.x + dx);
                r.y = r2(o.y + dy);
              }
            }
            for (const m of w.mezzanines) {
              const o = orig.mezzanines.find((x) => x.id === m.id);
              if (o && zoneIds.has(m.zoneId)) {
                m.x = r2(o.x + dx);
                m.y = r2(o.y + dy);
              }
            }
          }, false),

        startPlacing: (t) =>
          setState((s) => {
            s.placing = t;
            s.draw = null;
          }),
        placeEquipment: (x, y) => {
          const t = getState().placing;
          const w = current();
          if (!t || !w) return;
          const n = w.equipment.filter((e) => e.type === t).length + 1;
          const e = newEquipment(t, x, y, 0, n);
          const floorId = getState().floorFilter;
          const rooms = w.rooms.filter(
            (r) => pointInPolygon({ x, y }, r.points) && (!floorId || r.floorId === floorId),
          );
          const room = rooms[0];
          if (floorId) e.floorId = floorId;
          // Высота стены/колонны — по высоте помещения под точкой
          if (room && (t === 'wall' || t === 'column')) e.height = room.height;
          mutate((w) => void w.equipment.push(e));
          setState((s) => {
            s.selection = { kind: 'equipment', id: e.id };
            s.placing = null;
          });
        },
        addEquipment: (e) => {
          mutate((w) => void w.equipment.push(e));
          setState((s) => void (s.selection = { kind: 'equipment', id: e.id }));
        },
        updateEquipment: (id, patch, record = true) =>
          mutate((w) => {
            const e = w.equipment.find((x) => x.id === id);
            if (e) Object.assign(e, patch);
          }, record),
        deleteEquipment: (id) => mutate((w) => void (w.equipment = w.equipment.filter((e) => e.id !== id))),

        startDraw: (target, replaceId) =>
          setState((s) => {
            s.draw = { target, replaceId, points: [] };
            s.placing = null;
            if (s.view === '3d') s.view = 'split';
          }),
        addDrawPoint: (p) => setState((s) => void s.draw?.points.push(p)),
        undoDrawPoint: () => setState((s) => void s.draw?.points.pop()),
        cancelDraw: () => setState((s) => void (s.draw = null)),
        finishDraw: () => {
          const { draw, floorFilter } = getState();
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
            const rooms = w.rooms.filter((r) => pointInPolygon(c, r.points));
            const room = rooms.find((r) => !floorFilter || r.floorId === floorFilter) ?? rooms[0] ?? w.rooms[0];
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

        updateConnection: (patch) => mutate((w) => void Object.assign(w.connection, patch), false),
        setSync: (warehouseId, st) => setState((s) => void (s.sync[warehouseId] = st)),
        applySnapshot: (warehouseId, r, source) => {
          const w = getState().warehouses.find((x) => x.id === warehouseId);
          if (!w) return;
          setState((s) => {
            for (const p of r.newProducts) if (!s.products.some((x) => x.sku === p.sku)) s.products.push(p);
          });
          const s1 = getState();
          const point = historyFor(w, r.inventory, s1);
          setState((s) => {
            s.inventory[warehouseId] = { ...r.inventory, history: pushHistory(r.inventory.history, point) };
            s.sync[warehouseId] = {
              at: Date.now(),
              source,
              received: r.received,
              matched: r.matched,
              unmatched: r.unmatched,
            };
          });
        },
        demoStep: (warehouseId) => {
          const s0 = getState();
          const w = s0.warehouses.find((x) => x.id === warehouseId);
          if (!w || !s0.inventory[warehouseId]) return;
          const idx = cellsOf(w);
          const ctx = demoCtx(s0);
          const now = Date.now();
          const needHistory = now - (lastHistory.get(warehouseId) ?? 0) > HISTORY_EVERY;
          setState((s) => {
            const inv = s.inventory[warehouseId];
            if (!inv) return;
            demoTick(inv, { w, cells: idx.cells, byAddress: idx.byAddress, ctx, now });
          });
          if (needHistory) {
            lastHistory.set(warehouseId, now);
            const inv = getState().inventory[warehouseId];
            const point = historyFor(w, inv, getState());
            setState((s) => {
              const cur = s.inventory[warehouseId];
              if (cur) cur.history = pushHistory(cur.history, point);
            });
          }
          setState((s) => {
            s.sync[warehouseId] = {
              at: now,
              source: 'Демо-поток учётной системы',
              received: idx.cells.length,
              matched: idx.cells.length,
              unmatched: [],
            };
          });
        },
        resetDemoData: (warehouseId) => {
          const s0 = getState();
          const w = s0.warehouses.find((x) => x.id === warehouseId);
          if (!w) return;
          setState((s) => {
            for (const p of DEMO_PRODUCTS) if (!s.products.some((x) => x.id === p.id)) s.products.push(p);
          });
          const inv = demoSnapshot(w, demoCtx(getState()), Date.now(), Math.floor(Math.random() * 1e6));
          setState((s) => void (s.inventory[warehouseId] = inv));
        },
        clearInventory: (warehouseId) =>
          setState((s) => {
            const prev = s.inventory[warehouseId];
            s.inventory[warehouseId] = { ...emptyInventory(), history: prev?.history ?? [], updatedAt: Date.now() };
          }),

        updateProduct: (id, patch) =>
          setState((s) => {
            const p = s.products.find((x) => x.id === id);
            if (p) Object.assign(p, patch);
          }),
        importProducts: (list) =>
          setState((s) => {
            for (const p of list) {
              const i = s.products.findIndex((x) => x.sku === p.sku);
              if (i >= 0) s.products[i] = { ...s.products[i], ...p, id: s.products[i].id };
              else s.products.push(p);
            }
          }),
        addConsumer: () =>
          setState((s) => {
            const n = s.consumers.length + 1;
            s.consumers.push({
              id: uid('c'),
              code: `К-${String(n).padStart(2, '0')}`,
              name: `Кладовая ${n}`,
              shop: '',
            });
          }),
        updateConsumer: (id, patch) =>
          setState((s) => {
            const c = s.consumers.find((x) => x.id === id);
            if (c) Object.assign(c, patch);
          }),
        deleteConsumer: (id) => setState((s) => void (s.consumers = s.consumers.filter((c) => c.id !== id))),
        addTareType: () =>
          setState((s) => {
            s.tareTypes.push({
              id: uid('t'),
              code: `Т${s.tareTypes.length + 1}`,
              name: 'Новый вид тары',
              kind: 'box',
              length: 600,
              width: 400,
              height: 400,
              weight: 1,
              returnable: false,
              price: 0,
            });
          }),
        updateTareType: (id, patch) =>
          setState((s) => {
            const t = s.tareTypes.find((x) => x.id === id);
            if (t) Object.assign(t, patch);
          }),
        deleteTareType: (id) => setState((s) => void (s.tareTypes = s.tareTypes.filter((t) => t.id !== id))),

        setSection: (section, step) =>
          setState((s) => {
            s.section = section;
            if (step) s.step = step;
            s.draw = null;
            s.placing = null;
            if (section !== 'cells') s.selection = s.selection?.kind === 'cell' ? s.selection : null;
          }),
        setUser: (u) => setState((s) => void Object.assign(s.user, u)),
        toast: (text, kind = 'ok') => {
          const id = Date.now() + Math.random();
          setState((s) => {
            s.toasts.push({ id, text, kind });
            if (s.toasts.length > 4) s.toasts.shift();
          });
          setTimeout(() => getState().dismissToast(id), 4500);
        },
        dismissToast: (id) => setState((s) => void (s.toasts = s.toasts.filter((t) => t.id !== id))),
        markNotificationsSeen: () => setState((s) => void (s.notifSeenAt = Date.now())),
        ask: (text, onYes, action = 'Удалить', danger = true) =>
          setState((s) => void (s.dialog = { text, onYes, action, danger })),
        closeDialog: () => setState((s) => void (s.dialog = null)),
        openProduct: (id) => setState((s) => void (s.openProductId = id)),
        showCell: (address) => {
          const w = current();
          if (!w) return;
          const c = cellsOf(w).byAddress.get(address);
          if (!c) return;
          setState((s) => {
            if (s.section !== 'home' && s.section !== 'warehouse') {
              s.section = 'home';
              s.level = 'rooms';
            }
            if (s.section === 'home' && s.level === 'warehouses') s.level = 'rooms';
            s.selection = { kind: 'cell', id: c.key, rackId: c.rackId };
            if (s.floorFilter && c.floorId && s.floorFilter !== c.floorId) s.floorFilter = c.floorId;
            if (!c.virtual)
              s.focus = {
                x: c.cx,
                y: c.cy,
                z: c.cz,
                cam: cellViewpoint(w, c),
                n: (s.focus?.n ?? 0) + 1,
                at: Date.now(),
              };
          });
        },
        openCell: (address) => {
          const w = current();
          if (!w) return;
          const c = cellsOf(w).byAddress.get(address);
          if (!c) return;
          setState((s) => {
            s.section = 'cells';
            s.selection = { kind: 'cell', id: c.key, rackId: c.rackId };
          });
        },
        showCells: (addresses) => {
          getState().setHighlight(addresses);
          if (addresses.length === 1) getState().showCell(addresses[0]);
          else
            setState((s) => {
              s.section = 'home';
              if (s.level === 'warehouses') s.level = 'rooms';
            });
        },
      };
    }),
    {
      name: 'warehouse-3d',
      version: 3,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<State>;
        if (version < 3) {
          // Модель данных v3 (этажи, мезонины, типы ячеек, тара, срезы учётной системы) несовместима
          // с прежней: стартуем с новыми демо-объектами, сохраняем только тему и пользователя.
          return { theme: p.theme ?? 'dark', user: p.user } as State;
        }
        return p as State;
      },
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        warehouses: s.warehouses,
        currentId: s.currentId,
        products: s.products,
        tareTypes: s.tareTypes,
        consumers: s.consumers,
        inventory: s.inventory,
        step: s.step,
        view: s.view,
        theme: s.theme,
        colorMode: s.colorMode,
        show: s.show,
        wallMode: s.wallMode,
        explode: s.explode,
        snap: s.snap,
        section: s.section,
        level: s.level,
        user: s.user,
        notifSeenAt: s.notifSeenAt,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return { ...current, ...p, show: { ...DEFAULT_SHOW, ...(p.show ?? {}) } };
      },
      onRehydrateStorage: () => () => finishHydration(),
    },
  ),
);

function finishHydration() {
  const s = useStore.getState();
  if (s.hydrated) return;
  if (!s.warehouses.length) {
    // Первый запуск: склад завода и виртуальный IT-склад
    const id = s.createWarehouse('demo');
    useStore.getState().createWarehouse('demo-it');
    useStore.getState().setCurrent(id);
  } else if (!s.warehouses.some((w) => w.id === s.currentId)) s.setCurrent(s.warehouses[0].id);
  useStore.setState({ hydrated: true, past: [], future: [] });
}

// Если хранилище браузера недоступно или зависло (встроенные окна, приватный режим) —
// запускаемся с демо-данными, не дожидаясь его.
if (typeof window !== 'undefined') setTimeout(finishHydration, 4000);

/** Текущий склад (или undefined). */
export const useWarehouse = () => useStore((s) => s.warehouses.find((w) => w.id === s.currentId));

export type { WarehouseKind };
