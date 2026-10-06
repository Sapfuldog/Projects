import type { Pt } from '../types';

export const round = (v: number, step = 0.01) => Math.round(v / step) * step;
export const fmt = (v: number, digits = 2) =>
  Number.isFinite(v) ? Number(v.toFixed(digits)).toLocaleString('ru-RU') : '—';

/** Площадь многоугольника (м²), всегда положительная. */
export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonPerimeter(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Центр масс многоугольника (для подписей). */
export function polygonCentroid(pts: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = bbox(pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bbox(pts: Pt[]): BBox {
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Расстояние от точки до отрезка — для попадания по границе. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Многоугольник целиком внутри другого (проверка вершин). */
export function polygonInside(inner: Pt[], outer: Pt[], tolerance = 0.01): boolean {
  return inner.every(
    (p) =>
      pointInPolygon(p, outer) ||
      outer.some((_, i) => distToSegment(p, outer[i], outer[(i + 1) % outer.length]) <= tolerance),
  );
}

/** Есть ли у многоугольника самопересечения (простая O(n²) проверка). */
export function selfIntersects(pts: Pt[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(a1, a2, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Углы прямоугольника с центром (x,y), длиной вдоль оси и глубиной, повёрнутого на rot°. */
export function rectCorners(x: number, y: number, length: number, depth: number, rotDeg: number): Pt[] {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hl = length / 2;
  const hd = depth / 2;
  return [
    [-hl, -hd],
    [hl, -hd],
    [hl, hd],
    [-hl, hd],
  ].map(([lx, ly]) => ({ x: x + lx * c - ly * s, y: y + lx * s + ly * c }));
}

/** Перевод локальных координат стеллажа (вдоль, поперёк) в координаты плана. */
export function localToPlan(x: number, y: number, rotDeg: number, lx: number, ly: number): Pt {
  const r = (rotDeg * Math.PI) / 180;
  return { x: x + lx * Math.cos(r) - ly * Math.sin(r), y: y + lx * Math.sin(r) + ly * Math.cos(r) };
}

// ---------- Шаблоны форм помещений ----------

export type ShapeTemplate = 'rect' | 'L' | 'U' | 'T';

export function shapeTemplate(kind: ShapeTemplate, w: number, l: number, ox = 0, oy = 0): Pt[] {
  const p = (x: number, y: number) => ({ x: round(ox + x), y: round(oy + y) });
  switch (kind) {
    case 'L':
      return [p(0, 0), p(w, 0), p(w, l * 0.5), p(w * 0.5, l * 0.5), p(w * 0.5, l), p(0, l)];
    case 'U':
      return [
        p(0, 0),
        p(w, 0),
        p(w, l),
        p(w * 0.65, l),
        p(w * 0.65, l * 0.4),
        p(w * 0.35, l * 0.4),
        p(w * 0.35, l),
        p(0, l),
      ];
    case 'T':
      return [
        p(0, 0),
        p(w, 0),
        p(w, l * 0.4),
        p(w * 0.65, l * 0.4),
        p(w * 0.65, l),
        p(w * 0.35, l),
        p(w * 0.35, l * 0.4),
        p(0, l * 0.4),
      ];
    default:
      return [p(0, 0), p(w, 0), p(w, l), p(0, l)];
  }
}

/** Сдвинуть многоугольник внутрь bbox с отступом — для зоны по умолчанию. */
export function insetRect(pts: Pt[], inset: number): Pt[] {
  const b = bbox(pts);
  const minX = round(b.minX + inset);
  const minY = round(b.minY + inset);
  const maxX = round(Math.max(minX + 1, b.maxX - inset));
  const maxY = round(Math.max(minY + 1, b.maxY - inset));
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}
