import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Mezzanine } from '../../types';
import { DECK_T } from '../../lib/rack';
import { shade } from '../../lib/colors';
import { Batch, Instances, baseMatrix, type SceneInfo } from './common';

const LANE = 1.2;
const RISE = 0.19;
const TREAD = 0.27;
const RAIL = '#f2c94c';

/** Геометрия лестничного марша k (с 1): ось марша поперёк мезонина. */
export function stairLane(m: Mezzanine, k: number) {
  const sgn = m.stairs === 'end' ? 1 : -1;
  const u = sgn * (m.length / 2 - 0.2 - LANE / 2 - (k - 1) * (LANE + 0.1));
  const n = Math.ceil(m.levelHeight / RISE);
  const run = n * TREAD;
  const v0 = -m.width / 2 + 0.3;
  return { u, u0: u - LANE / 2 - 0.05, u1: u + LANE / 2 + 0.05, v0, v1: v0 + run, n, rise: m.levelHeight / n };
}

function railLine(
  b: Batch<string>,
  base: THREE.Matrix4,
  owner: string,
  y: number,
  ua: number,
  va: number,
  ub: number,
  vb: number,
) {
  const len = Math.hypot(ub - ua, vb - va);
  if (len < 0.05) return;
  const n = Math.max(1, Math.ceil(len / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(RAIL, ua + (ub - ua) * t, y + 0.55, va + (vb - va) * t, 0.05, 1.1, 0.05, base, owner);
  }
  const along = Math.abs(vb - va) < 1e-6;
  const cu = (ua + ub) / 2;
  const cv = (va + vb) / 2;
  for (const h of [1.1, 0.55]) b.add(RAIL, cu, y + h, cv, along ? len : 0.05, 0.05, along ? 0.05 : len, base, owner);
}

/** Мезонины: колонны, настилы по уровням, лестничные марши и ограждения. */
export function MezzaninesLayer({
  info,
  selectedId,
  onPick,
}: {
  info: SceneInfo;
  selectedId?: string;
  onPick?: (m: Mezzanine, e: ThreeEvent<MouseEvent>) => boolean | void;
}) {
  const data = useMemo(() => {
    const cols = new Batch<string>();
    const decks = new Batch<string>();
    const steps = new Batch<string>();
    const rails = new Batch<string>();
    const base = new THREE.Matrix4();
    for (const m of info.w.mezzanines) {
      const zone = info.w.zones.find((z) => z.id === m.zoneId);
      const room = info.zoneRoom(zone);
      if (!info.roomVisible(room)) continue;
      baseMatrix(m.x, info.roomBase(room), m.y, (-m.rotation * Math.PI) / 180, base);
      const L = m.length;
      const W = m.width;
      const H = m.levelHeight;
      const top = m.levels * H;
      const sel = m.id === selectedId;
      const deckColor = sel ? '#7cc4ec' : '#a7b1bc';
      const beamColor = shade(m.color, -0.1);
      // Колонны с шагом не больше 3 м
      const nu = Math.max(1, Math.ceil(L / 3));
      const nv = Math.max(1, Math.ceil(W / 3));
      for (let i = 0; i <= nu; i++)
        for (let j = 0; j <= nv; j++)
          cols.add(
            sel ? '#0ea5e9' : m.color,
            -L / 2 + (L * i) / nu,
            top / 2,
            -W / 2 + (W * j) / nv,
            0.14,
            top,
            0.14,
            base,
            m.id,
          );
      for (let k = 1; k <= m.levels; k++) {
        const y = k * H;
        const lane = stairLane(m, k);
        // Настил без проёма над маршем k
        const parts: [number, number, number, number][] = [
          [-L / 2, lane.u0, -W / 2, W / 2],
          [lane.u1, L / 2, -W / 2, W / 2],
          [lane.u0, lane.u1, lane.v1, W / 2],
        ];
        for (const [ua, ub, va, vb] of parts)
          if (ub - ua > 0.05 && vb - va > 0.05)
            decks.add(deckColor, (ua + ub) / 2, y + DECK_T / 2, (va + vb) / 2, ub - ua, DECK_T, vb - va, base, m.id);
        // Обвязка настила
        for (const v of [-W / 2, W / 2]) decks.add(beamColor, 0, y - 0.09, v, L, 0.18, 0.1, base, m.id);
        for (const u of [-L / 2, L / 2]) decks.add(beamColor, u, y - 0.09, 0, 0.1, 0.18, W, base, m.id);
        // Ограждение по периметру и вдоль проёма
        const yr = y + DECK_T;
        railLine(rails, base, m.id, yr, -L / 2, -W / 2, L / 2, -W / 2);
        railLine(rails, base, m.id, yr, -L / 2, W / 2, L / 2, W / 2);
        railLine(rails, base, m.id, yr, -L / 2, -W / 2, -L / 2, W / 2);
        railLine(rails, base, m.id, yr, L / 2, -W / 2, L / 2, W / 2);
        railLine(rails, base, m.id, yr, lane.u0, lane.v0, lane.u0, lane.v1);
        railLine(rails, base, m.id, yr, lane.u1, lane.v0, lane.u1, lane.v1);
        // Лестничный марш с уровня k−1 на уровень k
        const y0 = (k - 1) * H;
        for (let i = 1; i <= lane.n; i++)
          steps.add(
            '#f2c94c',
            lane.u,
            y0 + i * lane.rise - 0.03,
            lane.v0 + (i - 0.5) * TREAD,
            LANE,
            0.06,
            TREAD - 0.02,
            base,
            m.id,
          );
        // Косоуры — ступенчатые опоры под маршем
        for (const du of [-LANE / 2, LANE / 2])
          for (let i = 1; i <= lane.n; i += 2) {
            const hh = y0 + i * lane.rise;
            steps.add(
              '#5b6b7f',
              lane.u + du,
              y0 + hh / 2 - y0 / 2,
              lane.v0 + (i - 0.5) * TREAD,
              0.06,
              hh - y0,
              0.06,
              base,
              m.id,
            );
          }
      }
    }
    return {
      cols: cols.arrays(),
      colOwner: cols.owner,
      decks: decks.arrays(),
      deckOwner: decks.owner,
      steps: steps.arrays(),
      rails: rails.arrays(),
    };
  }, [info, selectedId]);

  const pick = (owner: string[]) =>
    onPick
      ? (i: number, e: ThreeEvent<MouseEvent>) => {
          const m = info.w.mezzanines.find((x) => x.id === owner[i]);
          return m ? onPick(m, e) : false;
        }
      : undefined;

  return (
    <>
      <Instances name="mezz-cols" matrices={data.cols.m} colors={data.cols.c} castShadow onPick={pick(data.colOwner)} />
      <Instances
        name="mezz-decks"
        matrices={data.decks.m}
        colors={data.decks.c}
        castShadow
        receiveShadow
        onPick={pick(data.deckOwner)}
      />
      <Instances name="mezz-steps" matrices={data.steps.m} colors={data.steps.c} castShadow />
      <Instances name="mezz-rails" matrices={data.rails.m} colors={data.rails.c} />
    </>
  );
}
