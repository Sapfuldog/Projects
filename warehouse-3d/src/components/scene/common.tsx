import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Equipment, Floor, Room, Warehouse, Zone } from '../../types';
import { pointInPolygon } from '../../lib/geometry';

// Общие инструменты сцены: «мультяшные» материалы, инстансинг, положение этажей.

let gradient: THREE.DataTexture | null = null;

/** Ступенчатая градиентная карта для toon-освещения (4 тона). */
export function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([120, 175, 225, 255]), 4, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

export const noRaycast = () => null;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
export const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);

/** Буфер экземпляров: матрицы, цвета и «владелец» каждого экземпляра (индекс ячейки, id стеллажа…). */
export class Batch<T = number> {
  m: number[] = [];
  c: number[] = [];
  owner: T[] = [];
  /** Добавить экземпляр: центр, размеры, поворот вокруг вертикали, база (мировая матрица родителя). */
  add(
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    base?: THREE.Matrix4,
    owner?: T,
    axis: 'y' | 'x' | 'z' = 'y',
  ) {
    tmpQ.identity();
    if (axis === 'x') tmpQ.setFromAxisAngle(Z, Math.PI / 2);
    else if (axis === 'z') tmpQ.setFromAxisAngle(X, Math.PI / 2);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
    if (base) tmpM.premultiply(base);
    for (let i = 0; i < 16; i++) this.m.push(tmpM.elements[i]);
    tmpC.set(color);
    this.c.push(tmpC.r, tmpC.g, tmpC.b);
    if (owner !== undefined) this.owner.push(owner);
  }
  get count() {
    return this.c.length / 3;
  }
  arrays() {
    return { m: new Float32Array(this.m), c: new Float32Array(this.c) };
  }
}

/** Матрица «основания»: перенос и поворот вокруг вертикали (рад). */
export function baseMatrix(x: number, y: number, z: number, rotY: number, out = new THREE.Matrix4()) {
  tmpQ2.setFromAxisAngle(UP, rotY);
  return out.compose(new THREE.Vector3(x, y, z), tmpQ2, new THREE.Vector3(1, 1, 1));
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
const SPH = new THREE.IcosahedronGeometry(0.5, 1);

export interface InstancesProps {
  name?: string;
  shape?: 'box' | 'cyl' | 'sphere';
  matrices: Float32Array;
  colors: Float32Array;
  opacity?: number;
  depthWrite?: boolean;
  /** Плоский (без освещения) материал — для разметки и подсветки */
  flat?: boolean;
  emissive?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Вернуть false, чтобы пропустить событие дальше (к объекту позади) */
  onPick?: (index: number, e: ThreeEvent<MouseEvent>) => boolean | void;
  onHover?: (index: number | null, e?: ThreeEvent<PointerEvent>) => void;
}

/** Набор одинаковых фигур одним draw call — тысячи ячеек и грузов без потери FPS. */
export function Instances({
  name,
  shape = 'box',
  matrices,
  colors,
  opacity = 1,
  depthWrite = true,
  flat = false,
  emissive = 0,
  castShadow = false,
  receiveShadow = false,
  onPick,
  onHover,
}: InstancesProps) {
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
  const geometry = shape === 'cyl' ? CYL : shape === 'sphere' ? SPH : BOX;
  if (!count) return null;
  const transparent = opacity < 1;
  return (
    <instancedMesh
      key={`${count}-${shape}`}
      name={name}
      ref={ref}
      args={[geometry, undefined, count]}
      dispose={null}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
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
              onHover(e.instanceId ?? null, e);
            }
          : undefined
      }
      onPointerOut={onHover ? () => onHover(null) : undefined}
      {...(onPick || onHover ? {} : { raycast: noRaycast })}
    >
      {flat ? (
        <meshBasicMaterial transparent={transparent} opacity={opacity} depthWrite={depthWrite} toneMapped={false} />
      ) : (
        <meshToonMaterial
          gradientMap={toonGradient()}
          transparent={transparent}
          opacity={opacity}
          depthWrite={depthWrite}
          emissive={emissive ? '#ffffff' : '#000000'}
          emissiveIntensity={emissive}
        />
      )}
    </instancedMesh>
  );
}

/** Батч → свойства Instances (с мемоизацией по ключу). */
export function useArrays(b: Batch<unknown>) {
  return useMemo(() => b.arrays(), [b]);
}

// ---------- Этажи и видимость ----------

/** Расстояние между этажами в режиме «разнести этажи», м. */
export const EXPLODE_GAP = 9;

export interface SceneInfo {
  w: Warehouse;
  /** Подъём этажа при разнесении, м */
  lift: (floorId?: string) => number;
  /** Отметка пола помещения с учётом разнесения */
  roomBase: (room?: Room) => number;
  roomVisible: (room?: Room) => boolean;
  roomById: Map<string, Room>;
  zoneRoom: (zone?: Zone) => Room | undefined;
  floors: Floor[];
  floorIndex: Map<string, number>;
  /** Помещение и отметка для оборудования */
  equipmentRoom: (e: Equipment) => Room | undefined;
}

export function sceneInfo(w: Warehouse, explode: boolean, floorFilter: string | null): SceneInfo {
  const floors = [...w.floors].sort((a, b) => a.elevation - b.elevation);
  const floorIndex = new Map(floors.map((f, i) => [f.id, i]));
  const roomById = new Map(w.rooms.map((r) => [r.id, r]));
  const lift = (floorId?: string) => (explode && floorId ? (floorIndex.get(floorId) ?? 0) * EXPLODE_GAP : 0);
  const elevationOf = (room?: Room) =>
    room ? (w.floors.find((f) => f.id === room.floorId)?.elevation ?? room.elevation) : 0;
  const roomBase = (room?: Room) => elevationOf(room) + lift(room?.floorId);
  const roomVisible = (room?: Room) => !floorFilter || !room || room.floorId === floorFilter;
  const zoneRoom = (zone?: Zone) => (zone ? roomById.get(zone.roomId) : undefined);
  const equipmentRoom = (e: Equipment) => {
    const rooms = w.rooms.filter((r) => pointInPolygon(e, r.points));
    if (e.floorId) return rooms.find((r) => r.floorId === e.floorId);
    return rooms.sort((a, b) => elevationOf(a) - elevationOf(b))[0];
  };
  return { w, lift, roomBase, roomVisible, roomById, zoneRoom, floors, floorIndex, equipmentRoom };
}
