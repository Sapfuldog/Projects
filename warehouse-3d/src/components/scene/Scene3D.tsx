import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore, useWarehouse } from '../../store';
import { useConsumers, useMonitor, useProductsMap, useTareMap, warehouseBounds } from '../../lib/derived';
import { polygonCentroid, round, bbox } from '../../lib/geometry';
import { rackContext, rackHeight, rackLength, tierBases } from '../../lib/rack';
import { EQUIPMENT } from '../../lib/equipment';
import { CELL_TYPES, fmtQty } from '../../lib/materials';
import { splitKey } from '../../lib/inventory';
import { VIOLATIONS } from '../../lib/control';
import { timeAgo } from '../../lib/analytics';
import { partyLabel, type Monitor } from '../../lib/monitor';
import type { Cell, Product, Warehouse } from '../../types';
import { sceneInfo, type SceneInfo } from './common';
import { Ground, RoomsLayer, ZoneLimit, ZonesLayer } from './Structure';
import { MezzaninesLayer, stairLane } from './Mezzanines';
import { RackFrames } from './Racks';
import { CellsLayer } from './Cells';
import { EquipmentLayer } from './Equipment';
import { LabelProjector, LabelsLayer, useHover, type HoverInfo, type Label3D, type LabelRegistry } from './Labels';
import type { CargoCtx } from './cargo';

const fmtM = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtElev = (v: number) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

/** Подгоняет камеру под объект, выполняет пресеты (изометрия, сверху, спереди) и плавные наведения. */
function CameraRig({ w }: { w: Warehouse }) {
  const three = useThree();
  if (import.meta.env.DEV) (window as unknown as { __three: unknown }).__three = three;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const focus = useStore((s) => s.focus);
  const preset = useStore((s) => s.camera);
  const floorFilter = useStore((s) => s.floorFilter);
  const explode = useStore((s) => s.explode);
  const anim = useRef<{ target: THREE.Vector3; pos: THREE.Vector3; t: number } | null>(null);
  const fittedFor = useRef<string | null>(null);
  // Запросы камеры, сделанные задолго до открытия 3D, не выполняем (иначе камера улетит к старой цели)
  const mountedAt = useRef(Date.now());
  const fresh = (at: number) => at > mountedAt.current - 2500;

  /** Вид на весь объект или на выбранный этаж. */
  const view = useCallback(
    (dir: THREE.Vector3, k = 0.5) => {
      const info = sceneInfo(w, explode, floorFilter);
      const rooms = floorFilter ? w.rooms.filter((r) => r.floorId === floorFilter) : [];
      const b = rooms.length ? bbox(rooms.flatMap((r) => r.points)) : warehouseBounds(w);
      const y = rooms.length ? info.roomBase(rooms[0]) : 0;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minY + b.maxY) / 2;
      const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 12);
      const persp = camera as THREE.PerspectiveCamera;
      const fov = ((persp.fov ?? 40) * Math.PI) / 180;
      const dist = (size * k) / Math.tan(fov / 2) / Math.min(1, persp.aspect || 1);
      return {
        target: new THREE.Vector3(cx, y, cz),
        pos: new THREE.Vector3(cx + dir.x * dist, y + dir.y * dist, cz + dir.z * dist),
      };
    },
    [w, camera, floorFilter, explode],
  );

  // Выбор этажа — камера переходит к нему
  const lastFloor = useRef(floorFilter);
  useEffect(() => {
    if (!controls || lastFloor.current === floorFilter) return;
    lastFloor.current = floorFilter;
    useHover.getState().set(null);
    anim.current = { ...view(new THREE.Vector3(0.5, 0.78, 0.72).normalize(), floorFilter ? 0.62 : 0.5), t: 0 };
  }, [floorFilter, controls, view]);

  useEffect(() => {
    if (!controls || fittedFor.current === w.id) return;
    fittedFor.current = w.id;
    const v = view(new THREE.Vector3(0.5, 0.78, 0.72).normalize());
    controls.target.copy(v.target);
    camera.position.copy(v.pos);
    controls.update();
  }, [controls, camera, w, view]);

  useEffect(() => {
    if (!preset || !controls || !fresh(preset.at)) return;
    const dirs = {
      iso: new THREE.Vector3(1, 0.95, 1).normalize(),
      top: new THREE.Vector3(0, 1, 0.0001),
      front: new THREE.Vector3(0, 0.32, 1).normalize(),
      fit: new THREE.Vector3(0.5, 0.78, 0.72).normalize(),
    };
    useHover.getState().set(null);
    anim.current = { ...view(dirs[preset.preset], preset.preset === 'top' ? 0.5 : 0.55), t: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, controls]);

  useEffect(() => {
    if (!focus || !controls || !fresh(focus.at)) return;
    const target = new THREE.Vector3(focus.x, focus.y, focus.z);
    let pos: THREE.Vector3;
    if (focus.cam) pos = new THREE.Vector3(focus.cam.x, focus.cam.y, focus.cam.z);
    else {
      const dir = camera.position.clone().sub(controls.target);
      dir.y = Math.max(dir.y, dir.length() * 0.55);
      pos = target.clone().add(dir.normalize().multiplyScalar(focus.y > 30 ? 60 : 26));
    }
    useHover.getState().set(null);
    anim.current = { target, pos, t: 0 };
  }, [focus, controls, camera]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt * 1.8);
    const k = 1 - Math.pow(1 - a.t, 3);
    controls.target.lerp(a.target, k);
    camera.position.lerp(a.pos, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

/** Срез по высоте: общая плоскость отсечения для всей сцены. */
function Clipper({ clip }: { clip: number | null }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.clippingPlanes = clip === null ? [] : [new THREE.Plane(new THREE.Vector3(0, -1, 0), clip)];
    return () => void (gl.clippingPlanes = []);
  }, [gl, clip]);
  return null;
}

/** Солнце с тенями, покрывающими весь объект. */
function Sun({ w, dark }: { w: Warehouse; dark: boolean }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const b = warehouseBounds(w);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const r = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.75 + 10;
  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    l.target.position.set(cx, 0, cz);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = r * 4 + 200;
    cam.updateProjectionMatrix();
  }, [cx, cz, r]);
  return (
    <directionalLight
      ref={ref}
      castShadow
      position={[cx + r * 0.6, r * 1.6 + 40, cz + r * 0.45]}
      intensity={dark ? 1.6 : 2.1}
      color="#fff6e8"
      shadow-mapSize={[4096, 4096]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  );
}

/** Невидимый пол для расстановки объектов из палитры конструктора. */
function PlacementPlane({ base }: { base: number }) {
  const placing = useStore((s) => s.placing);
  const snap = useStore((s) => s.snap) || 0.5;
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
  if (!placing) return null;
  const spec = EQUIPMENT[placing];
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, base + 0.06, 0]}
        onPointerMove={(e) => setGhost({ x: round(e.point.x, snap), z: round(e.point.z, snap) })}
        onPointerOut={() => setGhost(null)}
        onClick={(e) => {
          e.stopPropagation();
          useStore.getState().placeEquipment(round(e.point.x, snap), round(e.point.z, snap));
        }}
      >
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {ghost && (
        <mesh position={[ghost.x, base + spec.height / 2, ghost.z]} raycast={() => null}>
          <boxGeometry args={[spec.length, spec.height, spec.width]} />
          <meshBasicMaterial color="#0ea5e9" wireframe />
        </mesh>
      )}
    </>
  );
}

/** Карточка ячейки при наведении. */
function describeCell(
  c: Cell,
  m: Monitor,
  products: Map<string, Product>,
  consumers: Parameters<typeof partyLabel>[1],
): HoverInfo {
  const w = m.w;
  const u = m.usage.get(c.address);
  const rack = w.racks.find((r) => r.id === c.rackId);
  const room = w.rooms.find((r) => r.id === c.roomId);
  const rows: [string, string][] = [];
  if (!c.virtual) rows.push(['Ш×Г×В', `${c.width}×${c.depth}×${c.height} мм`]);
  if (c.places > 0)
    rows.push(['Места', `${Math.min(u?.places ?? 0, 999)} из ${c.places} ${CELL_TYPES[c.cellType].placeUnit}`]);
  if (c.maxLoad > 0)
    rows.push([
      'Нагрузка',
      `${Math.round(u?.weight ?? 0).toLocaleString('ru-RU')} / ${c.maxLoad.toLocaleString('ru-RU')} кг`,
    ]);
  const lm = m.lastMove[c.address];
  if (lm) rows.push(['Движение', timeAgo(lm)]);
  if (c.reservedFor)
    rows.push([
      'Закреплена',
      partyLabel(`@${consumers.find((x) => x.id === c.reservedFor)?.code ?? ''}`, consumers) || c.reservedFor,
    ]);
  const items: HoverInfo['items'] = [];
  for (const [k, q] of Object.entries(u?.items ?? {})) {
    const [pid, bid] = splitKey(k);
    const p = products.get(pid);
    const b = bid ? m.inv?.batches[bid] : undefined;
    const note = b
      ? [
          b.heat && `пл. ${b.heat}`,
          b.expiry && `до ${new Date(b.expiry).toLocaleDateString('ru-RU')}`,
          b.order,
          !b.heat && !b.expiry && !b.order && b.number,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;
    items.push({ name: p?.name ?? pid, qty: fmtQty(q, p?.unit ?? 'шт'), note, color: p?.color });
    if (items.length >= 4) break;
  }
  const extra = Object.keys(u?.items ?? {}).length - items.length;
  if (extra > 0) items.push({ name: `ещё ${extra}…`, qty: '' });
  for (const [tid, n] of Object.entries(u?.tare ?? {}))
    items.push({ name: `Пустая тара: ${tid.replace('t-', '')}`, qty: `${n} шт` });
  const alerts = (m.violationsAt.get(c.address) ?? []).slice(0, 3).map((v) => VIOLATIONS[v.kind].title);
  if (c.blocked) alerts.unshift(`Заблокирована${c.note ? `: ${c.note}` : ''}`);
  return {
    title: c.address,
    sub: c.virtual
      ? (c.note ?? 'Место учёта')
      : `${CELL_TYPES[c.cellType].title} · ${rack?.code ?? ''} · ярус ${c.tier} · ${room?.name ?? ''}`,
    fill: c.virtual ? undefined : (m.fill.get(c.address) ?? 0),
    rows,
    items,
    alerts: [...new Set(alerts)],
  };
}

function useLabels(
  info: SceneInfo | null,
  m: Monitor | undefined,
  mode: 'monitor' | 'build',
  selectedRackId?: string,
): Label3D[] {
  const show = useStore((s) => s.show);
  const step = useStore((s) => s.step);
  return useMemo(() => {
    if (!info || !m) return [];
    const w = info.w;
    const out: Label3D[] = [];
    const st = useStore.getState;
    // Помещения (в мониторинге названия есть на выносках)
    if (show.labels && !(mode === 'monitor' && show.callouts))
      for (const r of w.rooms) {
        if (!info.roomVisible(r)) continue;
        const b = bbox(r.points);
        const base = info.roomBase(r);
        out.push({
          key: `r${r.id}`,
          x: b.minX + 1,
          y: base + 0.3,
          z: b.minY + 1,
          text: `${r.name}${r.temp ? ` · ${r.temp}` : ''}`,
          cls: `room ${r.hazard ? 'hazard' : ''}`,
          icon: r.hazard ? 'alert' : r.kind === 'yard' ? 'metal' : r.kind === 'canopy' ? 'pallet' : 'warehouse',
          color: r.color,
          maxDist: 260,
        });
      }
    // Отметки этажей
    if (show.heights && (w.floors.length > 1 || info.lift(w.floors[0]?.id) > 0)) {
      for (const f of w.floors) {
        const room = w.rooms.find((r) => r.floorId === f.id && r.kind !== 'yard' && info.roomVisible(r));
        if (!room) continue;
        const b = bbox(room.points);
        out.push({
          key: `f${f.id}`,
          x: b.minX,
          y: info.roomBase(room) + 0.1,
          z: b.maxY,
          text: `${fmtElev(f.elevation)} · ${f.name}`,
          cls: 'elev',
          icon: 'floors',
          maxDist: 220,
        });
      }
    }
    // Мезонины: отметки настилов
    if (show.heights)
      for (const mz of w.mezzanines) {
        const zone = w.zones.find((z) => z.id === mz.zoneId);
        const room = info.zoneRoom(zone);
        if (!info.roomVisible(room)) continue;
        const base = info.roomBase(room);
        const a = (mz.rotation * Math.PI) / 180;
        for (let k = 1; k <= mz.levels; k++) {
          const lane = stairLane(mz, k);
          const lx = lane.u1 + 0.4;
          const lz = mz.width / 2;
          out.push({
            key: `mz${mz.id}${k}`,
            x: mz.x + lx * Math.cos(a) - lz * Math.sin(a),
            y: base + k * mz.levelHeight + 0.5,
            z: mz.y + lx * Math.sin(a) + lz * Math.cos(a),
            text: `${fmtElev(k * mz.levelHeight)} · уровень ${k + 1}`,
            cls: 'elev',
            icon: 'stairs',
            maxDist: 90,
          });
        }
      }
    // Коды стеллажей
    if (show.labels && w.racks.length <= 400) {
      const idxInZone = new Map<string, number>();
      for (const r of w.racks) {
        const ctx = rackContext(w, r);
        if (!info.roomVisible(ctx.room)) continue;
        const i = idxInZone.get(r.zoneId) ?? 0;
        idxInZone.set(r.zoneId, i + 1);
        const half = rackLength(r) / 2000 + 0.4;
        const a = (r.rotation * Math.PI) / 180;
        const sgn = i % 2 === 0 ? -1 : 1;
        out.push({
          key: `k${r.id}`,
          x: r.x + sgn * Math.cos(a) * half,
          y: ctx.base + info.lift(ctx.room?.floorId) + rackHeight(r) / 1000 + 0.35,
          z: r.y + sgn * Math.sin(a) * half,
          text: r.code,
          cls: `rack ${r.id === selectedRackId ? 'active' : ''}`,
          maxDist: r.id === selectedRackId ? undefined : 48,
        });
      }
    }
    // Высоты ярусов выбранного стеллажа и предел зоны
    const sel = selectedRackId ? w.racks.find((r) => r.id === selectedRackId) : undefined;
    if (sel && show.heights) {
      const ctx = rackContext(w, sel);
      const base = ctx.base + info.lift(ctx.room?.floorId);
      const bases = tierBases(sel);
      const half = rackLength(sel) / 2000 + 0.25;
      const a = (sel.rotation * Math.PI) / 180;
      const x = sel.x - Math.cos(a) * half;
      const z = sel.y - Math.sin(a) * half;
      sel.tiers.forEach((t, i) =>
        out.push({
          key: `t${i}`,
          x,
          y: base + bases[i] / 1000 + t.height / 2000,
          z,
          text: `${i + 1} ярус · ${fmtM(bases[i] / 1000)} м`,
          cls: 'tier',
          maxDist: 90,
        }),
      );
      out.push({
        key: 'ttop',
        x,
        y: base + rackHeight(sel) / 1000 + 0.1,
        z,
        text: `верх ${fmtM(rackHeight(sel) / 1000)} м`,
        cls: 'tier top',
      });
      if (ctx.zone) {
        const c = polygonCentroid(ctx.zone.points);
        out.push({
          key: 'zl',
          x: c.x,
          y: info.roomBase(ctx.room) + ctx.zone.height + 0.2,
          z: c.y,
          text: `Предел размещения зоны ${ctx.zone.code}: ${fmtM(ctx.zone.height)} м`,
          cls: 'limit',
        });
      }
    }
    // Выноски по помещениям (мониторинг)
    if (mode === 'monitor' && show.callouts) {
      for (const r of w.rooms) {
        if (!info.roomVisible(r)) continue;
        const s = m.stats.byRoom.get(r.id);
        if (!s || !s.cells) continue;
        const problems = m.violations.filter((v) => {
          const c = m.idx.byAddress.get(v.address);
          return (
            VIOLATIONS[v.kind].level !== 'info' &&
            (c ? c.roomId === r.id : w.racks.find((k) => k.id === v.rackId && rackContext(w, k).room?.id === r.id))
          );
        }).length;
        const c = polygonCentroid(r.points);
        const top = Math.min(
          r.height,
          Math.max(2, ...w.racks.filter((k) => rackContext(w, k).room?.id === r.id).map((k) => rackHeight(k) / 1000)),
        );
        out.push({
          key: `c${r.id}`,
          x: c.x,
          y: info.roomBase(r) + top + 1.5,
          z: c.y,
          text: r.name.split(' — ')[0],
          cls: 'callout',
          color: r.hazard ? '#e5484d' : r.color,
          icon: r.hazard ? 'alert' : r.kind === 'yard' ? 'metal' : r.kind === 'canopy' ? 'pallet' : 'boxes',
          lines: [
            `${Math.round(s.fill * 100)}% · занято ${s.occupied.toLocaleString('ru-RU')} из ${s.cells.toLocaleString('ru-RU')}`,
          ],
          progress: s.fill,
          badge: problems,
          onClick: () => {
            st().setDashRoom(r.id);
            st().select({ kind: 'room', id: r.id });
            st().focusOn(c.x, info.roomBase(r), c.y);
          },
        });
      }
    }
    return out;
  }, [info, m, mode, show, step, selectedRackId]);
}

export type SceneMode = 'monitor' | 'build';

/** 3D-сцена склада: «мультяшный» стиль, этажи, мезонины, груз по видам, контроль. */
export function Scene3D({ mode = 'monitor' }: { mode?: SceneMode }) {
  const w = useWarehouse();
  const m = useMonitor();
  const products = useProductsMap();
  const tareTypes = useTareMap();
  const consumers = useConsumers();
  const selection = useStore((s) => s.selection);
  const step = useStore((s) => s.step);
  const show = useStore((s) => s.show);
  const theme = useStore((s) => s.theme);
  const colorMode = useStore((s) => s.colorMode);
  const wallMode = useStore((s) => s.wallMode);
  const floorFilter = useStore((s) => s.floorFilter);
  const explode = useStore((s) => s.explode);
  const clip = useStore((s) => s.clip);
  const tierFilter = useStore((s) => s.tierFilter);
  const typeFilter = useStore((s) => s.typeFilter);
  const groupFilter = useStore((s) => s.groupFilter);
  const zoneFilter = useStore((s) => s.zoneFilter);
  const fillFilter = useStore((s) => s.fillFilter);
  const productFilter = useStore((s) => s.productFilter);
  const highlightList = useStore((s) => s.highlight);
  const search = useStore((s) => s.search);
  const st = useStore.getState;

  const info = useMemo(() => (w ? sceneInfo(w, explode, floorFilter) : null), [w, explode, floorFilter]);
  const selectedRackId =
    selection?.kind === 'rack'
      ? selection.id
      : selection?.kind === 'cell' && selection.rackId
        ? selection.rackId
        : undefined;

  const cells = useMemo(() => {
    if (!info || !m) return [];
    return m.idx.cells.filter((c) => {
      if (c.virtual) return false;
      if (!info.roomVisible(info.roomById.get(c.roomId))) return false;
      if (tierFilter && c.tier !== tierFilter) return false;
      if (zoneFilter && c.zoneId !== zoneFilter) return false;
      if (typeFilter && c.cellType !== typeFilter) return false;
      const u = m.usage.get(c.address);
      if (groupFilter && !Object.keys(u?.byProduct ?? {}).some((pid) => products.get(pid)?.group === groupFilter))
        return false;
      if (fillFilter !== 'all') {
        const f = m.fill.get(c.address) ?? 0;
        if (fillFilter === 'empty' && (f > 0 || c.blocked)) return false;
        if (fillFilter === 'partial' && !(f > 0 && f < 0.95)) return false;
        if (fillFilter === 'full' && f < 0.95) return false;
        if (fillFilter === 'problems' && !m.worst.has(c.address)) return false;
      }
      return true;
    });
  }, [info, m, tierFilter, zoneFilter, typeFilter, groupFilter, fillFilter, products]);

  const visibleRack = useCallback(
    (rackId: string) => {
      if (!info) return false;
      const r = info.w.racks.find((x) => x.id === rackId);
      if (!r) return false;
      if (zoneFilter && r.zoneId !== zoneFilter) return false;
      return info.roomVisible(info.zoneRoom(info.w.zones.find((z) => z.id === r.zoneId)));
    },
    [info, zoneFilter],
  );

  const highlight = useMemo(() => {
    const set = new Set(highlightList);
    const q = search.trim().toUpperCase();
    if (m && (productFilter || q.length >= 2)) {
      for (const [addr, u] of m.usage) {
        if (productFilter && u.byProduct[productFilter]) set.add(addr);
        if (
          q.length >= 2 &&
          (addr.toUpperCase().includes(q) ||
            Object.keys(u.byProduct).some((pid) => products.get(pid)?.sku.toUpperCase().includes(q)))
        )
          set.add(addr);
      }
    }
    return set;
  }, [highlightList, search, productFilter, m, products]);

  const cargoCtx = useMemo<CargoCtx | null>(
    () => (m ? { mode: colorMode, products, tareTypes, worst: m.worst, lastMove: m.lastMove, now: Date.now() } : null),
    [m, colorMode, products, tareTypes],
  );

  const labels = useLabels(info, m, mode, selectedRackId);
  const registry = useMemo<LabelRegistry>(() => ({ labels: [], els: new Map(), tip: null }), []);
  const describe = useCallback(
    (c: Cell) => (m ? describeCell(c, m, products, consumers) : null),
    [m, products, consumers],
  );
  useEffect(() => () => useHover.getState().set(null), []);

  if (!w || !info || !m || !cargoCtx) return null;
  const dark = theme === 'dark';
  const bg = dark ? '#0f1828' : '#e8eef4';
  const build = mode === 'build';
  const structural = build && (step === 'rooms' || step === 'zones' || step === 'mezzanine');

  const onCell = (c: Cell, e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (build && (step === 'racks' || step === 'mezzanine')) st().select({ kind: 'rack', id: c.rackId });
    else st().select({ kind: 'cell', id: c.key, rackId: c.rackId });
  };
  const selZone =
    selection?.kind === 'zone'
      ? w.zones.find((z) => z.id === selection.id)
      : selectedRackId
        ? w.zones.find((z) => z.id === w.racks.find((r) => r.id === selectedRackId)?.zoneId)
        : undefined;
  const selRoomId = selection?.kind === 'room' ? selection.id : undefined;
  const placeFloor = floorFilter
    ? (w.floors.find((f) => f.id === floorFilter)?.elevation ?? 0) + info.lift(floorFilter)
    : 0;

  return (
    <div className="scene">
      <Canvas
        shadows
        camera={{ position: [60, 60, 90], fov: 38, near: 0.5, far: 5000 }}
        dpr={[1, 2]}
        onPointerMissed={(e) => e.button === 0 && st().select(null)}
        gl={{ antialias: true, preserveDrawingBuffer: true, localClippingEnabled: true }}
      >
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={[bg, 220, 620]} />
        <hemisphereLight args={[dark ? '#b8c7e0' : '#ffffff', dark ? '#1e293b' : '#c9d3c0', dark ? 1.0 : 1.25]} />
        <ambientLight intensity={dark ? 0.35 : 0.45} />
        <Sun w={w} dark={dark} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          maxPolarAngle={Math.PI / 2 - 0.03}
          minDistance={2}
          maxDistance={900}
        />
        <CameraRig w={w} />
        <Clipper clip={clip} />
        <Ground bounds={warehouseBounds(w)} dark={dark} />
        <RoomsLayer
          info={info}
          wallMode={wallMode}
          selectedRoomId={selRoomId}
          onRoomClick={(r, e) => {
            if (build && step !== 'rooms') return;
            e.stopPropagation();
            st().select({ kind: 'room', id: r.id });
            if (!build) st().setDashRoom(r.id);
          }}
        />
        {show.zones && (
          <ZonesLayer
            info={info}
            selectedZoneId={selection?.kind === 'zone' ? selection.id : undefined}
            onZoneClick={
              build && step === 'zones'
                ? (z, e) => {
                    e.stopPropagation();
                    st().select({ kind: 'zone', id: z.id });
                  }
                : undefined
            }
          />
        )}
        {show.heights && selZone && info.roomVisible(info.zoneRoom(selZone)) && (
          <ZoneLimit zone={selZone} base={info.roomBase(info.zoneRoom(selZone))} />
        )}
        <MezzaninesLayer
          info={info}
          selectedId={selection?.kind === 'mezzanine' ? selection.id : undefined}
          onPick={
            build && step === 'mezzanine'
              ? (mz) => {
                  st().select({ kind: 'mezzanine', id: mz.id });
                }
              : () => false
          }
        />
        {show.racks && (
          <RackFrames
            info={info}
            visibleRack={visibleRack}
            selectedRackId={selectedRackId}
            onPick={(rackId, e) => {
              // Стойки стоят на границах ячеек: если сразу за стойкой ячейка — отдаём щелчок ей
              if (!build || step !== 'racks')
                if (e.intersections.some((h) => h.object.name === 'cell-volumes' && h.distance - e.distance < 0.8))
                  return false;
              st().select({ kind: 'rack', id: rackId });
            }}
          />
        )}
        <CellsLayer
          info={info}
          monitor={m}
          cells={cells}
          mode={colorMode}
          ctx={cargoCtx}
          showCargo={show.cargo && !structural}
          selectedKey={selection?.kind === 'cell' ? selection.id : undefined}
          selectedRackId={build ? selectedRackId : undefined}
          highlight={highlight}
          onPick={onCell}
        />
        {show.equipment && (
          <EquipmentLayer
            info={info}
            people={show.people}
            selectedId={selection?.kind === 'equipment' ? selection.id : undefined}
            onPick={(e) => st().select({ kind: 'equipment', id: e.id })}
          />
        )}
        {build && <PlacementPlane base={placeFloor} />}
        <LabelProjector registry={registry} />
      </Canvas>
      <LabelsLayer registry={registry} labels={labels} describe={describe} />
    </div>
  );
}
