import type { Level } from './control';

// Цвета мониторинга: заполнение, нагрузка, давность движения, уровни нарушений.

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type RGB = [number, number, number];

function mix(c1: RGB, c2: RGB, t: number): string {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

const GREEN: RGB = [52, 178, 96];
const YELLOW: RGB = [244, 190, 40];
const RED: RGB = [226, 62, 62];

/** Зелёный (свободно) → жёлтый → красный (полная ячейка). */
export function fillColor(fill: number): string {
  const f = Math.max(0, Math.min(1, fill));
  return f < 0.5 ? mix(GREEN, YELLOW, f / 0.5) : mix(YELLOW, RED, (f - 0.5) / 0.5);
}

export const COLOR_EMPTY = '#cbd5e1';
export const COLOR_BLOCKED = '#475569';
export const COLOR_OVERLOAD = '#c026d3';
export const COLOR_RESERVED = '#38bdf8';

/** Нагрузка: вес / допустимая. Больше 1 — перегруз. */
export const loadColor = (ratio: number) => (ratio > 1.0001 ? COLOR_OVERLOAD : fillColor(ratio));

const FRESH: RGB = [34, 197, 94];
const MID: RGB = [250, 204, 21];
const OLD: RGB = [147, 51, 234];

/** Давность последнего движения: сегодня — зелёный, 30 дней — жёлтый, 90+ — фиолетовый. */
export function ageColor(days: number): string {
  if (days <= 30) return mix(FRESH, MID, Math.max(0, days) / 30);
  return mix(MID, OLD, Math.min(1, (days - 30) / 60));
}

export const LEVEL_COLOR: Record<Level | 'ok', string> = {
  critical: '#e5484d',
  warning: '#f59e0b',
  info: '#3b82f6',
  ok: '#4fb37a',
};

export function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 60%, 55%)`;
}

/** Светлее/темнее цвет (для граней мультяшных объектов). */
export function shade(hex: string, k: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
