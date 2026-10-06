import type { Rack, Warehouse, Zone } from '../types';
import { bbox } from './geometry';
import { uid } from './demo';
import { RACK_SPEC, RACK_TEMPLATES, rackDepth } from './rack';

/** Следующий код стеллажа: A → B … Z → AA; R01 → R02; иначе добавляем номер. */
export function nextCode(start: string, i: number): string {
  if (/^[A-Z]+$/.test(start)) {
    let n = 0;
    for (const ch of start) n = n * 26 + (ch.charCodeAt(0) - 64);
    n += i;
    let s = '';
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  const m = start.match(/^(.*?)(\d+)$/);
  if (m) return m[1] + String(Number(m[2]) + i).padStart(m[2].length, '0');
  return `${start}${i + 1}`;
}

export function suggestCode(w: Warehouse): string {
  const codes = new Set(w.racks.map((r) => r.code));
  for (let i = 0; i < 2000; i++) {
    const c = nextCode('A', i);
    if (!codes.has(c)) return c;
  }
  return `R${w.racks.length + 1}`;
}

export interface GenParams {
  template: string;
  orientation: 0 | 90;
  rows: number;
  auto: boolean;
  backToBack: boolean;
  aisle: number;
  backGap: number;
  margin: number;
  sections: number;
  autoSections: boolean;
  startCode: string;
}

/** Генерирует ряды стеллажей, равномерно раскладывая их в прямоугольнике зоны. */
export function generateRows(zone: Zone, p: GenParams): Rack[] {
  const tpl = RACK_TEMPLATES.find((t) => t.id === p.template) ?? RACK_TEMPLATES[0];
  const b = bbox(zone.points);
  const along = p.orientation === 0 ? b.maxX - b.minX : b.maxY - b.minY;
  const across = p.orientation === 0 ? b.maxY - b.minY : b.maxX - b.minX;
  const spec = RACK_SPEC[tpl.rack.kind];
  const S = tpl.rack.sectionLength / 1000;
  const U = spec.upright / 1000;
  const D = rackDepth({ ...tpl.rack, id: '', zoneId: '', code: '', x: 0, y: 0, rotation: 0, overrides: {} }) / 1000;
  const sections = p.autoSections ? Math.max(1, Math.floor((along - 2 * p.margin - U) / (S + U))) : p.sections;

  const offsets: number[] = [];
  let pos = p.margin + D / 2;
  let k = 0;
  while (pos + D / 2 <= across - p.margin + 1e-6 && (p.auto || offsets.length < p.rows)) {
    offsets.push(pos);
    const pairNext = p.backToBack && k % 2 === 0;
    pos += D + (pairNext ? p.backGap : p.aisle);
    k++;
    if (offsets.length > 500) break;
  }
  const midAlong = p.orientation === 0 ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
  return offsets.map((o, i) => ({
    id: uid('k'),
    zoneId: zone.id,
    code: nextCode(p.startCode || 'A', i),
    kind: tpl.rack.kind,
    x: Math.round((p.orientation === 0 ? midAlong : b.minX + o) * 100) / 100,
    y: Math.round((p.orientation === 0 ? b.minY + o : midAlong) * 100) / 100,
    rotation: p.orientation,
    sections,
    sectionLength: tpl.rack.sectionLength,
    depth: tpl.rack.depth,
    groundLevel: tpl.rack.groundLevel,
    tiers: tpl.rack.tiers.map((t) => ({ ...t })),
    overrides: {},
    maxLoad: tpl.rack.maxLoad ? Math.round((tpl.rack.maxLoad / tpl.rack.sections) * sections) : undefined,
    sectionLoad: tpl.rack.sectionLoad,
    doubleSided: tpl.rack.doubleSided,
  }));
}
