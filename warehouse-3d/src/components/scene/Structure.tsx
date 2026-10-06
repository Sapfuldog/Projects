import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import type { Pt, Room, Zone } from '../../types';
import { pointInPolygon } from '../../lib/geometry';
import { ROOM_KINDS } from '../../lib/demo';
import { shade } from '../../lib/colors';
import { Batch, Instances, noRaycast, toonGradient, type SceneInfo } from './common';
import type { WallMode } from '../../store';

/** Shape в координатах, которые после поворота −90° по X совпадают с планом (x, y) → 3D (x, z). */
export function planShape(points: Pt[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.y) : shape.lineTo(p.x, -p.y)));
  shape.closePath();
  return shape;
}

function outlineGeometry(points: Pt[], y0: number, y1: number, verticals = true): THREE.BufferGeometry {
  const v: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    v.push(a.x, y0, a.y, b.x, y0, b.y);
    if (y1 !== y0) v.push(a.x, y1, a.y, b.x, y1, b.y);
    if (verticals && y1 !== y0) v.push(a.x, y0, a.y, a.x, y1, a.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

const edges = (pts: Pt[]) => pts.map((a, i) => [a, pts[(i + 1) % pts.length]] as const);

/** Точки вдоль ломаной с шагом не больше step (для столбов ограждения и колонн навеса). */
function along(a: Pt, b: Pt, step: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  return Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/** Отрезок плана как бокс: центр, длина и угол поворота (рад, вокруг вертикали). */
function segment(a: Pt, b: Pt) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { cx: (a.x + b.x) / 2, cz: (a.y + b.y) / 2, len, rot: -Math.atan2(b.y - a.y, b.x - a.x) };
}

const tmpBase = new THREE.Matrix4();
const q = new THREE.Quaternion();
const UPV = new THREE.Vector3(0, 1, 0);
const one = new THREE.Vector3(1, 1, 1);
function segBase(cx: number, y: number, cz: number, rot: number) {
  q.setFromAxisAngle(UPV, rot);
  return tmpBase.compose(new THREE.Vector3(cx, y, cz), q, one);
}

// ---------- Земля ----------

export function Ground({
  bounds,
  dark,
}: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  dark: boolean;
}) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minY + bounds.maxY) / 2;
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 400;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[size, size]} />
        <meshToonMaterial color={dark ? '#1b2638' : '#dde5d3'} gradientMap={toonGradient()} />
      </mesh>
      <Grid
        position={[cx, -0.01, cz]}
        args={[size, size]}
        cellSize={1}
        sectionSize={10}
        cellColor={dark ? '#223049' : '#cfd8c4'}
        sectionColor={dark ? '#2c3d5c' : '#b9c4ad'}
        fadeDistance={260}
        fadeStrength={1.5}
        cellThickness={0.5}
        sectionThickness={0.9}
      />
    </>
  );
}

// ---------- Помещения: плиты пола, стены-срез, навесы, ограждения ----------

const SLAB: Record<Room['kind'], number> = {
  storage: 0.3,
  production: 0.3,
  office: 0.3,
  technical: 0.3,
  canopy: 0.15,
  yard: 0.08,
};
const WALL_T = 0.3;
const CUT_H = 1.1;

interface WallSeg {
  cx: number;
  cz: number;
  rot: number;
  len: number;
  base: number;
  full: number;
  /** Наружная нормаль на плане */
  nx: number;
  nz: number;
  color: string;
  cap: string;
}

const wm = new THREE.Matrix4();
const wq = new THREE.Quaternion();
const wp = new THREE.Vector3();
const ws = new THREE.Vector3();
const wy = new THREE.Vector3(0, 1, 0);
const wc = new THREE.Color();

/**
 * Стены «кукольного домика»: стены, обращённые к камере, срезаны низко, дальние — во всю высоту.
 * Так видно и здание, и всё, что внутри. В режиме «полные» — все стены во всю высоту.
 */
function Walls({ segs, mode }: { segs: WallSeg[]; mode: WallMode }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const state = useRef('');
  const camera = useRef(new THREE.Vector3());
  const n = segs.length;
  const update = (cam: THREE.Vector3, force = false) => {
    const key = segs
      .map((s) => (mode === 'full' || (cam.x - s.cx) * s.nx + (cam.z - s.cz) * s.nz < 0 ? 1 : 0))
      .join('');
    if (!force && key === state.current) return;
    state.current = key;
    const b = body.current;
    const c = caps.current;
    if (!b || !c) return;
    segs.forEach((s, i) => {
      const h = key[i] === '1' ? s.full : Math.min(s.full, CUT_H);
      wq.setFromAxisAngle(wy, s.rot);
      wm.compose(wp.set(s.cx, s.base + h / 2, s.cz), wq, ws.set(s.len + WALL_T, h, WALL_T));
      b.setMatrixAt(i, wm);
      b.setColorAt(i, wc.set(s.color));
      wm.compose(wp.set(s.cx, s.base + h + 0.03, s.cz), wq, ws.set(s.len + WALL_T, 0.06, WALL_T + 0.02));
      c.setMatrixAt(i, wm);
      c.setColorAt(i, wc.set(s.cap));
    });
    b.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
    b.computeBoundingSphere();
    c.computeBoundingSphere();
  };
  useLayoutEffect(() => {
    state.current = '';
    update(camera.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segs, mode]);
  useFrame(({ camera: cam }) => {
    camera.current.copy(cam.position);
    update(cam.position);
  });
  if (!n) return null;
  return (
    <>
      <instancedMesh
        key={`w${n}`}
        ref={body}
        args={[undefined, undefined, n]}
        castShadow
        receiveShadow
        raycast={noRaycast}
      >
        <boxGeometry />
        <meshToonMaterial gradientMap={toonGradient()} />
      </instancedMesh>
      <instancedMesh key={`c${n}`} ref={caps} args={[undefined, undefined, n]} raycast={noRaycast}>
        <boxGeometry />
        <meshToonMaterial gradientMap={toonGradient()} />
      </instancedMesh>
    </>
  );
}

function RoomSlab({
  room,
  base,
  selected,
  onClick,
}: {
  room: Room;
  base: number;
  selected: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const t = SLAB[room.kind];
  const { slab, outline } = useMemo(
    () => ({
      slab: new THREE.ExtrudeGeometry(planShape(room.points), { depth: t, bevelEnabled: false }),
      outline: outlineGeometry(room.points, t + 0.01, t + 0.01, false),
    }),
    [room.points, t],
  );
  const color = ROOM_KINDS[room.kind].floor;
  return (
    <group position={[0, base - t + 0.02, 0]}>
      <mesh geometry={slab} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={onClick}>
        <meshToonMaterial
          color={selected ? shade(color, -0.08) : color}
          gradientMap={toonGradient()}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={outline} raycast={noRaycast}>
        <lineBasicMaterial color={selected ? '#2563eb' : shade(color, -0.35)} />
      </lineSegments>
    </group>
  );
}

function CanopyRoof({ room, base }: { room: Room; base: number }) {
  const geo = useMemo(() => new THREE.ShapeGeometry(planShape(room.points)), [room.points]);
  return (
    <mesh
      geometry={geo}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, base + room.height + 0.12, 0]}
      raycast={noRaycast}
    >
      <meshToonMaterial
        color={shade(room.color, 0.35)}
        gradientMap={toonGradient()}
        transparent
        opacity={0.32}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function RoomsLayer({
  info,
  wallMode,
  selectedRoomId,
  onRoomClick,
}: {
  info: SceneInfo;
  wallMode: WallMode;
  selectedRoomId?: string;
  onRoomClick?: (room: Room, e: ThreeEvent<MouseEvent>) => void;
}) {
  const rooms = useMemo(() => info.w.rooms.filter((r) => info.roomVisible(r)), [info]);
  const parts = useMemo(() => {
    const walls: WallSeg[] = [];
    const posts = new Batch();
    const mesh = new Batch();
    for (const room of rooms) {
      const base = info.roomBase(room);
      const spec = ROOM_KINDS[room.kind];
      if (spec.walls && wallMode !== 'none') {
        for (const [a, b] of edges(room.points)) {
          const s = segment(a, b);
          // Наружная нормаль: точка чуть снаружи середины стены не должна попасть в помещение
          let nx = (b.y - a.y) / (s.len || 1);
          let nz = -(b.x - a.x) / (s.len || 1);
          if (pointInPolygon({ x: s.cx + nx * 0.4, y: s.cz + nz * 0.4 }, room.points)) {
            nx = -nx;
            nz = -nz;
          }
          walls.push({
            cx: s.cx,
            cz: s.cz,
            rot: s.rot,
            len: s.len,
            base,
            full: room.height,
            nx,
            nz,
            color: shade(room.color, 0.5),
            cap: shade(room.color, -0.35),
          });
        }
      }
      if (spec.roof) {
        // Навес: колонны по контуру и обвязка поверху
        for (const [a, b] of edges(room.points)) {
          for (const p of along(a, b, 6)) posts.add('#8a6f4a', p.x, base + room.height / 2, p.y, 0.3, room.height, 0.3);
          const s = segment(a, b);
          posts.add('#7a6040', 0, room.height - 0.15, 0, s.len + 0.3, 0.3, 0.25, segBase(s.cx, base, s.cz, s.rot));
        }
      }
      if (room.fence) {
        const fh = 1.8;
        for (const [a, b] of edges(room.points)) {
          for (const p of along(a, b, 2.5)) posts.add('#6b7785', p.x, base + fh / 2, p.y, 0.08, fh, 0.08);
          const s = segment(a, b);
          const m = segBase(s.cx, base, s.cz, s.rot);
          posts.add('#6b7785', 0, fh - 0.03, 0, s.len, 0.05, 0.05, m);
          posts.add('#6b7785', 0, 0.12, 0, s.len, 0.05, 0.05, m);
          mesh.add('#94a3b8', 0, fh / 2, 0, s.len, fh - 0.1, 0.02, m);
        }
      }
    }
    return { walls, posts: posts.arrays(), mesh: mesh.arrays() };
  }, [rooms, info, wallMode]);

  return (
    <>
      {rooms.map((r) => (
        <RoomSlab
          key={r.id}
          room={r}
          base={info.roomBase(r)}
          selected={r.id === selectedRoomId}
          onClick={onRoomClick ? (e) => onRoomClick(r, e) : undefined}
        />
      ))}
      {rooms
        .filter((r) => ROOM_KINDS[r.kind].roof && wallMode !== 'cut')
        .map((r) => (
          <CanopyRoof key={`roof${r.id}`} room={r} base={info.roomBase(r)} />
        ))}
      <Walls segs={parts.walls} mode={wallMode} />
      <Instances name="posts" matrices={parts.posts.m} colors={parts.posts.c} castShadow />
      <Instances
        name="fence-mesh"
        matrices={parts.mesh.m}
        colors={parts.mesh.c}
        opacity={0.28}
        depthWrite={false}
        flat
      />
    </>
  );
}

// ---------- Зоны: окраска пола, разметочная лента, предел высоты ----------

function ZonePaint({
  zone,
  base,
  selected,
  onClick,
}: {
  zone: Zone;
  base: number;
  selected: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geo = useMemo(() => new THREE.ShapeGeometry(planShape(zone.points)), [zone.points]);
  return (
    <mesh
      geometry={geo}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, base + 0.035, 0]}
      onClick={onClick}
      receiveShadow
    >
      <meshToonMaterial
        color={zone.color}
        gradientMap={toonGradient()}
        transparent
        opacity={selected ? 0.42 : 0.2}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

/** Плоскость предельной высоты размещения зоны. */
export function ZoneLimit({ zone, base }: { zone: Zone; base: number }) {
  const { plane, outline } = useMemo(
    () => ({
      plane: new THREE.ShapeGeometry(planShape(zone.points)),
      outline: outlineGeometry(zone.points, 0, zone.height, true),
    }),
    [zone.points, zone.height],
  );
  return (
    <group position={[0, base, 0]}>
      <mesh geometry={plane} rotation={[-Math.PI / 2, 0, 0]} position={[0, zone.height, 0]} raycast={noRaycast}>
        <meshBasicMaterial color="#ef4444" transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={outline} raycast={noRaycast}>
        <lineBasicMaterial color="#ef4444" transparent opacity={0.65} />
      </lineSegments>
    </group>
  );
}

export function ZonesLayer({
  info,
  selectedZoneId,
  onZoneClick,
}: {
  info: SceneInfo;
  selectedZoneId?: string;
  onZoneClick?: (zone: Zone, e: ThreeEvent<MouseEvent>) => void;
}) {
  const zones = useMemo(() => info.w.zones.filter((z) => info.roomVisible(info.zoneRoom(z))), [info]);
  const tape = useMemo(() => {
    const b = new Batch();
    for (const z of zones) {
      const base = info.roomBase(info.zoneRoom(z)) + 0.045;
      const hazard = z.hazard || z.type === 'hazard';
      for (const [a, c] of edges(z.points)) {
        const s = segment(a, c);
        const m = segBase(s.cx, base, s.cz, s.rot);
        if (hazard) {
          // Сигнальная лента: красно-белые полосы
          const n = Math.max(1, Math.round(s.len / 0.5));
          const d = s.len / n;
          for (let i = 0; i < n; i++)
            b.add(i % 2 ? '#ffffff' : '#e5484d', -s.len / 2 + (i + 0.5) * d, 0, 0, d, 0.012, 0.12, m);
        } else b.add(shade(z.color, -0.1), 0, 0, 0, s.len, 0.012, 0.1, m);
      }
    }
    return b.arrays();
  }, [zones, info]);
  return (
    <>
      {zones.map((z) => (
        <ZonePaint
          key={z.id}
          zone={z}
          base={info.roomBase(info.zoneRoom(z))}
          selected={z.id === selectedZoneId}
          onClick={onZoneClick ? (e) => onZoneClick(z, e) : undefined}
        />
      ))}
      <Instances name="zone-tape" matrices={tape.m} colors={tape.c} flat />
    </>
  );
}
