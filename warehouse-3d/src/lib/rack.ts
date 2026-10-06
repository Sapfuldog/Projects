import type { Cell, Rack, RackKind, Room, Tier, Warehouse, Zone } from '../types';
import { localToPlan, pointInPolygon, polygonInside, rectCorners } from './geometry';

/** Размеры элементов каркаса, мм. */
export const RACK_SPEC: Record<
  RackKind,
  { upright: number; uprightDepth: number; beam: number; beamDepth: number; title: string }
> = {
  pallet: { upright: 90, uprightDepth: 70, beam: 120, beamDepth: 50, title: 'Паллетный' },
  shelf: { upright: 50, uprightDepth: 40, beam: 40, beamDepth: 0, title: 'Полочный' },
};

export const cellKey = (s: number, t: number, p: number) => `${s}.${t}.${p}`;

/** Общая длина стеллажа вдоль ряда, мм. */
export function rackLength(r: Rack): number {
  const { upright } = RACK_SPEC[r.kind];
  return r.sections * r.sectionLength + (r.sections + 1) * upright;
}

/** Отметки низа каждого яруса (верх балки), мм от пола. */
export function tierBases(r: Rack): number[] {
  const { beam } = RACK_SPEC[r.kind];
  const bases: number[] = [];
  let h = r.groundLevel ? 0 : beam;
  r.tiers.forEach((t, i) => {
    if (i > 0) h += beam;
    bases.push(h);
    h += t.height;
  });
  return bases;
}

/** Полная высота стеллажа, мм. */
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

export interface RackContext {
  zone?: Zone;
  room?: Room;
}

export function rackContext(w: Warehouse, r: Rack): RackContext {
  const zone = w.zones.find((z) => z.id === r.zoneId);
  const room = zone ? w.rooms.find((rm) => rm.id === zone.roomId) : undefined;
  return { zone, room };
}

/** Строит список всех ячеек стеллажа с размерами (ДШВГ) и положением в 3D. */
export function rackCells(w: Warehouse, r: Rack, ctx = rackContext(w, r)): Cell[] {
  const { upright } = RACK_SPEC[r.kind];
  const L = rackLength(r);
  const bases = tierBases(r);
  const elev = ctx.room?.elevation ?? 0;
  const cells: Cell[] = [];
  for (let s = 1; s <= r.sections; s++) {
    const sectionStart = -L / 2 + upright + (s - 1) * (r.sectionLength + upright);
    r.tiers.forEach((tier, ti) => {
      const t = ti + 1;
      const cl = r.sectionLength / Math.max(1, tier.cells);
      for (let p = 1; p <= tier.cells; p++) {
        const key = cellKey(s, t, p);
        const ov = r.overrides[key];
        const lx = (sectionStart + (p - 0.5) * cl) / 1000;
        const ly = (bases[ti] + tier.height / 2) / 1000;
        const pos = localToPlan(r.x, r.y, r.rotation, lx, 0);
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
          section: s,
          tier: t,
          pos: p,
          length: Math.round(cl),
          width: r.depth,
          height: tier.height,
          maxLoad: ov?.maxLoad ?? tier.maxLoad,
          blocked: !!ov?.blocked,
          note: ov?.note,
          cx: pos.x,
          cy: elev + ly,
          cz: pos.y,
          rotY: (-r.rotation * Math.PI) / 180,
        });
      }
    });
  }
  return cells;
}

export function buildCells(w: Warehouse): Cell[] {
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

export function rackFrame(r: Rack): { uprights: Box[]; beams: Box[] } {
  const spec = RACK_SPEC[r.kind];
  const L = rackLength(r) / 1000;
  const D = r.depth / 1000;
  const H = rackHeight(r) / 1000;
  const U = spec.upright / 1000;
  const Ud = spec.uprightDepth / 1000;
  const B = spec.beam / 1000;
  const S = r.sectionLength / 1000;
  const uprights: Box[] = [];
  const beams: Box[] = [];
  for (let i = 0; i <= r.sections; i++) {
    const x = -L / 2 + U / 2 + i * (S + U);
    for (const z of [-D / 2 + Ud / 2, D / 2 - Ud / 2]) {
      uprights.push({ x, y: H / 2, z, sx: U, sy: H, sz: Ud });
    }
  }
  const bases = tierBases(r).map((b) => b / 1000);
  for (let s = 0; s < r.sections; s++) {
    const x = -L / 2 + U + s * (S + U) + S / 2;
    bases.forEach((base, ti) => {
      if (ti === 0 && r.groundLevel) return;
      if (spec.beamDepth === 0) {
        // Полочный стеллаж — сплошная полка на всю глубину
        beams.push({ x, y: base - B / 2, z: 0, sx: S, sy: B, sz: D });
      } else {
        const bd = spec.beamDepth / 1000;
        for (const z of [-D / 2 + bd / 2, D / 2 - bd / 2]) {
          beams.push({ x, y: base - B / 2, z, sx: S, sy: B, sz: bd });
        }
      }
    });
  }
  return { uprights, beams };
}

/** Контур стеллажа на плане (м). */
export function rackFootprint(r: Rack) {
  return rectCorners(r.x, r.y, rackLength(r) / 1000, r.depth / 1000, r.rotation);
}

/** Проверки стеллажа: высота зоны, высота помещения, выход за границы зоны. */
export function rackWarnings(w: Warehouse, r: Rack): string[] {
  const { zone, room } = rackContext(w, r);
  const out: string[] = [];
  const h = rackHeight(r) / 1000;
  if (!zone) {
    out.push('Стеллаж не привязан к зоне');
    return out;
  }
  if (h > zone.height + 1e-6) {
    out.push(`Высота ${h.toFixed(2)} м больше высоты зоны размещения (${zone.height} м)`);
  }
  if (room && h > room.height + 1e-6) {
    out.push(`Высота ${h.toFixed(2)} м больше высоты помещения (${room.height} м)`);
  }
  if (!polygonInside(rackFootprint(r), zone.points, 0.05)) {
    out.push('Стеллаж выходит за границы зоны');
  }
  return out;
}

export const defaultTiers = (count: number, height: number, cells: number, maxLoad: number): Tier[] =>
  Array.from({ length: count }, () => ({ height, cells, maxLoad }));

export interface RackTemplate {
  id: string;
  title: string;
  rack: Pick<Rack, 'kind' | 'sections' | 'sectionLength' | 'depth' | 'groundLevel' | 'tiers'>;
}

export const RACK_TEMPLATES: RackTemplate[] = [
  {
    id: 'pallet-3',
    title: 'Паллетный: секция 2700 мм, 3 паллеты, 4 яруса',
    rack: {
      kind: 'pallet',
      sections: 6,
      sectionLength: 2700,
      depth: 1100,
      groundLevel: true,
      tiers: defaultTiers(4, 1500, 3, 1000),
    },
  },
  {
    id: 'pallet-2',
    title: 'Паллетный: секция 1825 мм, 2 паллеты, 5 ярусов',
    rack: {
      kind: 'pallet',
      sections: 8,
      sectionLength: 1825,
      depth: 1100,
      groundLevel: true,
      tiers: defaultTiers(5, 1300, 2, 800),
    },
  },
  {
    id: 'shelf',
    title: 'Полочный: секция 1200 мм, 6 полок',
    rack: {
      kind: 'shelf',
      sections: 5,
      sectionLength: 1200,
      depth: 600,
      groundLevel: false,
      tiers: defaultTiers(6, 350, 3, 80),
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
  const others = w.racks.filter((r) => r.id !== rack.id).map(rackFootprint);
  let best = { side: 1, clear: 0 };
  for (const side of [1, -1]) {
    let clear = 8;
    for (let d = rack.depth / 2000 + 0.1; d <= 8; d += 0.1) {
      const p = { x: c.cx + side * nx * d, y: c.cz + side * ny * d };
      if (others.some((fp) => pointInPolygon(p, fp)) || (room && !pointInPolygon(p, room.points))) {
        clear = d;
        break;
      }
    }
    if (clear > best.clear) best = { side, clear };
  }
  // Камера в проходе напротив ячейки, немного сбоку вдоль ряда и выше — чтобы был виден контекст
  const d = Math.max(1.5, Math.min(best.clear - 0.3, 6));
  const ax = Math.cos(a);
  const ay = Math.sin(a);
  const along = 3.5;
  return {
    x: c.cx + best.side * nx * d + ax * along,
    y: c.cy + 2.2 + (6 - d) * 0.6,
    z: c.cz + best.side * ny * d + ay * along,
  };
}
