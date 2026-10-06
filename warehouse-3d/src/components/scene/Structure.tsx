import { useMemo } from 'react';
import * as THREE from 'three';
import { type ThreeEvent } from '@react-three/fiber';
import type { Pt, Room, Zone } from '../../types';
import { useStore } from '../../store';

/** Shape в координатах, которые после поворота -90° по X совпадают с планом (x, y) → 3D (x, z). */
export function planShape(points: Pt[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.y) : shape.lineTo(p.x, -p.y)));
  shape.closePath();
  return shape;
}

const noRaycast = () => null;

function outlineGeometry(points: Pt[], y0: number, y1: number, verticals = true): THREE.BufferGeometry {
  const v: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    v.push(a.x, y0, a.y, b.x, y0, b.y);
    v.push(a.x, y1, a.y, b.x, y1, b.y);
    if (verticals) v.push(a.x, y0, a.y, a.x, y1, a.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

export function RoomMesh({ room, selected, showWalls }: { room: Room; selected: boolean; showWalls: boolean }) {
  const select = useStore((s) => s.select);
  const step = useStore((s) => s.step);
  const { floor, walls, outline } = useMemo(() => {
    const floor = new THREE.ShapeGeometry(planShape(room.points));
    const n = room.points.length;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = room.points[i];
      const b = room.points[(i + 1) % n];
      const k = pos.length / 3;
      pos.push(a.x, 0, a.y, b.x, 0, b.y, b.x, room.height, b.y, a.x, room.height, a.y);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const walls = new THREE.BufferGeometry();
    walls.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    walls.setIndex(idx);
    walls.computeVertexNormals();
    return { floor, walls, outline: outlineGeometry(room.points, 0, room.height) };
  }, [room.points, room.height]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (step !== 'rooms' && step !== 'objects') return;
    e.stopPropagation();
    select({ kind: 'room', id: room.id });
  };

  return (
    <group position={[0, room.elevation, 0]}>
      <mesh geometry={floor} rotation={[-Math.PI / 2, 0, 0]} onClick={onClick} receiveShadow>
        <meshStandardMaterial
          color={selected ? '#93c5fd' : '#e7e5e4'}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {showWalls && (
        <mesh geometry={walls} raycast={noRaycast}>
          <meshStandardMaterial
            color={room.color}
            transparent
            opacity={selected ? 0.22 : 0.1}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <lineSegments geometry={outline} raycast={noRaycast}>
        <lineBasicMaterial color={selected ? '#2563eb' : room.color} />
      </lineSegments>
    </group>
  );
}

export function ZoneMesh({
  zone,
  elevation,
  selected,
  showVolume,
}: {
  zone: Zone;
  elevation: number;
  selected: boolean;
  showVolume: boolean;
}) {
  const select = useStore((s) => s.select);
  const step = useStore((s) => s.step);
  const { floor, volume, outline } = useMemo(() => {
    const shape = planShape(zone.points);
    return {
      floor: new THREE.ShapeGeometry(shape),
      volume: new THREE.ExtrudeGeometry(shape, { depth: zone.height, bevelEnabled: false }),
      outline: outlineGeometry(zone.points, 0.03, zone.height, true),
    };
  }, [zone.points, zone.height]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (step !== 'zones') return;
    e.stopPropagation();
    select({ kind: 'zone', id: zone.id });
  };

  return (
    <group position={[0, elevation, 0]}>
      <mesh geometry={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} onClick={onClick}>
        <meshStandardMaterial
          color={zone.color}
          transparent
          opacity={selected ? 0.55 : 0.32}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      {showVolume && (
        <>
          <mesh geometry={volume} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <meshStandardMaterial
              color={zone.color}
              transparent
              opacity={selected ? 0.16 : 0.06}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments geometry={outline} raycast={noRaycast}>
            <lineBasicMaterial color={zone.color} transparent opacity={0.8} />
          </lineSegments>
        </>
      )}
    </group>
  );
}
