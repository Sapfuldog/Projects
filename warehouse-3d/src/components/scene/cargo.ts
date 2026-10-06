import * as THREE from 'three';
import type { Cell, ColorMode, Product, TareType } from '../../types';
import type { CellUse } from '../../lib/inventory';
import type { Level } from '../../lib/control';
import { GROUPS } from '../../lib/materials';
import { LEVEL_COLOR, ageColor, fillColor, loadColor, shade } from '../../lib/colors';
import { DAY } from '../../lib/analytics';
import { Batch, baseMatrix } from './common';

// Груз в ячейках «по форме»: паллеты с коробами, вёдра ЛКМ, бочки, барабаны кабеля, пачки труб и листа,
// баллоны по цвету газа, ящики на полках, инструмент штучно, крупные узлы и секции на полу.

export interface CargoCtx {
  mode: ColorMode;
  products: Map<string, Product>;
  tareTypes: Map<string, TareType>;
  worst: Map<string, Level>;
  lastMove: Record<string, number>;
  now: number;
}

const WOOD = '#c79a5b';
const WOOD_DARK = '#a9773f';
const CARTON = '#d5aa6d';
const STEEL = '#8c96a3';
const CABLE = '#2f3640';

/** Цвет груза в режимах окраски (null — натуральный цвет). */
export function modeColor(c: Cell, u: CellUse | undefined, fill: number, ctx: CargoCtx): string | null {
  switch (ctx.mode) {
    case 'fill':
      return fillColor(fill);
    case 'load':
      return c.maxLoad > 0 && u ? loadColor(u.weight / c.maxLoad) : '#94a3b8';
    case 'group': {
      const pid = u ? Object.keys(u.byProduct)[0] : undefined;
      const g = pid ? ctx.products.get(pid)?.group : undefined;
      return g ? GROUPS[g].color : '#a8a29e';
    }
    case 'control':
      return LEVEL_COLOR[ctx.worst.get(c.address) ?? 'ok'];
    case 'age': {
      const t = ctx.lastMove[c.address];
      return t ? ageColor((ctx.now - t) / DAY) : '#94a3b8';
    }
    default:
      return null;
  }
}

/** Детерминированный «шум» для разнообразия: 0..1. */
function hash(s: string, i = 0): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const naturalOf = (p: Product | undefined) => (p ? (p.color ?? shade(GROUPS[p.group].color, 0.38)) : CARTON);
const pipeRadius = (p: Product) => {
  const m = p.attrs?.size?.match(/(\d+(?:[.,]\d+)?)/);
  const d = m ? Number(m[1].replace(',', '.')) : 60;
  return Math.max(0.035, Math.min(0.12, d / 2000));
};

interface Out {
  boxes: Batch;
  cyls: Batch;
}

/** Груз одной паллеты: короба, вёдра, бочки, листовые детали, оборудование. */
function palletLoad(
  o: Out,
  base: THREE.Matrix4,
  idx: number,
  p: Product | undefined,
  x: number,
  z: number,
  pw: number,
  pd: number,
  lh: number,
  color: string | null,
  seed: string,
) {
  o.boxes.add(WOOD, x, 0.07, z, pw, 0.14, pd, base, idx);
  const y0 = 0.14;
  const g = p?.group;
  if (g === 'paint') {
    const layers = Math.max(1, Math.min(4, Math.round(lh / 0.36)));
    const r = Math.min(pw / 3, pd / 2) * 0.44;
    for (let l = 0; l < layers; l++)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 2; j++)
          o.cyls.add(
            color ?? naturalOf(p),
            x - pw / 3 + (i * pw) / 3,
            y0 + 0.17 + l * 0.35,
            z - pd / 4 + (j * pd) / 2,
            r * 2,
            0.33,
            r * 2,
            base,
            idx,
          );
    return;
  }
  if (g === 'chem') {
    const r = Math.min(pw, pd) * 0.23;
    const h = Math.min(lh, 0.88);
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        o.cyls.add(
          color ?? p?.color ?? '#3466b8',
          x + (dx * pw) / 4,
          y0 + h / 2,
          z + (dz * pd) / 4,
          r * 2,
          h,
          r * 2,
          base,
          idx,
        );
    return;
  }
  if (g === 'cable') {
    const r = Math.min(lh, pd) / 2;
    o.cyls.add(color ?? CABLE, x, y0 + r, z, r * 1.9, pw * 0.8, r * 1.9, base, idx, 'x');
    for (const s of [-1, 1])
      o.cyls.add(WOOD_DARK, x + s * pw * 0.42, y0 + r, z, r * 2.1, 0.05, r * 2.1, base, idx, 'x');
    return;
  }
  if (g === 'semi' && (p?.perTare ?? 0) > 1) {
    // Детали корпуса после резки — пачка листовых деталей
    const n = Math.max(1, Math.min(6, Math.round(lh / 0.12)));
    for (let i = 0; i < n; i++) {
      const j = hash(seed, i) - 0.5;
      o.boxes.add(
        color ?? shade(STEEL, i === n - 1 ? 0.15 : -0.05 * (i % 2)),
        x + j * 0.06,
        y0 + 0.045 + i * 0.09,
        z - j * 0.05,
        pw * 0.9,
        0.08,
        pd * 0.88,
        base,
        idx,
      );
    }
    return;
  }
  if (g === 'equipment' || g === 'finished' || g === 'semi') {
    const c = color ?? naturalOf(p);
    o.boxes.add(c, x, y0 + (lh * 0.8) / 2, z, pw * 0.82, lh * 0.8, pd * 0.78, base, idx);
    o.boxes.add(color ?? shade(c, -0.3), x + pw * 0.15, y0 + lh * 0.8 + 0.08, z, pw * 0.35, 0.16, pd * 0.35, base, idx);
    return;
  }
  // Короба на паллете (стрейч): два яруса коробов
  const c = color ?? shade(CARTON, (hash(seed) - 0.5) * 0.12);
  o.boxes.add(c, x, y0 + (lh * 0.55) / 2, z, pw * 0.96, lh * 0.55, pd * 0.96, base, idx);
  o.boxes.add(
    color ?? shade(c, 0.06),
    x,
    y0 + lh * 0.55 + (lh * 0.45) / 2,
    z,
    pw * 0.9,
    lh * 0.45 - 0.02,
    pd * 0.92,
    base,
    idx,
  );
}

/** Пустая тара: стопки поддонов, барабаны, кассеты, бочки, ящики. */
function tareStack(
  o: Out,
  base: THREE.Matrix4,
  idx: number,
  t: TareType,
  n: number,
  x: number,
  z: number,
  sw: number,
  sd: number,
  maxH: number,
  color: string | null,
) {
  const c = (natural: string) => color ?? natural;
  if (t.kind === 'pallet') {
    const pw = Math.min(sw - 0.05, t.width / 1000);
    const pd = Math.min(sd - 0.05, t.length / 1000);
    const per = Math.max(1, Math.floor(maxH / 0.144));
    const stacks = Math.ceil(n / per);
    for (let s = 0; s < stacks; s++) {
      const cnt = Math.min(per, n - s * per);
      const sx = x + (stacks > 1 ? (s - (stacks - 1) / 2) * (sw / stacks) : 0);
      for (let i = 0; i < cnt; i++)
        o.boxes.add(
          c(i % 2 ? WOOD : WOOD_DARK),
          sx,
          0.07 + i * 0.144,
          z,
          Math.min(pw, sw / stacks - 0.05),
          0.13,
          pd,
          base,
          idx,
        );
    }
  } else if (t.kind === 'reel') {
    const r = Math.min(0.61, maxH / 2, sd / 2);
    for (let i = 0; i < Math.min(n, 4); i++) {
      const rx = x + (i - (Math.min(n, 4) - 1) / 2) * 0.8;
      for (const s of [-1, 1]) o.cyls.add(c(WOOD), rx + s * 0.3, r, z, r * 2, 0.06, r * 2, base, idx, 'x');
      o.cyls.add(c(WOOD_DARK), rx, r, z, r * 0.7, 0.6, r * 0.7, base, idx, 'x');
    }
  } else if (t.kind === 'cassette') {
    for (let i = 0; i < Math.min(n, 4); i++)
      o.boxes.add(c('#6b7a5a'), x, 0.26 + i * 0.52, z, Math.min(sw - 0.1, 6), 0.5, Math.min(sd - 0.1, 0.6), base, idx);
  } else if (t.kind === 'drum') {
    const k = Math.min(n, 4);
    for (let i = 0; i < k; i++)
      o.cyls.add(
        c('#3466b8'),
        x + ((i % 2) - 0.5) * 0.6,
        0.44,
        z + (Math.floor(i / 2) - 0.5) * 0.6,
        0.56,
        0.88,
        0.56,
        base,
        idx,
      );
  } else if (t.kind === 'cylinder') {
    // пустые баллоны вне баллонной стойки
    for (let i = 0; i < Math.min(n, 8); i++)
      o.cyls.add(
        c(shade(t.color ?? '#94a3b8', 0.45)),
        x + ((i % 4) - 1.5) * 0.25,
        0.7,
        z + (Math.floor(i / 4) - 0.5) * 0.25,
        0.22,
        1.39,
        0.22,
        base,
        idx,
      );
  } else {
    // ящики, короба, мешки — стопкой
    const h = t.height / 1000;
    const per = Math.max(1, Math.floor(maxH / h));
    for (let i = 0; i < Math.min(n, per); i++)
      o.boxes.add(
        c(t.kind === 'bin' ? '#3b82f6' : CARTON),
        x,
        h / 2 + i * h,
        z,
        Math.min(sw - 0.05, t.length / 1000),
        h - 0.02,
        Math.min(sd - 0.05, t.width / 1000),
        base,
        idx,
      );
  }
}

const sortedItems = (u: CellUse, products: Map<string, Product>) =>
  Object.entries(u.byProduct)
    .sort((a, b) => b[1] - a[1])
    .map(([pid, qty]) => ({ p: products.get(pid), qty }));

/**
 * Строит груз для набора ячеек. Владелец каждого экземпляра — индекс ячейки в `cells`
 * (по нему наведение и щелчок находят ячейку).
 */
export function buildCargo(
  cells: Cell[],
  usage: Map<string, CellUse>,
  fills: Map<string, number>,
  ctx: CargoCtx,
  lift: (floorId?: string) => number,
): Out {
  const o: Out = { boxes: new Batch(), cyls: new Batch() };
  const base = new THREE.Matrix4();
  cells.forEach((c, idx) => {
    const u = usage.get(c.address);
    if (!u || c.virtual) return;
    const hasGoods = u.qty > 0;
    const tareIds = Object.keys(u.tare);
    if (!hasGoods && !tareIds.length) return;
    const fill = fills.get(c.address) ?? 0;
    const color = modeColor(c, u, fill, ctx);
    const W = c.width / 1000;
    const D = c.depth / 1000;
    const H = c.height / 1000;
    baseMatrix(c.cx, c.bottom + lift(c.floorId) + 0.005, c.cz, c.rotY, base);
    const items = sortedItems(u, ctx.products);

    if (c.cellType === 'cylinder') {
      const cols = Math.max(1, Math.floor(W / 0.26));
      const rows = Math.max(1, Math.floor(D / 0.26));
      const slots: { color: string; full: boolean; big: boolean }[] = [];
      for (const it of items) {
        const t = it.p?.tareTypeId ? ctx.tareTypes.get(it.p.tareTypeId) : undefined;
        for (let i = 0; i < Math.round(it.qty); i++)
          slots.push({ color: it.p?.color ?? t?.color ?? STEEL, full: true, big: it.p?.tareTypeId === 't-c3h8' });
      }
      for (const tid of tareIds) {
        const t = ctx.tareTypes.get(tid);
        for (let i = 0; i < u.tare[tid]; i++)
          slots.push({ color: t?.color ?? STEEL, full: false, big: tid === 't-c3h8' });
      }
      slots.slice(0, cols * rows).forEach((s, k) => {
        const i = k % cols;
        const j = Math.floor(k / cols) % rows;
        const x = -W / 2 + (i + 0.5) * (W / cols);
        const z = -D / 2 + (j + 0.5) * (D / rows);
        const h = s.big ? 0.96 : 1.39;
        const d = s.big ? 0.28 : 0.21;
        const col = color ?? (s.full ? s.color : shade(s.color, 0.5));
        o.cyls.add(col, x, h / 2, z, d, h, d, base, idx);
        if (s.full) o.cyls.add('#3b3f45', x, h + 0.05, z, 0.08, 0.1, 0.08, base, idx);
      });
      return;
    }

    if (c.cellType === 'box') {
      const cols = Math.max(1, Math.floor(W / 0.6 + 0.05));
      const rows = Math.max(1, Math.floor(D / 0.4 + 0.05));
      const layers = Math.max(1, Math.floor(H / 0.4 + 0.05));
      const slots = cols * rows * layers;
      const n = Math.max(1, Math.min(slots, Math.round(fill * slots)));
      const bw = W / cols - 0.04;
      const bd = D / rows - 0.04;
      const bh = Math.min(0.36, H / layers - 0.04);
      // Короба распределяются между товарами пропорционально количеству
      const total = items.reduce((s, it) => s + it.qty, 0) || 1;
      let k = 0;
      items.forEach((it, ii) => {
        const share = ii === items.length - 1 ? n - k : Math.max(1, Math.round((n * it.qty) / total));
        for (let q = 0; q < share && k < n; q++, k++) {
          const l = Math.floor(k / (cols * rows));
          const r = Math.floor(k / cols) % rows;
          const cc = k % cols;
          o.boxes.add(
            color ?? naturalOf(it.p),
            -W / 2 + (cc + 0.5) * (W / cols),
            bh / 2 + l * (bh + 0.04),
            -D / 2 + (r + 0.5) * (D / rows),
            bw,
            bh,
            bd,
            base,
            idx,
          );
        }
      });
      return;
    }

    if (c.cellType === 'shelf') {
      // Штучное хранение: инструмент и комплектующие по одному
      const list: Product[] = [];
      for (const it of items)
        for (let i = 0; i < Math.min(6, Math.max(1, Math.round(it.qty))); i++) if (it.p) list.push(it.p);
      const n = Math.min(8, list.length);
      for (let i = 0; i < n; i++) {
        const p = list[i];
        const w = Math.min(0.3, (W / n) * 0.8);
        const h = Math.min(H * 0.6, 0.12 + (p.volume ?? 3) * 0.015);
        const jz = (hash(c.address, i) - 0.5) * D * 0.3;
        o.boxes.add(
          color ?? naturalOf(p),
          -W / 2 + (i + 0.5) * (W / n),
          h / 2,
          jz,
          w,
          h,
          Math.min(D * 0.6, 0.22),
          base,
          idx,
        );
      }
      return;
    }

    if (c.cellType === 'cantilever') {
      // Длинномер на консолях: трубы — цилиндры, профиль — бруски, пакетами
      const len = Math.min(W, 6.2) * 0.97;
      let y = 0;
      for (const it of items) {
        const p = it.p;
        if (!p) continue;
        const share = it.qty / (items.reduce((s, x) => s + x.qty, 0) || 1);
        const pipe = p.attrs?.profile === 'труба' || p.attrs?.profile === 'круг' || p.group === 'semi';
        const r = p.group === 'semi' ? 0.11 : p.attrs?.profile === 'круг' ? 0.035 : pipeRadius(p);
        const natural = p.group === 'semi' ? '#ece6d6' : /Х|AISI/i.test(p.attrs?.steel ?? '') ? '#c5ccd4' : STEEL;
        const size = pipe ? r * 2 : 0.12;
        const perRow = Math.max(1, Math.floor((D * 0.92) / (size + 0.01)));
        const count = Math.max(1, Math.min(perRow * 4, Math.round(fill * share * perRow * 3.2)));
        for (let k = 0; k < count; k++) {
          const row = Math.floor(k / perRow);
          const col = k % perRow;
          const z = -D / 2 + (col + 0.5) * ((D * 0.92) / perRow) + D * 0.04;
          const yy = y + size / 2 + row * (size + 0.005);
          if (yy + size / 2 > H) break;
          const cc = color ?? shade(natural, (hash(c.address, k) - 0.5) * 0.1);
          if (pipe) o.cyls.add(cc, 0, yy, z, size, len, size, base, idx, 'x');
          else o.boxes.add(cc, 0, yy, z, len, size * 0.8, size, base, idx);
        }
        y += (Math.ceil(count / perRow) || 1) * (size + 0.005);
      }
      return;
    }

    // Напольное хранение и паллетные ячейки: места по ширине (и глубине для больших ячеек)
    const cols =
      c.cellType === 'pallet'
        ? Math.max(1, c.places || 1, items.length + tareIds.length)
        : Math.max(1, Math.round(W / 1.3));
    const rows = c.cellType === 'pallet' ? 1 : Math.max(1, Math.round(D / 1.3));
    const slotW = W / cols;
    const slotD = D / rows;
    let slot = 0;
    const nextSlot = () => {
      const k = slot++ % (cols * rows);
      return { x: -W / 2 + ((k % cols) + 0.5) * slotW, z: -D / 2 + (Math.floor(k / cols) + 0.5) * slotD };
    };

    for (const it of items) {
      const p = it.p;
      if (!p) continue;
      if (p.storage === 'bulk' && p.group === 'metal') {
        // Штабель листа на прокладках
        const sheet = p.attrs?.size?.split('×').map(Number) ?? [10, 1500, 6000];
        const sl = Math.min(W * 0.94, (sheet[2] || 6000) / 1000);
        const sw = Math.min(D * 0.9, (sheet[1] || 1500) / 1000);
        const h = Math.max(0.05, Math.min(H * 0.9, (it.qty / (sl * sw * 7.85)) * 2));
        for (const dx of [-0.4, 0, 0.4]) o.boxes.add(WOOD_DARK, dx * sl, 0.05, 0, 0.1, 0.1, sw + 0.1, base, idx);
        o.boxes.add(color ?? shade(STEEL, -0.08), 0, 0.1 + h / 2, 0, sl, h, sw, base, idx);
        o.boxes.add(
          color ? shade(color, 0.1) : shade(STEEL, 0.12),
          0,
          0.1 + h + 0.01,
          0,
          sl * 0.99,
          0.02,
          sw * 0.98,
          base,
          idx,
        );
        continue;
      }
      if (p.id === 'p-sect' || (p.storage === 'bulk' && p.group === 'semi' && p.weight > 5000)) {
        // Секция корпуса: крупный блок с набором сверху
        const bw = W * 0.86;
        const bd = D * 0.86;
        const bh = Math.min(H * 0.85, 3.2);
        const c0 = color ?? naturalOf(p);
        for (const dx of [-0.3, 0.3]) o.boxes.add(WOOD_DARK, dx * bw, 0.15, 0, 0.3, 0.3, bd, base, idx);
        o.boxes.add(c0, 0, 0.3 + bh / 2, 0, bw, bh, bd, base, idx);
        for (const f of [-0.25, 0, 0.25])
          o.boxes.add(shade(c0, -0.25), f * bw, 0.3 + bh + 0.15, 0, 0.12, 0.3, bd * 0.96, base, idx);
        o.boxes.add(shade(c0, -0.25), 0, 0.3 + bh + 0.15, 0, bw * 0.96, 0.3, 0.12, base, idx);
        continue;
      }
      if (p.storage === 'bulk') {
        // Крупные изделия и узлы на полу: щиты, комингсы, трапы
        const n = Math.max(1, Math.min(cols * rows, Math.round(it.qty)));
        // Одно изделие занимает всё место, несколько — по местам сетки
        const whole = n === 1 && items.length === 1;
        const slotW = whole ? W : W / cols;
        const slotD = whole ? D : D / rows;
        for (let k = 0; k < n; k++) {
          const s = whole ? { x: 0, z: 0 } : nextSlot();
          const c0 = color ?? naturalOf(p);
          if (p.id === 'p-hatch') {
            const fw = Math.min(slotW * 0.8, 1.3);
            const fd = Math.min(slotD * 0.8, 0.9);
            for (const dz of [-1, 1]) o.boxes.add(c0, s.x, 0.3, s.z + (dz * fd) / 2, fw, 0.6, 0.06, base, idx);
            for (const dx of [-1, 1]) o.boxes.add(c0, s.x + (dx * fw) / 2, 0.3, s.z, 0.06, 0.6, fd, base, idx);
          } else if (p.id === 'p-ladder') {
            o.boxes.add(c0, s.x, 0.15, s.z, Math.min(slotW * 0.95, 5.5), 0.3, Math.min(slotD * 0.8, 0.9), base, idx);
          } else {
            const bw = Math.min(slotW * 0.8, 3.2);
            const bh = Math.min(H * 0.85, 2.2);
            const bd = Math.min(slotD * 0.6, 0.9);
            o.boxes.add('#475569', s.x, 0.05, s.z, bw, 0.1, bd, base, idx);
            o.boxes.add(c0, s.x, 0.1 + bh / 2, s.z, bw, bh, bd, base, idx);
            o.boxes.add(
              color ?? shade(c0, -0.2),
              s.x,
              0.1 + bh * 0.6,
              s.z - bd / 2 - 0.01,
              bw * 0.8,
              bh * 0.5,
              0.02,
              base,
              idx,
            );
          }
        }
        continue;
      }
      if (p.group === 'cable' && c.cellType === 'floor') {
        // Кабель на барабанах
        const t = p.tareTypeId ? ctx.tareTypes.get(p.tareTypeId) : undefined;
        const n = Math.max(1, Math.min(cols * rows, p.perTare ? Math.ceil(it.qty / p.perTare - 1e-9) : 1));
        const r = Math.min((t?.height ?? 1220) / 2000, H / 2, slotD / 2);
        const frac = p.perTare ? Math.min(1, it.qty / p.perTare) : 1;
        for (let k = 0; k < n; k++) {
          const s = nextSlot();
          const part = k === n - 1 && frac < 1 ? Math.max(0.55, frac) : 1;
          for (const sd of [-1, 1]) o.cyls.add(WOOD, s.x + sd * 0.33, r, s.z, r * 2, 0.06, r * 2, base, idx, 'x');
          o.cyls.add(color ?? p.color ?? CABLE, s.x, r, s.z, r * 1.8 * part, 0.6, r * 1.8 * part, base, idx, 'x');
        }
        continue;
      }
      // Паллеты: по местам ячейки
      const places = Math.max(1, Math.round(c.places || 1));
      const pallets = p.perTare ? Math.ceil(it.qty / p.perTare - 1e-9) : Math.max(1, Math.round(fill * places));
      const n = Math.max(1, Math.min(pallets, c.cellType === 'pallet' ? places : cols * rows));
      const frac = p.perTare ? it.qty / p.perTare - Math.floor(it.qty / p.perTare - 1e-9) : Math.min(1, fill);
      for (let k = 0; k < n; k++) {
        const s =
          c.cellType === 'pallet' && items.length === 1 ? { x: -W / 2 + (k + 0.5) * (W / n), z: 0 } : nextSlot();
        const sw = c.cellType === 'pallet' && items.length === 1 ? W / n : slotW;
        const pw = Math.min(sw - 0.08, 1.2);
        const pd = Math.min(slotD - 0.1, 1.2);
        const kf = k === n - 1 && frac > 0 && frac < 0.999 ? Math.max(0.3, frac) : 0.82 + hash(c.address, k) * 0.15;
        const lh = Math.max(0.2, (Math.min(H, 1.8) - 0.25) * kf);
        palletLoad(o, base, idx, p, s.x, s.z, pw, pd, lh, color, `${c.address}${k}`);
      }
    }
    for (const tid of tareIds) {
      const t = ctx.tareTypes.get(tid);
      if (!t) continue;
      const s = nextSlot();
      tareStack(o, base, idx, t, u.tare[tid], s.x, s.z, slotW, slotD, Math.min(H, 2.2), color);
    }
  });
  return o;
}
