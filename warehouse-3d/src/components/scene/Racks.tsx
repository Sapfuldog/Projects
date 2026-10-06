import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useHover } from './Labels';
import type { ThreeEvent } from '@react-three/fiber';
import type { Cell, CellFill, ColorMode, Warehouse } from '../../types';
import { rackContext, rackFrame } from '../../lib/rack';
import { COLOR_BLOCKED, fillColor, hashColor, loadColor } from '../../lib/fill';
import { useStore } from '../../store';

export const TIER_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#a3e635'];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

interface InstancedProps {
  matrices: Float32Array;
  colors: Float32Array;
  opacity?: number;
  depthWrite?: boolean;
  emissive?: number;
  /** Вернуть false, чтобы пропустить событие дальше (к объекту позади) */
  onPick?: (index: number, e: ThreeEvent<MouseEvent>) => boolean | void;
  onHover?: (index: number | null) => void;
}

/** Набор одинаковых коробок одним draw call — тысячи ячеек без потери FPS. */
function InstancedBoxes({
  name,
  matrices,
  colors,
  opacity = 1,
  depthWrite = true,
  emissive = 0,
  onPick,
  onHover,
}: InstancedProps & { name?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = matrices.length / 16;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    m.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
    m.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    m.count = count;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [matrices, colors, count]);
  if (!count) return null;
  const transparent = opacity < 1;
  return (
    <instancedMesh
      key={count}
      name={name}
      ref={ref}
      args={[undefined, undefined, count]}
      onClick={
        onPick
          ? (e) => {
              if (e.instanceId === undefined) return;
              if (onPick(e.instanceId, e) !== false) e.stopPropagation();
            }
          : undefined
      }
      onPointerMove={
        onHover
          ? (e) => {
              e.stopPropagation();
              onHover(e.instanceId ?? null);
            }
          : undefined
      }
      onPointerOut={onHover ? () => onHover(null) : undefined}
      {...(onPick || onHover ? {} : { raycast: () => null })}
    >
      <boxGeometry />
      <meshStandardMaterial
        transparent={transparent}
        opacity={opacity}
        depthWrite={depthWrite}
        roughness={0.7}
        metalness={0.05}
        emissive={emissive ? '#ffffff' : '#000000'}
        emissiveIntensity={emissive}
      />
    </instancedMesh>
  );
}

function pushBox(
  matrices: number[],
  colors: number[],
  color: string,
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  tmpM.compose(tmpP.set(x, y, z), tmpQ.identity(), tmpS.set(sx, sy, sz));
  tmpM.premultiply(base);
  matrices.push(...tmpM.elements);
  tmpC.set(color);
  colors.push(tmpC.r, tmpC.g, tmpC.b);
}

/** Каркас всех стеллажей: стойки и балки/полки. */
export function RackFrames({ w, selectedRackId }: { w: Warehouse; selectedRackId?: string }) {
  const select = useStore((s) => s.select);
  // Стойки стоят на границах ячеек: если сразу за стойкой есть ячейка — отдаём клик ей
  const pickRack = (rackId: string, e: ThreeEvent<MouseEvent>) => {
    if (e.intersections.some((h) => h.object.name.startsWith('cell-') && h.distance - e.distance < 0.8)) return false;
    select({ kind: 'rack', id: rackId });
  };
  const data = useMemo(() => {
    const up = { m: [] as number[], c: [] as number[], rack: [] as string[] };
    const bm = { m: [] as number[], c: [] as number[], rack: [] as string[] };
    const base = new THREE.Matrix4();
    for (const r of w.racks) {
      const { room } = rackContext(w, r);
      base.compose(
        tmpP.set(r.x, room?.elevation ?? 0, r.y),
        new THREE.Quaternion().setFromAxisAngle(UP, (-r.rotation * Math.PI) / 180),
        tmpS.set(1, 1, 1),
      );
      const frame = rackFrame(r);
      const sel = r.id === selectedRackId;
      const upColor = sel ? '#0ea5e9' : r.kind === 'pallet' ? '#1e40af' : '#64748b';
      const beamColor = sel ? '#38bdf8' : r.kind === 'pallet' ? '#ea580c' : '#cbd5e1';
      for (const b of frame.uprights) {
        pushBox(up.m, up.c, upColor, base, b.x, b.y, b.z, b.sx, b.sy, b.sz);
        up.rack.push(r.id);
      }
      for (const b of frame.beams) {
        pushBox(bm.m, bm.c, beamColor, base, b.x, b.y, b.z, b.sx, b.sy, b.sz);
        bm.rack.push(r.id);
      }
    }
    return {
      up: { m: new Float32Array(up.m), c: new Float32Array(up.c), rack: up.rack },
      bm: { m: new Float32Array(bm.m), c: new Float32Array(bm.c), rack: bm.rack },
    };
  }, [w, selectedRackId]);

  return (
    <>
      <InstancedBoxes
        name="uprights"
        matrices={data.up.m}
        colors={data.up.c}
        onPick={(i, e) => pickRack(data.up.rack[i], e)}
      />
      <InstancedBoxes
        name="beams"
        matrices={data.bm.m}
        colors={data.bm.c}
        onPick={(i, e) => pickRack(data.bm.rack[i], e)}
      />
    </>
  );
}

function cargoColor(mode: ColorMode, c: Cell, f: CellFill, zoneColor: Map<string, string>): string {
  switch (mode) {
    case 'load':
      return f.weight !== undefined && c.maxLoad ? loadColor(f.weight / c.maxLoad) : '#94a3b8';
    case 'sku':
      return f.sku ? hashColor(f.sku) : '#94a3b8';
    case 'zone':
      return zoneColor.get(c.zoneId) ?? '#94a3b8';
    default:
      return fillColor(f.fill);
  }
}

const GAP = 0.04;

/** Ячейки: прозрачные объёмы + груз (высота = доля заполнения) + заблокированные. */
export function CellsLayer({
  w,
  cells,
  fills,
  showCargo,
  selectedKey,
  selectedRackId,
}: {
  w: Warehouse;
  cells: Cell[];
  fills: Record<string, CellFill>;
  showCargo: boolean;
  selectedKey?: string;
  selectedRackId?: string;
}) {
  const select = useStore((s) => s.select);
  const tierFilter = useStore((s) => s.tierFilter);
  const colorMode = useStore((s) => s.colorMode);
  const search = useStore((s) => s.search);
  const setHoverCell = useHover((s) => s.set);
  const setHover = (c: Cell | null) => {
    if (useHover.getState().cell === c) return;
    if (!c) return setHoverCell(null);
    const f = fills[c.address];
    setHoverCell(c, `${c.address}${f ? ` · ${Math.round(f.fill * 100)}%` : ''}${c.blocked ? ' · заблокирована' : ''}`);
  };

  const visible = useMemo(() => (tierFilter ? cells.filter((c) => c.tier === tierFilter) : cells), [cells, tierFilter]);

  const volumes = useMemo(() => {
    const m = new Float32Array(visible.length * 16);
    const col = new Float32Array(visible.length * 3);
    visible.forEach((c, i) => {
      tmpQ.setFromAxisAngle(UP, c.rotY);
      tmpM.compose(
        tmpP.set(c.cx, c.cy, c.cz),
        tmpQ,
        tmpS.set(c.length / 1000 - GAP, c.height / 1000 - GAP, c.width / 1000 - GAP),
      );
      m.set(tmpM.elements, i * 16);
      const highlight = c.rackId === selectedRackId;
      tmpC.set(
        showCargo
          ? highlight
            ? '#7dd3fc'
            : '#cbd5e1'
          : highlight
            ? '#38bdf8'
            : TIER_COLORS[(c.tier - 1) % TIER_COLORS.length],
      );
      col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    });
    return { m, col };
  }, [visible, showCargo, selectedRackId]);

  const solids = useMemo(() => {
    const zoneColor = new Map(w.zones.map((z) => [z.id, z.color]));
    const m: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    visible.forEach((c, i) => {
      const f = fills[c.address];
      let color: string;
      let h: number;
      if (c.blocked) {
        color = COLOR_BLOCKED;
        h = c.height / 1000 - GAP;
      } else if (showCargo && f && f.fill > 0) {
        color = cargoColor(colorMode, c, f, zoneColor);
        h = Math.max(0.03, (c.height / 1000 - GAP) * f.fill);
      } else return;
      tmpQ.setFromAxisAngle(UP, c.rotY);
      const bottom = c.cy - c.height / 2000 + GAP / 2;
      tmpM.compose(
        tmpP.set(c.cx, bottom + h / 2, c.cz),
        tmpQ,
        tmpS.set((c.length / 1000 - GAP) * 0.92, h, (c.width / 1000 - GAP) * 0.92),
      );
      m.push(...tmpM.elements);
      tmpC.set(color);
      col.push(tmpC.r, tmpC.g, tmpC.b);
      idx.push(i);
    });
    return { m: new Float32Array(m), col: new Float32Array(col), idx };
  }, [visible, fills, showCargo, colorMode, w.zones]);

  const found = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (q.length < 2) return null;
    const hits = visible.filter(
      (c) => c.address.toUpperCase().includes(q) || (fills[c.address]?.sku ?? '').toUpperCase().includes(q),
    );
    if (!hits.length || hits.length > 2000) return null;
    const m = new Float32Array(hits.length * 16);
    const col = new Float32Array(hits.length * 3).fill(0);
    hits.forEach((c, i) => {
      tmpQ.setFromAxisAngle(UP, c.rotY);
      tmpM.compose(
        tmpP.set(c.cx, c.cy, c.cz),
        tmpQ,
        tmpS.set(c.length / 1000 + 0.02, c.height / 1000 + 0.02, c.width / 1000 + 0.02),
      );
      m.set(tmpM.elements, i * 16);
      col.set([0.02, 0.85, 1], i * 3);
    });
    return { m, col };
  }, [search, visible, fills]);

  const selected = selectedKey ? cells.find((c) => c.key === selectedKey) : undefined;
  const pick = (c: Cell) => select({ kind: 'cell', id: c.key, rackId: c.rackId });

  return (
    <>
      <InstancedBoxes
        name="cell-volumes"
        matrices={volumes.m}
        colors={volumes.col}
        opacity={showCargo ? 0.12 : 0.3}
        depthWrite={false}
        onPick={(i) => pick(visible[i])}
        onHover={(i) => setHover(i == null ? null : visible[i])}
      />
      <InstancedBoxes
        name="cell-solids"
        matrices={solids.m}
        colors={solids.col}
        onPick={(i) => pick(visible[solids.idx[i]])}
        onHover={(i) => setHover(i == null ? null : visible[solids.idx[i]])}
      />
      {found && (
        <InstancedBoxes matrices={found.m} colors={found.col} opacity={0.55} depthWrite={false} emissive={0.6} />
      )}
      {selected && (
        <mesh position={[selected.cx, selected.cy, selected.cz]} rotation={[0, selected.rotY, 0]} raycast={() => null}>
          <boxGeometry
            args={[selected.length / 1000 + 0.05, selected.height / 1000 + 0.05, selected.width / 1000 + 0.05]}
          />
          <meshBasicMaterial color="#ef4444" wireframe />
        </mesh>
      )}
    </>
  );
}
