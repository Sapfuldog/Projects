import type { Cell, CellType, Floor, Mezzanine, Rack, RackKind, Room, Tier, Warehouse, Zone } from '../types';
import { localToPlan, pointInPolygon, polygonInside, rectCorners } from './geometry';

export interface RackSpec {
  title: string;
  /** Стойка: ширина вдоль ряда и глубина, мм */
  upright: number;
  uprightDepth: number;
  /** Балка / полка / консоль: высота и глубина, мм (0 — сплошная полка) */
  beam: number;
  beamDepth: number;
  /** Тип ячеек по умолчанию */
  cell: CellType;
  /** Ячейки секции расположены поперёк (стороны консоли, ряды штабеля), а не вдоль */
  across: boolean;
  /** Отметка низа первого яруса, мм (основание консоли) */
  base: number;
}

/** Параметры каркаса по видам стеллажей. */
export const RACK_SPEC: Record<RackKind, RackSpec> = {
  pallet: {
    title: 'Паллетный',
    upright: 90,
    uprightDepth: 70,
    beam: 120,
    beamDepth: 50,
    cell: 'pallet',
    across: false,
    base: 0,
  },
  shelf: {
    title: 'Полочный',
    upright: 50,
    uprightDepth: 40,
    beam: 40,
    beamDepth: 0,
    cell: 'box',
    across: false,
    base: 0,
  },
  cantilever: {
    title: 'Консольный',
    upright: 200,
    uprightDepth: 300,
    beam: 100,
    beamDepth: 120,
    cell: 'cantilever',
    across: true,
    base: 250,
  },
  floor: {
    title: 'Напольное хранение',
    upright: 0,
    uprightDepth: 0,
    beam: 0,
    beamDepth: 0,
    cell: 'floor',
    across: true,
    base: 0,
  },
  cylinder: {
    title: 'Баллонная стойка',
    upright: 60,
    uprightDepth: 60,
    beam: 50,
    beamDepth: 40,
    cell: 'cylinder',
    across: false,
    base: 0,
  },
};

/** Толщина настила мезонина, м. */
export const DECK_T = 0.06;

export const cellKey = (s: number, t: number, p: number) => `${s}.${t}.${p}`;

/** Длина стеллажа вдоль ряда (Д), мм. */
export function rackLength(r: Rack): number {
  const { upright } = RACK_SPEC[r.kind];
  return r.sections * r.sectionLength + (r.sections + 1) * upright;
}

/** Глубина стеллажа по габариту (Г), мм: для консольного — с колонной и двумя сторонами. */
export function rackDepth(r: Rack): number {
  if (r.kind === 'cantilever') return (r.doubleSided ? 2 * r.depth : r.depth) + RACK_SPEC.cantilever.uprightDepth;
  return r.depth;
}

/** Отметки низа каждого яруса от основания стеллажа, мм. */
export function tierBases(r: Rack): number[] {
  const spec = RACK_SPEC[r.kind];
  const bases: number[] = [];
  let h = spec.base || (r.groundLevel || r.kind === 'floor' ? 0 : spec.beam);
  r.tiers.forEach((t, i) => {
    if (i > 0) h += spec.beam;
    bases.push(h);
    h += t.height;
  });
  return bases;
}

/** Полная высота стеллажа (В), мм. */
export function rackHeight(r: Rack): number {
  if (!r.tiers.length) return 0;
  const bases = tierBases(r);
  return bases[bases.length - 1] + r.tiers[r.tiers.length - 1].height;
}

export function rackCellCount(r: Rack): number {
  return r.sections * r.tiers.reduce((s, t) => s + t.cells, 0);
}

/** Формирует адрес ячейки по шаблону. */
export function formatAddress(
  template: string,
  pad: number,
  t: { room?: string; zone?: string; rack: string; section: number; tier: number; cell: number },
): string {
  const n = (v: number) => String(v).padStart(pad, '0');
  return template
    .replace(/\{room\}/g, t.room ?? '')
    .replace(/\{zone\}/g, t.zone ?? '')
    .replace(/\{rack\}/g, t.rack)
    .replace(/\{section\}/g, n(t.section))
    .replace(/\{tier\}/g, n(t.tier))
    .replace(/\{cell\}/g, n(t.cell));
}

/** Мест (паллет, коробов, баллонов) в ячейке по её размерам; 0 — учёт по объёму и нагрузке. */
export function defaultPlaces(type: CellType, w: number, d: number, h: number): number {
  switch (type) {
    case 'pallet':
      // поддон EUR 800 мм по фронту + зазор 75 мм
      return Math.max(1, Math.floor((w + 75) / 875));
    case 'box': {
      const a = Math.floor(w / 600) * Math.floor(d / 400);
      const b = Math.floor(w / 400) * Math.floor(d / 600);
      return Math.max(1, Math.max(a, b) * Math.max(1, Math.floor(h / 400)));
    }
    case 'floor':
      return Math.max(1, Math.floor((w + 50) / 850) * Math.max(1, Math.floor((d + 50) / 1250)));
    case 'cylinder':
      return Math.max(1, Math.floor(w / 260) * Math.max(1, Math.floor(d / 260)));
    default:
      return 0;
  }
}

export const floorOf = (w: Warehouse, id?: string): Floor | undefined => w.floors.find((f) => f.id === id);

/** Отметка пола помещения, м. */
export function roomElevation(w: Warehouse, room?: Room): number {
  if (!room) return 0;
  return floorOf(w, room.floorId)?.elevation ?? room.elevation;
}

export interface RackContext {
  zone?: Zone;
  room?: Room;
  floor?: Floor;
  mezz?: Mezzanine;
  /** Отметка основания стеллажа (пол или настил мезонина), м */
  base: number;
}

export function rackContext(w: Warehouse, r: Rack): RackContext {
  const zone = w.zones.find((z) => z.id === r.zoneId);
  const room = zone ? w.rooms.find((rm) => rm.id === zone.roomId) : undefined;
  const floor = floorOf(w, room?.floorId);
  const mezz = r.mezzanineId ? w.mezzanines.find((m) => m.id === r.mezzanineId) : undefined;
  const deck = mezz ? Math.min(r.deck ?? 1, mezz.levels) : 0;
  const base = roomElevation(w, room) + (mezz && deck > 0 ? deck * mezz.levelHeight + DECK_T : 0);
  return { zone, room, floor, mezz, base };
}

/** Тип ячеек яруса. */
export const tierCellType = (r: Rack, t: Tier): CellType => t.cellType ?? RACK_SPEC[r.kind].cell;

/** Строит ячейки стеллажа: размеры Ш×Г×В, тип, места, нагрузка и положение в 3D. */
export function rackCells(w: Warehouse, r: Rack, ctx = rackContext(w, r)): Cell[] {
  const spec = RACK_SPEC[r.kind];
  const L = rackLength(r);
  const D = rackDepth(r);
  const bases = tierBases(r);
  const hazard = !!(ctx.zone?.hazard || ctx.zone?.type === 'hazard' || ctx.room?.hazard);
  const cells: Cell[] = [];
  for (let s = 1; s <= r.sections; s++) {
    const sectionStart = -L / 2 + spec.upright + (s - 1) * (r.sectionLength + spec.upright);
    r.tiers.forEach((tier, ti) => {
      const t = ti + 1;
      const n = Math.max(1, tier.cells);
      for (let p = 1; p <= tier.cells; p++) {
        const key = cellKey(s, t, p);
        const ov = r.overrides[key];
        let lx: number;
        let lz: number;
        let cw: number;
        let cd: number;
        if (!spec.across) {
          cw = r.sectionLength / n;
          cd = r.depth;
          lx = sectionStart + (p - 0.5) * cw;
          lz = 0;
        } else if (r.kind === 'cantilever') {
          cw = r.sectionLength;
          cd = r.depth;
          lx = sectionStart + cw / 2;
          const col = spec.uprightDepth;
          // Сторона А — p=1 (к −Z), сторона Б — p=2
          lz = r.doubleSided ? (p === 1 ? -1 : 1) * (col / 2 + cd / 2) : -D / 2 + cd / 2;
        } else {
          cw = r.sectionLength;
          cd = r.depth / n;
          lx = sectionStart + cw / 2;
          lz = -D / 2 + (p - 0.5) * cd;
        }
        const type = ov?.cellType ?? tierCellType(r, tier);
        const bottom = ctx.base + bases[ti] / 1000;
        const pos = localToPlan(r.x, r.y, r.rotation, lx / 1000, lz / 1000);
        cells.push({
          key: `${r.id}:${key}`,
          address: formatAddress(w.addressTemplate, w.pad, {
            room: ctx.room?.code,
            zone: ctx.zone?.code,
            rack: r.code,
            section: s,
            tier: t,
            cell: p,
          }),
          rackId: r.id,
          zoneId: r.zoneId,
          roomId: ctx.room?.id ?? '',
          floorId: ctx.room?.floorId,
          section: s,
          tier: t,
          pos: p,
          width: Math.round(cw),
          depth: Math.round(cd),
          height: tier.height,
          maxLoad: ov?.maxLoad ?? tier.maxLoad,
          cellType: type,
          places: ov?.places ?? tier.places ?? defaultPlaces(type, cw, cd, tier.height),
          blocked: !!ov?.blocked,
          note: ov?.note,
          reservedFor: ov?.reservedFor,
          hazard,
          cx: pos.x,
          cy: bottom + tier.height / 2000,
          cz: pos.y,
          rotY: (-r.rotation * Math.PI) / 180,
          bottom,
        });
      }
    });
  }
  return cells;
}

/** Места учёта виртуального склада как «ячейки» без координат. */
export function virtualCells(w: Warehouse): Cell[] {
  return w.places.map((pl) => ({
    key: `v:${pl.id}`,
    address: pl.code,
    rackId: '',
    zoneId: '',
    roomId: '',
    section: 0,
    tier: 0,
    pos: 0,
    width: 0,
    depth: 0,
    height: 0,
    maxLoad: 0,
    cellType: 'virtual' as CellType,
    places: 0,
    blocked: false,
    note: pl.name,
    hazard: false,
    cx: 0,
    cy: 0,
    cz: 0,
    rotY: 0,
    bottom: 0,
    virtual: true,
  }));
}

export function buildCells(w: Warehouse): Cell[] {
  if (w.kind === 'virtual') return virtualCells(w);
  return w.racks.flatMap((r) => rackCells(w, r));
}

/** Каркас стеллажа в локальных координатах (м): центр бокса и его размеры. */
export interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface Frame {
  /** Стойки и колонны */
  posts: Box[];
  /** Балки, консоли, ограждения */
  beams: Box[];
  /** Полки и опорные плиты */
  panels: Box[];
  /** Разметка на полу */
  marks: Box[];
}

const MARK = 0.08;

function outline(marks: Box[], x: number, z: number, w: number, d: number) {
  marks.push({ x, y: 0.012, z: z - d / 2, sx: w, sy: 0.01, sz: MARK });
  marks.push({ x, y: 0.012, z: z + d / 2, sx: w, sy: 0.01, sz: MARK });
  marks.push({ x: x - w / 2, y: 0.012, z, sx: MARK, sy: 0.01, sz: d });
  marks.push({ x: x + w / 2, y: 0.012, z, sx: MARK, sy: 0.01, sz: d });
}

/** Каркас для 3D по видам стеллажей. */
export function rackFrame(r: Rack): Frame {
  const spec = RACK_SPEC[r.kind];
  const L = rackLength(r) / 1000;
  const D = rackDepth(r) / 1000;
  const H = rackHeight(r) / 1000;
  const U = spec.upright / 1000;
  const Ud = spec.uprightDepth / 1000;
  const B = spec.beam / 1000;
  const S = r.sectionLength / 1000;
  const f: Frame = { posts: [], beams: [], panels: [], marks: [] };
  const bases = tierBases(r).map((b) => b / 1000);

  if (r.kind === 'floor') {
    // Напольное хранение: разметка мест на полу
    const n = Math.max(1, r.tiers[0]?.cells ?? 1);
    const cd = D / n;
    for (let s = 0; s < r.sections; s++) {
      const x = -L / 2 + s * S + S / 2;
      for (let p = 0; p < n; p++) outline(f.marks, x, -D / 2 + (p + 0.5) * cd, S - 0.1, cd - 0.1);
    }
    return f;
  }

  if (r.kind === 'cantilever') {
    // Колонны через каждые ≤1,5 м, опоры-основания, консоли на каждом ярусе
    const cols = Math.max(2, Math.ceil(L / 1.5) + 1);
    const colZ = r.doubleSided ? 0 : D / 2 - Ud / 2;
    const arm = r.depth / 1000;
    for (let i = 0; i < cols; i++) {
      const x = -L / 2 + U / 2 + (i * (L - U)) / (cols - 1);
      f.posts.push({ x, y: H / 2 + 0.05, z: colZ, sx: U, sy: H + 0.1, sz: Ud });
      // основание
      f.panels.push({
        x,
        y: 0.06,
        z: r.doubleSided ? 0 : colZ - arm / 2,
        sx: U + 0.04,
        sy: 0.12,
        sz: r.doubleSided ? D : arm + Ud,
      });
      bases.forEach((base) => {
        const sides = r.doubleSided ? [-1, 1] : [-1];
        for (const sd of sides) {
          const z = r.doubleSided ? sd * (Ud / 2 + arm / 2) : colZ - Ud / 2 - arm / 2;
          f.beams.push({ x, y: base - B / 2, z, sx: spec.beamDepth / 1000, sy: B, sz: arm });
        }
      });
    }
    return f;
  }

  for (let i = 0; i <= r.sections; i++) {
    const x = -L / 2 + U / 2 + i * (S + U);
    for (const z of [-D / 2 + Ud / 2, D / 2 - Ud / 2]) f.posts.push({ x, y: H / 2, z, sx: U, sy: H, sz: Ud });
  }
  for (let s = 0; s < r.sections; s++) {
    const x = -L / 2 + U + s * (S + U) + S / 2;
    if (r.kind === 'cylinder') {
      // Баллонная стойка: основание, две цепи-ограждения спереди и сзади
      f.panels.push({ x, y: 0.03, z: 0, sx: S, sy: 0.06, sz: D });
      for (const y of [0.55, 1.05]) {
        f.beams.push({ x, y, z: -D / 2 + 0.02, sx: S, sy: 0.04, sz: 0.04 });
        f.beams.push({ x, y, z: D / 2 - 0.02, sx: S, sy: 0.04, sz: 0.04 });
      }
      continue;
    }
    bases.forEach((base, ti) => {
      if (ti === 0 && r.groundLevel) return;
      if (spec.beamDepth === 0) {
        // Полочный стеллаж — сплошная полка на всю глубину
        f.panels.push({ x, y: base - B / 2, z: 0, sx: S, sy: B, sz: D });
      } else {
        const bd = spec.beamDepth / 1000;
        for (const z of [-D / 2 + bd / 2, D / 2 - bd / 2])
          f.beams.push({ x, y: base - B / 2, z, sx: S, sy: B, sz: bd });
      }
    });
  }
  return f;
}

/** Контур стеллажа на плане (м). */
export function rackFootprint(r: Rack) {
  return rectCorners(r.x, r.y, rackLength(r) / 1000, rackDepth(r) / 1000, r.rotation);
}

/** Проверки стеллажа: высота зоны, помещения и мезонина, выход за границы зоны. */
export function rackWarnings(w: Warehouse, r: Rack): string[] {
  const ctx = rackContext(w, r);
  const { zone, room, mezz } = ctx;
  const out: string[] = [];
  const h = rackHeight(r) / 1000;
  if (!zone) {
    out.push('Стеллаж не привязан к зоне');
    return out;
  }
  const floorElev = roomElevation(w, room);
  const top = ctx.base - floorElev + h;
  if (top > zone.height + 1e-6) {
    out.push(`Верх стеллажа на ${top.toFixed(2)} м — выше высоты зоны размещения (${zone.height} м)`);
  }
  if (room && top > room.height + 1e-6) {
    out.push(`Верх стеллажа на ${top.toFixed(2)} м — выше высоты помещения (${room.height} м)`);
  }
  if (mezz && h > mezz.levelHeight - 0.15 && (r.deck ?? 1) < mezz.levels) {
    out.push(`Стеллаж ${h.toFixed(2)} м не помещается под следующий настил мезонина (${mezz.levelHeight} м)`);
  }
  if (!mezz && !polygonInside(rackFootprint(r), zone.points, 0.05)) {
    out.push('Стеллаж выходит за границы зоны');
  }
  const cellsLoad = r.sections * r.tiers.reduce((s, t) => s + t.cells * t.maxLoad, 0);
  if (r.maxLoad && cellsLoad > r.maxLoad * 1.0001) {
    out.push(
      `Сумма нагрузок ячеек ${(cellsLoad / 1000).toFixed(1)} т больше допустимой на стеллаж ${(r.maxLoad / 1000).toFixed(1)} т`,
    );
  }
  return out;
}

export const defaultTiers = (
  count: number,
  height: number,
  cells: number,
  maxLoad: number,
  cellType?: CellType,
): Tier[] => Array.from({ length: count }, () => ({ height, cells, maxLoad, ...(cellType ? { cellType } : {}) }));

export interface RackTemplate {
  id: string;
  title: string;
  art: string;
  rack: Pick<
    Rack,
    | 'kind'
    | 'sections'
    | 'sectionLength'
    | 'depth'
    | 'groundLevel'
    | 'tiers'
    | 'maxLoad'
    | 'sectionLoad'
    | 'doubleSided'
  >;
}

export const RACK_TEMPLATES: RackTemplate[] = [
  {
    id: 'pallet-3',
    title: 'Паллетный: секция 2700 мм, 3 паллетоместа, 4 яруса',
    art: 'rack-pallet',
    rack: {
      kind: 'pallet',
      sections: 6,
      sectionLength: 2700,
      depth: 1100,
      groundLevel: true,
      tiers: defaultTiers(4, 1500, 3, 1000),
      sectionLoad: 12000,
      maxLoad: 72000,
    },
  },
  {
    id: 'pallet-2',
    title: 'Паллетный: секция 1825 мм, 2 паллетоместа, 5 ярусов',
    art: 'rack-pallet2',
    rack: {
      kind: 'pallet',
      sections: 8,
      sectionLength: 1825,
      depth: 1100,
      groundLevel: true,
      tiers: defaultTiers(5, 1300, 2, 800),
      sectionLoad: 8000,
      maxLoad: 64000,
    },
  },
  {
    id: 'shelf-box',
    title: 'Полочный коробочный: секция 1200 мм, 5 полок',
    art: 'rack-shelf',
    rack: {
      kind: 'shelf',
      sections: 5,
      sectionLength: 1200,
      depth: 600,
      groundLevel: false,
      tiers: defaultTiers(5, 420, 1, 150, 'box'),
      sectionLoad: 750,
      maxLoad: 3750,
    },
  },
  {
    id: 'shelf-piece',
    title: 'Полочный для штучного хранения (инструмент): 1000 мм, 5 полок',
    art: 'rack-shelf',
    rack: {
      kind: 'shelf',
      sections: 5,
      sectionLength: 1000,
      depth: 500,
      groundLevel: false,
      tiers: defaultTiers(5, 380, 2, 60, 'shelf'),
      sectionLoad: 600,
      maxLoad: 3000,
    },
  },
  {
    id: 'cantilever',
    title: 'Консольный двусторонний: 6 м, 4 яруса консолей',
    art: 'rack-cantilever',
    rack: {
      kind: 'cantilever',
      sections: 1,
      sectionLength: 6000,
      depth: 1000,
      groundLevel: true,
      doubleSided: true,
      tiers: defaultTiers(4, 650, 2, 2000),
      maxLoad: 16000,
    },
  },
  {
    id: 'floor',
    title: 'Напольное хранение: 4 места × 2 ряда',
    art: 'rack-floor',
    rack: {
      kind: 'floor',
      sections: 4,
      sectionLength: 1300,
      depth: 2600,
      groundLevel: true,
      tiers: defaultTiers(1, 2000, 2, 3000),
    },
  },
  {
    id: 'cylinder',
    title: 'Баллонная стойка: 3 секции по 10 баллонов',
    art: 'rack-cylinder',
    rack: {
      kind: 'cylinder',
      sections: 3,
      sectionLength: 1300,
      depth: 560,
      groundLevel: true,
      tiers: defaultTiers(1, 1500, 1, 700, 'cylinder'),
    },
  },
];

/**
 * Точка, откуда удобно смотреть на ячейку: со стороны прохода (где больше свободного места
 * до соседнего стеллажа или стены), чуть выше ячейки.
 */
export function cellViewpoint(w: Warehouse, c: Cell): { x: number; y: number; z: number } {
  const rack = w.racks.find((r) => r.id === c.rackId);
  if (!rack) return { x: c.cx + 6, y: c.cy + 4, z: c.cz + 6 };
  const { room } = rackContext(w, rack);
  const a = (rack.rotation * Math.PI) / 180;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const others = w.racks.filter((r) => r.id !== rack.id && r.kind !== 'floor').map(rackFootprint);
  let best = { side: 1, clear: 0 };
  for (const side of [1, -1]) {
    let clear = 8;
    for (let d = rackDepth(rack) / 2000 + 0.1; d <= 8; d += 0.1) {
      const p = { x: c.cx + side * nx * d, y: c.cz + side * ny * d };
      if (others.some((fp) => pointInPolygon(p, fp)) || (room && !pointInPolygon(p, room.points))) {
        clear = d;
        break;
      }
    }
    if (clear > best.clear) best = { side, clear };
  }
  // Камера в проходе напротив ячейки, сбоку вдоль ряда и выше — чтобы был виден стеллаж целиком
  const d = Math.max(2.5, Math.min(best.clear - 0.3, 8));
  const ax = Math.cos(a);
  const ay = Math.sin(a);
  const along = 5;
  return {
    x: c.cx + best.side * nx * d + ax * along,
    y: c.cy + 3 + (8 - d) * 0.5,
    z: c.cz + best.side * ny * d + ay * along,
  };
}
