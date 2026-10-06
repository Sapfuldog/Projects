import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Equipment, Warehouse } from '../../types';
import { pointInPolygon } from '../../lib/geometry';
import { useStore } from '../../store';

type V3 = [number, number, number];

function Box({
  p,
  s,
  color,
  opacity = 1,
  metal = 0.1,
  rough = 0.7,
}: {
  p: V3;
  s: V3;
  color: string;
  opacity?: number;
  metal?: number;
  rough?: number;
}) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        metalness={metal}
        roughness={rough}
        depthWrite={opacity >= 1}
      />
    </mesh>
  );
}

function Wheel({ p, r, w }: { p: V3; r: number; w: number }) {
  return (
    <mesh position={p} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r, w, 16]} />
      <meshStandardMaterial color="#1f2937" roughness={0.9} />
    </mesh>
  );
}

function Forklift({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  const bodyL = L * 0.62;
  const x0 = -L / 2;
  return (
    <group>
      {/* корпус и противовес */}
      <Box p={[x0 + bodyL / 2, 0.55, 0]} s={[bodyL, 0.7, W]} color={color} metal={0.3} rough={0.5} />
      <Box p={[x0 + 0.18, 0.75, 0]} s={[0.36, 0.9, W * 0.95]} color="#374151" />
      {/* защитная крыша */}
      {[
        [x0 + 0.35, -W / 2 + 0.06],
        [x0 + 0.35, W / 2 - 0.06],
        [x0 + bodyL - 0.1, -W / 2 + 0.06],
        [x0 + bodyL - 0.1, W / 2 - 0.06],
      ].map(([x, z], i) => (
        <Box key={i} p={[x, 1.45, z]} s={[0.06, 1.3, 0.06]} color="#111827" />
      ))}
      <Box p={[x0 + bodyL / 2 + 0.12, 2.1, 0]} s={[bodyL - 0.3, 0.06, W]} color="#111827" />
      <Box p={[x0 + bodyL / 2 + 0.05, 1.0, 0]} s={[0.4, 0.35, 0.45]} color="#1f2937" />
      {/* мачта и вилы */}
      <Box p={[x0 + bodyL + 0.05, H / 2, -W * 0.3]} s={[0.1, H, 0.1]} color="#4b5563" metal={0.6} />
      <Box p={[x0 + bodyL + 0.05, H / 2, W * 0.3]} s={[0.1, H, 0.1]} color="#4b5563" metal={0.6} />
      <Box p={[x0 + bodyL + 0.12, 0.5, 0]} s={[0.08, 0.6, W * 0.75]} color="#4b5563" />
      <Box p={[x0 + bodyL + 0.6, 0.18, -W * 0.22]} s={[1.0, 0.05, 0.12]} color="#6b7280" metal={0.7} />
      <Box p={[x0 + bodyL + 0.6, 0.18, W * 0.22]} s={[1.0, 0.05, 0.12]} color="#6b7280" metal={0.7} />
      {/* груз на вилах */}
      {e.active && (
        <>
          <Box p={[x0 + bodyL + 0.6, 0.27, 0]} s={[1.0, 0.12, 0.9]} color="#a16207" />
          <Box p={[x0 + bodyL + 0.6, 0.68, 0]} s={[0.9, 0.7, 0.85]} color="#d4a373" />
        </>
      )}
      <Wheel p={[x0 + 0.35, 0.25, -W / 2]} r={0.25} w={0.18} />
      <Wheel p={[x0 + 0.35, 0.25, W / 2]} r={0.25} w={0.18} />
      <Wheel p={[x0 + bodyL - 0.25, 0.3, -W / 2]} r={0.3} w={0.22} />
      <Wheel p={[x0 + bodyL - 0.25, 0.3, W / 2]} r={0.3} w={0.22} />
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
      <Box p={[x0 + trailer / 2, 1.3 + (H - 1.3) / 2, 0]} s={[trailer, H - 1.3, W]} color={color} rough={0.5} />
      <Box p={[x0 + trailer / 2, 1.15, 0]} s={[trailer, 0.3, W * 0.9]} color="#374151" />
      <Box p={[x0 + trailer + 0.3 + cab / 2, 1.75, 0]} s={[cab, 2.3, W]} color="#2563eb" metal={0.3} rough={0.4} />
      <Box p={[x0 + trailer + 0.3 + cab - 0.05, 2.2, 0]} s={[0.08, 0.9, W * 0.85]} color="#93c5fd" opacity={0.7} />
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
      <Box p={[0, H - 0.05, -W / 2]} s={[L, 0.12, 0.05]} color="#475569" metal={0.5} />
      <Box p={[0, H - 0.05, W / 2]} s={[L, 0.12, 0.05]} color="#475569" metal={0.5} />
      {Array.from({ length: legs }, (_, i) => -L / 2 + (i * L) / (legs - 1)).map((x, i) => (
        <group key={i}>
          <Box p={[x, (H - 0.1) / 2, -W / 2]} s={[0.06, H - 0.1, 0.06]} color="#334155" />
          <Box p={[x, (H - 0.1) / 2, W / 2]} s={[0.06, H - 0.1, 0.06]} color="#334155" />
        </group>
      ))}
      {Array.from({ length: rollers }, (_, i) => -L / 2 + 0.15 + (i * (L - 0.3)) / (rollers - 1)).map((x, i) => (
        <mesh key={i} position={[x, H - 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, W - 0.06, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {/* коробки на ленте */}
      {[-0.3, 0.1, 0.35].map((k, i) => (
        <Box key={i} p={[k * L, H + 0.18, 0]} s={[0.5, 0.32, 0.45]} color="#d4a373" />
      ))}
    </group>
  );
}

function Dock({ e }: { e: Equipment }) {
  const { length: L, width: W, height: H, color } = e;
  // Длина — вдоль стены, ширина — от стены наружу (локальная ось z)
  return (
    <group>
      <Box p={[0, H / 2, 0]} s={[L, H, W]} color={color} />
      <Box p={[0, H + 0.02, W / 2 - 0.6]} s={[L * 0.7, 0.04, 1.2]} color="#9ca3af" metal={0.6} />
      <Box p={[-L / 2 + 0.25, H - 0.25, W / 2 + 0.05]} s={[0.25, 0.4, 0.12]} color="#111827" />
      <Box p={[L / 2 - 0.25, H - 0.25, W / 2 + 0.05]} s={[0.25, 0.4, 0.12]} color="#111827" />
      {/* жёлто-чёрная разметка края */}
      {Array.from({ length: 6 }, (_, i) => (
        <Box
          key={i}
          p={[-L / 2 + (i + 0.5) * (L / 6), H + 0.03, W / 2 - 0.05]}
          s={[L / 12, 0.02, 0.1]}
          color={i % 2 ? '#111827' : '#facc15'}
        />
      ))}
      <mesh position={[0, H + 0.3, W / 2 + 0.4]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial
          color={e.active ? '#22c55e' : '#ef4444'}
          emissive={e.active ? '#22c55e' : '#ef4444'}
          emissiveIntensity={0.8}
        />
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
          <Box key={i} p={[0, (i + 0.5) * (H / 5), 0]} s={[L, H / 5 - 0.03, W * 0.5]} color={e.color} metal={0.4} />
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
      <Box p={[L * 0.35, H * 0.48, W / 2 + 0.02]} s={[0.12, 0.04, 0.04]} color="#e5e7eb" metal={0.8} />
      <Box p={[0, H + 0.08, 0]} s={[L + 0.2, 0.16, W + 0.04]} color="#334155" />
    </group>
  );
}

function RoomBox({ e, glass }: { e: Equipment; glass: boolean }) {
  const { length: L, width: W, height: H, color } = e;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), [L, W, H]);
  return (
    <group>
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[L, H, W]} />
        <meshStandardMaterial color={color} transparent opacity={glass ? 0.28 : 0.85} depthWrite={!glass} />
      </mesh>
      <lineSegments geometry={edges} position={[0, H / 2, 0]}>
        <lineBasicMaterial color={color} />
      </lineSegments>
      {glass && (
        <>
          {/* столы и стулья офиса */}
          <Box p={[-L / 4, 0.38, 0]} s={[1.4, 0.05, 0.7]} color="#e2e8f0" />
          <Box p={[L / 4, 0.38, 0]} s={[1.4, 0.05, 0.7]} color="#e2e8f0" />
          <Box p={[-L / 4, 0.55, -0.15]} s={[0.5, 0.3, 0.04]} color="#0f172a" />
          <Box p={[L / 4, 0.55, -0.15]} s={[0.5, 0.3, 0.04]} color="#0f172a" />
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
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {Array.from({ length: tables }, (_, i) => -L / 2 + (i + 0.5) * (L / tables)).map((x, i) => (
        <group key={i}>
          <Box p={[x, H, 0]} s={[Math.min(1.8, L / tables - 0.3), 0.05, 0.8]} color="#e5e7eb" />
          <Box p={[x, H / 2, 0]} s={[0.08, H, 0.6]} color="#64748b" />
          <Box p={[x - 0.3, H + 0.18, 0]} s={[0.4, 0.3, 0.35]} color="#d4a373" />
        </group>
      ))}
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
    case 'partition':
      return <Box p={[0, e.height / 2, 0]} s={[e.length, e.height, e.width]} color={e.color} opacity={0.55} />;
    default:
      return <Box p={[0, e.height / 2, 0]} s={[e.length, e.height, e.width]} color={e.color} rough={0.9} />;
  }
}

/** Погрузчики в работе ездят вперёд-назад по проходу. */
const TRAVEL = 7;

function EquipmentItem({ e, elevation, selected }: { e: Equipment; elevation: number; selected: boolean }) {
  const select = useStore((s) => s.select);
  const ref = useRef<THREE.Group>(null);
  const phase = useMemo(() => (e.id.charCodeAt(e.id.length - 1) % 10) / 3, [e.id]);
  const a = (-e.rotation * Math.PI) / 180;
  useFrame(({ clock }) => {
    if (!ref.current || e.type !== 'forklift' || !e.active) return;
    const s = Math.sin(clock.elapsedTime * 0.25 + phase) * TRAVEL;
    ref.current.position.set(e.x + Math.cos(a) * s, elevation, e.y - Math.sin(a) * s);
  });
  const onClick = (ev: ThreeEvent<MouseEvent>) => {
    ev.stopPropagation();
    select({ kind: 'equipment', id: e.id });
  };
  return (
    <group ref={ref} position={[e.x, elevation, e.y]} rotation={[0, a, 0]} onClick={onClick}>
      <EquipmentBody e={e} />
      {selected && (
        <mesh position={[0, e.height / 2, 0]} raycast={() => null}>
          <boxGeometry args={[e.length + 0.2, e.height + 0.2, e.width + 0.2]} />
          <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh>
      )}
    </group>
  );
}

export function EquipmentLayer({ w, selectedId }: { w: Warehouse; selectedId?: string }) {
  return (
    <>
      {w.equipment.map((e) => {
        const room = w.rooms.find((r) => pointInPolygon(e, r.points));
        return <EquipmentItem key={e.id} e={e} elevation={room?.elevation ?? 0} selected={e.id === selectedId} />;
      })}
    </>
  );
}
