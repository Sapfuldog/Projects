import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore, useWarehouse } from '../../store';
import { useCells, useFills, warehouseBounds } from '../../lib/derived';
import { polygonCentroid } from '../../lib/geometry';
import { rackContext, rackHeight, rackLength } from '../../lib/rack';
import type { Warehouse } from '../../types';
import { RoomMesh, ZoneMesh } from './Structure';
import { CellsLayer, RackFrames } from './Racks';
import { LabelProjector, LabelsLayer, type Label3D, type LabelRegistry } from './Labels';

/** Подгоняет камеру под объект при смене склада и плавно наводит её на выбранную ячейку. */
function CameraRig({ w }: { w: Warehouse }) {
  const three = useThree();
  if (import.meta.env.DEV) (window as unknown as { __three: unknown }).__three = three;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const focus = useStore((s) => s.focus);
  const anim = useRef<{ target: THREE.Vector3; pos: THREE.Vector3; t: number } | null>(null);
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!controls || fittedFor.current === w.id) return;
    fittedFor.current = w.id;
    const b = warehouseBounds(w);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minY + b.maxY) / 2;
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 10);
    const persp = camera as THREE.PerspectiveCamera;
    const fov = ((persp.fov ?? 45) * Math.PI) / 180;
    // Отодвигаем камеру так, чтобы объект поместился и по ширине, и по высоте кадра
    const dist = (size * 0.62) / Math.tan(fov / 2) / Math.min(1, persp.aspect || 1);
    const dir = new THREE.Vector3(0.45, 0.62, 0.78).normalize();
    controls.target.set(cx, 0, cz);
    camera.position.set(cx + dir.x * dist, dir.y * dist, cz + dir.z * dist);
    controls.update();
  }, [controls, camera, w]);

  useEffect(() => {
    if (!focus || !controls) return;
    const target = new THREE.Vector3(focus.x, focus.y, focus.z);
    let pos: THREE.Vector3;
    if (focus.cam) pos = new THREE.Vector3(focus.cam.x, focus.cam.y, focus.cam.z);
    else {
      const dir = camera.position.clone().sub(controls.target);
      dir.y = Math.max(dir.y, dir.length() * 0.5);
      pos = target.clone().add(dir.normalize().multiplyScalar(14));
    }
    anim.current = { target, pos, t: 0 };
  }, [focus, controls, camera]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt * 2.2);
    const k = 1 - Math.pow(1 - a.t, 3);
    controls.target.lerp(a.target, k);
    camera.position.lerp(a.pos, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

/** Подписи помещений, зон и стеллажей (HTML поверх 3D). */
function useSceneLabels(w: Warehouse | undefined, step: string, enabled: boolean): Label3D[] {
  return useMemo(() => {
    if (!w || !enabled) return [];
    const out: Label3D[] = [];
    for (const r of w.rooms) {
      const c = polygonCentroid(r.points);
      out.push({ key: `r${r.id}`, x: c.x, y: r.elevation + r.height + 0.6, z: c.y, text: r.name, cls: 'room' });
    }
    if (step === 'zones' || step === 'objects') {
      for (const z of w.zones) {
        const room = w.rooms.find((r) => r.id === z.roomId);
        const c = polygonCentroid(z.points);
        out.push({
          key: `z${z.id}`,
          x: c.x,
          y: (room?.elevation ?? 0) + 0.3,
          z: c.y,
          text: `${z.name} · ${z.height} м`,
          cls: 'zone',
          color: z.color,
        });
      }
    }
    if (w.racks.length <= 300) {
      // Подписи стеллажей поочерёдно у разных торцов, чтобы пары «спина к спине» не перекрывались
      const indexInZone = new Map<string, number>();
      for (const r of w.racks) {
        const i = indexInZone.get(r.zoneId) ?? 0;
        indexInZone.set(r.zoneId, i + 1);
        const { room } = rackContext(w, r);
        const half = rackLength(r) / 2000 + 0.5;
        const a = (r.rotation * Math.PI) / 180;
        const sgn = i % 2 === 0 ? -1 : 1;
        out.push({
          key: `k${r.id}`,
          x: r.x + sgn * Math.cos(a) * half,
          y: (room?.elevation ?? 0) + rackHeight(r) / 1000 + 0.3,
          z: r.y + sgn * Math.sin(a) * half,
          text: r.code,
          cls: 'rack',
        });
      }
    }
    return out;
  }, [w, step, enabled]);
}

export function Scene3D() {
  const w = useWarehouse();
  const { cells } = useCells();
  const fills = useFills();
  const selection = useStore((s) => s.selection);
  const step = useStore((s) => s.step);
  const show = useStore((s) => s.show);
  const theme = useStore((s) => s.theme);
  const select = useStore((s) => s.select);

  const selectedRackId =
    selection?.kind === 'rack' ? selection.id : selection?.kind === 'cell' ? selection.rackId : undefined;
  const showCargo = step === 'fill' || step === 'connect' || step === 'objects';
  const roomElev = useMemo(() => new Map(w?.rooms.map((r) => [r.id, r.elevation]) ?? []), [w?.rooms]);
  const labels = useSceneLabels(w, step, show.labels);
  const registry = useMemo<LabelRegistry>(() => ({ labels: [], els: new Map(), tip: null }), []);

  if (!w) return null;
  const bg = theme === 'dark' ? '#0b1220' : '#eef2f7';

  return (
    <div className="scene">
      <Canvas
        camera={{ position: [40, 40, 60], fov: 45, near: 0.1, far: 3000 }}
        dpr={[1, 2]}
        onPointerMissed={(e) => e.button === 0 && select(null)}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={[bg]} />
        <hemisphereLight args={['#ffffff', '#7c8797', 1.1]} />
        <directionalLight position={[60, 120, 40]} intensity={1.4} />
        <directionalLight position={[-40, 60, -60]} intensity={0.4} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.02} />
        <CameraRig w={w} />
        <Grid
          position={[0, -0.02, 0]}
          infiniteGrid
          cellSize={1}
          sectionSize={5}
          cellColor={theme === 'dark' ? '#1e293b' : '#cbd5e1'}
          sectionColor={theme === 'dark' ? '#334155' : '#94a3b8'}
          fadeDistance={250}
          cellThickness={0.6}
          sectionThickness={1}
        />
        {w.rooms.map((r) => (
          <RoomMesh
            key={r.id}
            room={r}
            selected={selection?.kind === 'room' && selection.id === r.id}
            showWalls={show.walls}
          />
        ))}
        {w.zones.map((z) => (
          <ZoneMesh
            key={z.id}
            zone={z}
            elevation={roomElev.get(z.roomId) ?? 0}
            selected={selection?.kind === 'zone' && selection.id === z.id}
            showVolume={show.zones && (step === 'zones' || (selection?.kind === 'zone' && selection.id === z.id))}
          />
        ))}
        <RackFrames w={w} selectedRackId={selectedRackId} />
        {show.cells && (
          <CellsLayer
            w={w}
            cells={cells}
            fills={fills}
            showCargo={showCargo}
            selectedKey={selection?.kind === 'cell' ? selection.id : undefined}
            selectedRackId={step === 'racks' || step === 'cells' ? selectedRackId : undefined}
          />
        )}
        <LabelProjector registry={registry} />
      </Canvas>
      <LabelsLayer registry={registry} labels={labels} />
    </div>
  );
}
