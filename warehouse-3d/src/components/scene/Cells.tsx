import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Cell, ColorMode } from '../../types';
import type { Monitor } from '../../lib/monitor';
import { buildCargo, type CargoCtx } from './cargo';
import { Batch, Instances, baseMatrix, noRaycast, type SceneInfo } from './common';
import { useHover } from './Labels';

const GAP = 0.04;

/** Ячейки: прозрачные объёмы (для наведения и выбора), груз по форме, подсветка и выбор. */
export function CellsLayer({
  info,
  monitor,
  cells,
  mode,
  ctx,
  showCargo,
  selectedKey,
  selectedRackId,
  highlight,
  onPick,
}: {
  info: SceneInfo;
  monitor: Monitor;
  /** Видимые ячейки (после фильтров) */
  cells: Cell[];
  mode: ColorMode;
  ctx: CargoCtx;
  showCargo: boolean;
  selectedKey?: string;
  selectedRackId?: string;
  highlight: Set<string>;
  onPick: (c: Cell, e: ThreeEvent<MouseEvent>) => void;
}) {
  const setHover = useHover((s) => s.set);
  const lift = info.lift;

  const volumes = useMemo(() => {
    const all = new Batch();
    const accent = new Batch();
    const base = new THREE.Matrix4();
    cells.forEach((c, i) => {
      const y = c.bottom + lift(c.floorId);
      baseMatrix(c.cx, y, c.cz, c.rotY, base);
      const w = c.width / 1000 - GAP;
      const h = c.height / 1000 - GAP;
      const d = c.depth / 1000 - GAP;
      all.add('#9fb1c6', 0, h / 2 + GAP / 2, 0, w, h, d, base, i);
      const f = monitor.fill.get(c.address) ?? 0;
      let accentColor: string | null = null;
      if (c.blocked) accentColor = '#ef4444';
      else if (c.rackId && c.rackId === selectedRackId) accentColor = '#38bdf8';
      else if (c.reservedFor && f === 0) accentColor = '#7dd3fc';
      else if (mode === 'fill' && f === 0) accentColor = '#4ade80';
      if (accentColor) accent.add(accentColor, 0, h / 2 + GAP / 2, 0, w, h, d, base);
    });
    return { all: all.arrays(), accent: accent.arrays() };
  }, [cells, monitor, lift, mode, selectedRackId]);

  const cargo = useMemo(() => {
    if (!showCargo) return null;
    const o = buildCargo(cells, monitor.usage, monitor.fill, ctx, lift);
    return { boxes: o.boxes.arrays(), cyls: o.cyls.arrays() };
  }, [showCargo, cells, monitor, ctx, lift]);

  const marks = useMemo(() => {
    const b = new Batch();
    if (!highlight.size) return b.arrays();
    const base = new THREE.Matrix4();
    for (const c of cells) {
      if (!highlight.has(c.address)) continue;
      baseMatrix(c.cx, c.bottom + lift(c.floorId), c.cz, c.rotY, base);
      b.add(
        '#06b6d4',
        0,
        c.height / 2000,
        0,
        c.width / 1000 + 0.06,
        c.height / 1000 + 0.06,
        c.depth / 1000 + 0.06,
        base,
      );
    }
    return b.arrays();
  }, [cells, highlight, lift]);

  const selected = selectedKey ? monitor.idx.byKey.get(selectedKey) : undefined;
  const selEdges = useMemo(
    () =>
      selected
        ? new THREE.EdgesGeometry(
            new THREE.BoxGeometry(
              selected.width / 1000 + 0.08,
              selected.height / 1000 + 0.08,
              selected.depth / 1000 + 0.08,
            ),
          )
        : null,
    [selected],
  );

  return (
    <>
      <Instances
        name="cell-volumes"
        matrices={volumes.all.m}
        colors={volumes.all.c}
        opacity={0.07}
        depthWrite={false}
        flat
        onPick={(i, e) => onPick(cells[i], e)}
        onHover={(i) => {
          const c = i == null ? null : cells[i];
          if (useHover.getState().cell === c) return;
          setHover(c, c ? [c.cx, c.bottom + lift(c.floorId) + c.height / 1000, c.cz] : null);
        }}
      />
      <Instances
        name="cell-accent"
        matrices={volumes.accent.m}
        colors={volumes.accent.c}
        opacity={0.22}
        depthWrite={false}
        flat
      />
      {cargo && (
        <>
          <Instances name="cargo-boxes" matrices={cargo.boxes.m} colors={cargo.boxes.c} castShadow receiveShadow />
          <Instances
            name="cargo-cyls"
            shape="cyl"
            matrices={cargo.cyls.m}
            colors={cargo.cyls.c}
            castShadow
            receiveShadow
          />
        </>
      )}
      <Instances name="cell-marks" matrices={marks.m} colors={marks.c} opacity={0.4} depthWrite={false} flat />
      {selected && selEdges && (
        <group
          position={[selected.cx, selected.bottom + lift(selected.floorId) + selected.height / 2000, selected.cz]}
          rotation={[0, selected.rotY, 0]}
        >
          <lineSegments geometry={selEdges} raycast={noRaycast}>
            <lineBasicMaterial color="#e11d48" linewidth={2} />
          </lineSegments>
          <mesh raycast={noRaycast}>
            <boxGeometry
              args={[selected.width / 1000 + 0.06, selected.height / 1000 + 0.06, selected.depth / 1000 + 0.06]}
            />
            <meshBasicMaterial color="#fb7185" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        </group>
      )}
    </>
  );
}
