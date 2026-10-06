import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Equipment } from '../../types';
import { noRaycast, toonGradient, type SceneInfo } from './common';
import { shade } from '../../lib/colors';

type V3 = [number, number, number];

function Toon({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <meshToonMaterial
      color={color}
      gradientMap={toonGradient()}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={opacity >= 1}
    />
  );
}

function Box({
  p,
  s,
  color,
  opacity = 1,
  shadow = true,
}: {
  p: V3;
  s: V3;
  color: string;
  opacity?: number;
  shadow?: boolean;
}) {
  return (
    <mesh position={p} castShadow={shadow && opacity >= 1} receiveShadow>
      <boxGeometry args={s} />
      <Toon color={color} opacity={opacity} />
    </mesh>
  );
}

function Cyl({ p, r, h, color, rot }: { p: V3; r: number; h: number; color: string; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow>
      <cylinderGeometry args={[r, r, h, 16]} />
      <Toon color={color} />
    </mesh>
  );
}

function Wheel({ p, r, w }: { p: V3; r: number; w: number }) {
  return <Cyl p={p} r={r} h={w} color="#1f2937" rot={[Math.PI / 2, 0, 0]} />;
}

function Forklift({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  const bodyL = L * 0.62;
  const x0 = -L / 2;
  return (
    <group>
      <Box p={[x0 + bodyL / 2, 0.55, 0]} s={[bodyL, 0.7, W]} color={color} />
      <Box p={[x0 + 0.18, 0.75, 0]} s={[0.36, 0.9, W * 0.95]} color="#374151" />
      {[
        [x0 + 0.35, -W / 2 + 0.06],
        [x0 + 0.35, W / 2 - 0.06],
        [x0 + bodyL - 0.1, -W / 2 + 0.06],
        [x0 + bodyL - 0.1, W / 2 - 0.06],
      ].map(([x, z], i) => (
        <Box key={i} p={[x, 1.45, z]} s={[0.07, 1.3, 0.07]} color="#111827" />
      ))}
      <Box p={[x0 + bodyL / 2 + 0.12, 2.1, 0]} s={[bodyL - 0.3, 0.07, W]} color={shade(color, -0.25)} />
      <Box p={[x0 + bodyL / 2 + 0.05, 1.0, 0]} s={[0.4, 0.35, 0.45]} color="#1f2937" />
      <Box p={[x0 + bodyL + 0.05, H / 2, -W * 0.3]} s={[0.1, H, 0.1]} color="#4b5563" />
      <Box p={[x0 + bodyL + 0.05, H / 2, W * 0.3]} s={[0.1, H, 0.1]} color="#4b5563" />
      <Box p={[x0 + bodyL + 0.12, 0.5, 0]} s={[0.08, 0.6, W * 0.75]} color="#4b5563" />
      <Box p={[x0 + bodyL + 0.6, 0.18, -W * 0.22]} s={[1.0, 0.05, 0.12]} color="#6b7280" />
      <Box p={[x0 + bodyL + 0.6, 0.18, W * 0.22]} s={[1.0, 0.05, 0.12]} color="#6b7280" />
      {e.active && (
        <>
          <Box p={[x0 + bodyL + 0.6, 0.27, 0]} s={[1.0, 0.12, 0.9]} color="#c79a5b" />
          <Box p={[x0 + bodyL + 0.6, 0.68, 0]} s={[0.9, 0.7, 0.85]} color="#d5aa6d" />
        </>
      )}
      <Wheel p={[x0 + 0.35, 0.25, -W / 2]} r={0.25} w={0.18} />
      <Wheel p={[x0 + 0.35, 0.25, W / 2]} r={0.25} w={0.18} />
      <Wheel p={[x0 + bodyL - 0.25, 0.3, -W / 2]} r={0.3} w={0.22} />
      <Wheel p={[x0 + bodyL - 0.25, 0.3, W / 2]} r={0.3} w={0.22} />
      <mesh position={[x0 + bodyL / 2, 2.2, 0]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshBasicMaterial color={e.active ? '#fb923c' : '#64748b'} />
      </mesh>
    </group>
  );
}

function Truck({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  const cab = 2.4;
  const trailer = L - cab - 0.3;
  const x0 = -L / 2;
  return (
    <group>
      <Box p={[x0 + trailer / 2, 1.3 + (H - 1.3) / 2, 0]} s={[trailer, H - 1.3, W]} color={color} />
      <Box p={[x0 + trailer / 2, 1.15, 0]} s={[trailer, 0.3, W * 0.9]} color="#374151" />
      <Box p={[x0 + trailer / 2, H - 0.1, 0]} s={[trailer + 0.05, 0.2, W + 0.05]} color={shade(color, -0.1)} />
      <Box p={[x0 + trailer + 0.3 + cab / 2, 1.75, 0]} s={[cab, 2.3, W]} color="#2f6fd0" />
      <Box p={[x0 + trailer + 0.3 + cab - 0.05, 2.25, 0]} s={[0.08, 0.9, W * 0.85]} color="#bfdbfe" />
      {[1.2, 2.6, trailer - 1.5].map((x, i) => (
        <group key={i}>
          <Wheel p={[x0 + x, 0.5, -W / 2 + 0.15]} r={0.5} w={0.3} />
          <Wheel p={[x0 + x, 0.5, W / 2 - 0.15]} r={0.5} w={0.3} />
        </group>
      ))}
      <Wheel p={[x0 + trailer + 0.3 + cab - 0.7, 0.5, -W / 2 + 0.15]} r={0.5} w={0.3} />
      <Wheel p={[x0 + trailer + 0.3 + cab - 0.7, 0.5, W / 2 - 0.15]} r={0.5} w={0.3} />
    </group>
  );
}

function Conveyor({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H } = e;
  const rollers = Math.max(2, Math.floor(L / 0.3));
  const legs = Math.max(2, Math.ceil(L / 2) + 1);
  return (
    <group>
      <Box p={[0, H - 0.05, -W / 2]} s={[L, 0.12, 0.05]} color="#475569" />
      <Box p={[0, H - 0.05, W / 2]} s={[L, 0.12, 0.05]} color="#475569" />
      {Array.from({ length: legs }, (_, i) => -L / 2 + (i * L) / (legs - 1)).map((x, i) => (
        <group key={i}>
          <Box p={[x, (H - 0.1) / 2, -W / 2]} s={[0.06, H - 0.1, 0.06]} color="#334155" />
          <Box p={[x, (H - 0.1) / 2, W / 2]} s={[0.06, H - 0.1, 0.06]} color="#334155" />
        </group>
      ))}
      {Array.from({ length: rollers }, (_, i) => -L / 2 + 0.15 + (i * (L - 0.3)) / (rollers - 1)).map((x, i) => (
        <Cyl key={i} p={[x, H - 0.04, 0]} r={0.04} h={W - 0.06} color="#cbd5e1" rot={[Math.PI / 2, 0, 0]} />
      ))}
      {[-0.3, 0.1, 0.35].map((k, i) => (
        <Box key={i} p={[k * L, H + 0.18, 0]} s={[0.5, 0.32, 0.45]} color="#d5aa6d" />
      ))}
    </group>
  );
}

function Dock({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  return (
    <group>
      <Box p={[0, H / 2, 0]} s={[L, H, W]} color={color} />
      <Box p={[0, H + 0.02, W / 2 - 0.6]} s={[L * 0.7, 0.04, 1.2]} color="#9ca3af" />
      <Box p={[-L / 2 + 0.25, H - 0.25, W / 2 + 0.05]} s={[0.25, 0.4, 0.12]} color="#111827" />
      <Box p={[L / 2 - 0.25, H - 0.25, W / 2 + 0.05]} s={[0.25, 0.4, 0.12]} color="#111827" />
      {Array.from({ length: 6 }, (_, i) => (
        <Box
          key={i}
          p={[-L / 2 + (i + 0.5) * (L / 6), H + 0.03, W / 2 - 0.05]}
          s={[L / 12, 0.02, 0.1]}
          color={i % 2 ? '#111827' : '#facc15'}
          shadow={false}
        />
      ))}
      <mesh position={[0, H + 0.3, W / 2 + 0.4]}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshBasicMaterial color={e.active ? '#22c55e' : '#ef4444'} />
      </mesh>
    </group>
  );
}

function Gate({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H } = e;
  const open = !!e.active;
  return (
    <group>
      <Box p={[-L / 2 - 0.1, H / 2, 0]} s={[0.2, H, W + 0.1]} color="#64748b" />
      <Box p={[L / 2 + 0.1, H / 2, 0]} s={[0.2, H, W + 0.1]} color="#64748b" />
      <Box p={[0, H + 0.2, 0]} s={[L + 0.4, 0.4, W + 0.1]} color="#64748b" />
      {open ? (
        <Box p={[0, H - 0.15, 0]} s={[L, 0.3, W * 0.6]} color={e.color} />
      ) : (
        Array.from({ length: 5 }, (_, i) => (
          <Box key={i} p={[0, (i + 0.5) * (H / 5), 0]} s={[L, H / 5 - 0.03, W * 0.5]} color={e.color} />
        ))
      )}
    </group>
  );
}

function Door({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  return (
    <group>
      <Box p={[0, H / 2, 0]} s={[L, H, W]} color={color} />
      <Box p={[L * 0.35, H * 0.48, W / 2 + 0.02]} s={[0.12, 0.04, 0.04]} color="#e5e7eb" />
      <Box p={[0, H + 0.08, 0]} s={[L + 0.2, 0.16, W + 0.04]} color="#334155" />
    </group>
  );
}

function RoomBox({ e, glass }: { e: Equipment; glass: boolean }) {
  const { length: L, width: W, height: H, color } = e;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), [L, W, H]);
  return (
    <group>
      <mesh position={[0, H / 2, 0]} castShadow={!glass}>
        <boxGeometry args={[L, H, W]} />
        <Toon color={color} opacity={glass ? 0.3 : 0.92} />
      </mesh>
      <lineSegments geometry={edges} position={[0, H / 2, 0]} raycast={noRaycast}>
        <lineBasicMaterial color={shade(color, -0.3)} />
      </lineSegments>
      {glass && (
        <>
          <Box p={[-L / 4, 0.75, 0]} s={[1.4, 0.05, 0.7]} color="#e2e8f0" />
          <Box p={[L / 4, 0.75, 0]} s={[1.4, 0.05, 0.7]} color="#e2e8f0" />
          <Box p={[-L / 4, 1.0, -0.15]} s={[0.5, 0.32, 0.04]} color="#0f172a" />
          <Box p={[L / 4, 1.0, -0.15]} s={[0.5, 0.32, 0.04]} color="#0f172a" />
          <Box p={[-L / 4, 0.45, 0.55]} s={[0.45, 0.45, 0.45]} color="#475569" />
          <Box p={[L / 4, 0.45, 0.55]} s={[0.45, 0.45, 0.45]} color="#475569" />
        </>
      )}
    </group>
  );
}

function WorkZone({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  const tables = Math.max(1, Math.floor(L / 2));
  return (
    <group>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[L, W]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {Array.from({ length: tables }, (_, i) => -L / 2 + (i + 0.5) * (L / tables)).map((x, i) => (
        <group key={i}>
          <Box p={[x, H, 0]} s={[Math.min(1.8, L / tables - 0.3), 0.05, 0.8]} color="#e5e7eb" />
          <Box p={[x, H / 2, 0]} s={[0.08, H, 0.6]} color="#64748b" />
          <Box p={[x - 0.3, H + 0.18, 0]} s={[0.4, 0.3, 0.35]} color="#d5aa6d" />
        </group>
      ))}
    </group>
  );
}

/** Окно выдачи на кладовые: стойка, столешница, остекление, табло. */
function Counter({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  return (
    <group>
      <Box p={[0, H / 2, 0]} s={[L, H, W * 0.6]} color={color} />
      <Box p={[0, H + 0.03, 0]} s={[L + 0.1, 0.06, W + 0.1]} color="#e2e8f0" />
      <Box p={[0, H + 0.75, -W * 0.15]} s={[L, 1.4, 0.04]} color="#bae6fd" opacity={0.45} />
      <Box p={[0, H + 1.55, -W * 0.15]} s={[L * 0.6, 0.3, 0.08]} color="#0f172a" />
      <mesh position={[L * 0.25, H + 1.55, -W * 0.15 - 0.05]}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshBasicMaterial color={e.active ? '#22c55e' : '#ef4444'} />
      </mesh>
    </group>
  );
}

/** «Мультяшный» человечек в каске и жилете. */
function Worker({ e }: { e: Equipment }) {
  const ref = useRef<THREE.Group>(null);
  const phase = useMemo(() => (e.id.charCodeAt(e.id.length - 1) % 10) / 2, [e.id]);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 2 + phase)) * 0.04;
  });
  const vest = e.color;
  return (
    <group ref={ref}>
      <Box p={[0, 0.42, -0.09]} s={[0.15, 0.84, 0.15]} color="#334155" />
      <Box p={[0, 0.42, 0.09]} s={[0.15, 0.84, 0.15]} color="#334155" />
      <mesh position={[0, 1.15, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.42, 6, 12]} />
        <Toon color={vest} />
      </mesh>
      <Box p={[0, 1.18, 0]} s={[0.42, 0.06, 0.42]} color="#fde68a" shadow={false} />
      <mesh position={[0, 1.63, 0]} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <Toon color="#f2c7a5" />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Toon color={vest === '#2563eb' ? '#f8fafc' : '#facc15'} />
      </mesh>
    </group>
  );
}

function Tree({ e }: { e: Equipment }) {
  const H = e.height;
  const R = e.length / 2;
  return (
    <group>
      <Cyl p={[0, H * 0.22, 0]} r={0.14} h={H * 0.44} color="#8b5a2b" />
      <mesh position={[0, H * 0.58, 0]} castShadow>
        <icosahedronGeometry args={[R, 1]} />
        <Toon color={e.color} />
      </mesh>
      <mesh position={[R * 0.35, H * 0.8, R * 0.2]} castShadow>
        <icosahedronGeometry args={[R * 0.6, 1]} />
        <Toon color={shade(e.color, 0.15)} />
      </mesh>
    </group>
  );
}

function EquipmentBody({ e }: { e: Equipment }) {
  switch (e.type) {
    case 'forklift':
      return <Forklift e={e} />;
    case 'truck':
      return <Truck e={e} />;
    case 'conveyor':
      return <Conveyor e={e} />;
    case 'dock':
      return <Dock e={e} />;
    case 'gate':
      return <Gate e={e} />;
    case 'door':
      return <Door e={e} />;
    case 'office':
      return <RoomBox e={e} glass />;
    case 'toilet':
      return <RoomBox e={e} glass={false} />;
    case 'workzone':
      return <WorkZone e={e} />;
    case 'counter':
      return <Counter e={e} />;
    case 'worker':
      return <Worker e={e} />;
    case 'tree':
      return <Tree e={e} />;
    case 'partition':
      return <Box p={[0, e.height / 2, 0]} s={[e.length, e.height, e.width]} color={e.color} opacity={0.6} />;
    default:
      return <Box p={[0, e.height / 2, 0]} s={[e.length, e.height, e.width]} color={e.color} />;
  }
}

/** Погрузчики в работе ездят вперёд-назад по проходу. */
const TRAVEL = 6;

function EquipmentItem({
  e,
  elevation,
  selected,
  onPick,
}: {
  e: Equipment;
  elevation: number;
  selected: boolean;
  onPick?: (e: Equipment, ev: ThreeEvent<MouseEvent>) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const phase = useMemo(() => (e.id.charCodeAt(e.id.length - 1) % 10) / 3, [e.id]);
  const a = (-e.rotation * Math.PI) / 180;
  useFrame(({ clock }) => {
    if (!ref.current || e.type !== 'forklift' || !e.active) return;
    const s = Math.sin(clock.elapsedTime * 0.22 + phase) * TRAVEL;
    ref.current.position.set(e.x + Math.cos(a) * s, elevation, e.y - Math.sin(a) * s);
  });
  return (
    <group
      ref={ref}
      position={[e.x, elevation, e.y]}
      rotation={[0, a, 0]}
      onClick={
        onPick
          ? (ev) => {
              ev.stopPropagation();
              onPick(e, ev);
            }
          : undefined
      }
    >
      <EquipmentBody e={e} />
      {selected && (
        <mesh position={[0, e.height / 2, 0]} raycast={noRaycast}>
          <boxGeometry args={[e.length + 0.2, e.height + 0.2, e.width + 0.2]} />
          <meshBasicMaterial color="#0ea5e9" wireframe />
        </mesh>
      )}
    </group>
  );
}

export function EquipmentLayer({
  info,
  selectedId,
  people,
  onPick,
}: {
  info: SceneInfo;
  selectedId?: string;
  people: boolean;
  onPick?: (e: Equipment, ev: ThreeEvent<MouseEvent>) => void;
}) {
  const first = info.floors[0]?.id;
  return (
    <>
      {info.w.equipment.map((e) => {
        if (!people && (e.type === 'worker' || e.type === 'tree')) return null;
        const room = info.equipmentRoom(e);
        const floorId = room?.floorId ?? e.floorId ?? first;
        const visible = room ? info.roomVisible(room) : info.roomVisible({ floorId } as never);
        if (!visible) return null;
        const floor = info.floors.find((f) => f.id === floorId);
        const elevation = room ? info.roomBase(room) : (floor?.elevation ?? 0) + info.lift(floorId);
        return <EquipmentItem key={e.id} e={e} elevation={elevation} selected={e.id === selectedId} onPick={onPick} />;
      })}
    </>
  );
}
