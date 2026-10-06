import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { RackKind } from '../../types';
import { rackContext, rackFrame } from '../../lib/rack';
import { Batch, Instances, baseMatrix, type SceneInfo } from './common';

/** Цвета каркаса по видам стеллажей: стойки, балки/консоли, полки/основания, разметка. */
export const FRAME_COLORS: Record<RackKind, { post: string; beam: string; panel: string; mark: string }> = {
  pallet: { post: '#2f6fd0', beam: '#f08a24', panel: '#c9d2dc', mark: '#f2c94c' },
  shelf: { post: '#7d8da1', beam: '#7d8da1', panel: '#dce3ea', mark: '#f2c94c' },
  cantilever: { post: '#55606c', beam: '#f08a24', panel: '#55606c', mark: '#f2c94c' },
  floor: { post: '#f2c94c', beam: '#f2c94c', panel: '#f2c94c', mark: '#f2c94c' },
  cylinder: { post: '#e2b93b', beam: '#3b3f45', panel: '#8a8f99', mark: '#f2c94c' },
};

/** Каркасы всех стеллажей: стойки, балки, полки, разметка напольных мест. */
export function RackFrames({
  info,
  visibleRack,
  selectedRackId,
  onPick,
}: {
  info: SceneInfo;
  visibleRack: (rackId: string) => boolean;
  selectedRackId?: string;
  onPick?: (rackId: string, e: ThreeEvent<MouseEvent>) => boolean | void;
}) {
  const data = useMemo(() => {
    const solid = new Batch<string>();
    const marks = new Batch<string>();
    const base = new THREE.Matrix4();
    for (const r of info.w.racks) {
      if (!visibleRack(r.id)) continue;
      const ctx = rackContext(info.w, r);
      baseMatrix(r.x, ctx.base + info.lift(ctx.room?.floorId), r.y, (-r.rotation * Math.PI) / 180, base);
      const f = rackFrame(r);
      const col = FRAME_COLORS[r.kind];
      const sel = r.id === selectedRackId;
      for (const b of f.posts) solid.add(sel ? '#0ea5e9' : col.post, b.x, b.y, b.z, b.sx, b.sy, b.sz, base, r.id);
      for (const b of f.beams) solid.add(sel ? '#38bdf8' : col.beam, b.x, b.y, b.z, b.sx, b.sy, b.sz, base, r.id);
      for (const b of f.panels) solid.add(sel ? '#bae6fd' : col.panel, b.x, b.y, b.z, b.sx, b.sy, b.sz, base, r.id);
      for (const b of f.marks)
        marks.add(sel ? '#0ea5e9' : col.mark, b.x, b.y + 0.03, b.z, b.sx, b.sy, b.sz, base, r.id);
    }
    return { solid: solid.arrays(), solidOwner: solid.owner, marks: marks.arrays() };
  }, [info, visibleRack, selectedRackId]);

  return (
    <>
      <Instances
        name="rack-frames"
        matrices={data.solid.m}
        colors={data.solid.c}
        castShadow
        receiveShadow
        onPick={onPick ? (i, e) => onPick(data.solidOwner[i], e) : undefined}
      />
      <Instances name="rack-marks" matrices={data.marks.m} colors={data.marks.c} flat />
    </>
  );
}
