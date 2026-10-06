import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Pt, Rack, Warehouse } from '../../types';
import { useStore, useWarehouse } from '../../store';
import { useCells, useFills, warehouseBounds } from '../../lib/derived';
import { bbox, dist, fmt, localToPlan, pointInPolygon, polygonCentroid, round } from '../../lib/geometry';
import { RACK_SPEC, rackFootprint, rackLength } from '../../lib/rack';
import { fillColor } from '../../lib/fill';

interface View {
  cx: number;
  cy: number;
  /** пикселей на метр */
  scale: number;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number; moved: boolean }
  | { kind: 'vertex'; target: 'room' | 'zone'; id: string; index: number }
  | { kind: 'rack'; id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean }
  | {
      kind: 'shape';
      target: 'room' | 'zone';
      id: string;
      start: Pt;
      sx: number;
      sy: number;
      orig: Warehouse;
      moved: boolean;
    };

const GRID_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];

/** Подпись помещения у левого верхнего угла (если он внутри контура), иначе — в центре. */
function roomLabelPoint(points: Pt[]): Pt & { anchor: 'start' | 'middle' } {
  const b = bbox(points);
  const p = { x: b.minX + 0.6, y: b.minY + 0.6 };
  if (pointInPolygon(p, points)) return { ...p, anchor: 'start' };
  return { ...polygonCentroid(points), anchor: 'middle' };
}

function EdgeLabels({ points, scale, color }: { points: Pt[]; scale: number; color: string }) {
  const fs = 11 / scale;
  return (
    <g pointerEvents="none">
      {points.map((a, i) => {
        const b = points[(i + 1) % points.length];
        const len = dist(a, b);
        if (len * scale < 36) return null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const off = 10 / scale;
        let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        if (angle > 90 || angle < -90) angle += 180;
        return (
          <text
            key={i}
            x={mx + nx * off}
            y={my + ny * off}
            fontSize={fs}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${angle} ${mx + nx * off} ${my + ny * off})`}
            className="plan-dim"
            fill={color}
          >
            {fmt(len)} м
          </text>
        );
      })}
    </g>
  );
}

/** Секции стеллажа на плане; в режиме заполнения окрашены по средней заполненности секции. */
function RackShape({
  r,
  scale,
  selected,
  heat,
  onDown,
}: {
  r: Rack;
  scale: number;
  selected: boolean;
  heat?: number[];
  onDown?: (e: React.PointerEvent) => void;
}) {
  const fp = rackFootprint(r);
  const spec = RACK_SPEC[r.kind];
  const L = rackLength(r) / 1000;
  const D = r.depth / 1000;
  const S = r.sectionLength / 1000;
  const U = spec.upright / 1000;
  const base = r.kind === 'pallet' ? '#1e40af' : '#64748b';
  const sections = [];
  if (heat || scale * S > 6) {
    for (let s = 0; s < r.sections; s++) {
      const x0 = -L / 2 + U + s * (S + U);
      const corners = [
        localToPlan(r.x, r.y, r.rotation, x0, -D / 2),
        localToPlan(r.x, r.y, r.rotation, x0 + S, -D / 2),
        localToPlan(r.x, r.y, r.rotation, x0 + S, D / 2),
        localToPlan(r.x, r.y, r.rotation, x0, D / 2),
      ];
      const h = heat?.[s];
      sections.push(
        <polygon
          key={s}
          points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={h === undefined ? (heat ? '#e2e8f0' : '#dbeafe') : fillColor(h)}
          opacity={heat ? 0.95 : 0.55}
          pointerEvents="none"
        />,
      );
    }
  }
  const c = { x: r.x, y: r.y };
  const fs = Math.min(13 / scale, D * 0.9);
  return (
    <g onPointerDown={onDown} style={{ cursor: onDown ? 'move' : undefined }}>
      <polygon
        points={fp.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={base}
        fillOpacity={selected ? 0.9 : 0.7}
        stroke={selected ? '#0ea5e9' : base}
        strokeWidth={selected ? 3 : 1}
        vectorEffect="non-scaling-stroke"
      />
      {sections}
      {scale * L > 24 && (
        <text
          x={c.x}
          y={c.y}
          fontSize={fs}
          textAnchor="middle"
          dominantBaseline="central"
          className="plan-rack-label"
          transform={`rotate(${((r.rotation % 180) + 180) % 180 > 90 ? r.rotation + 180 : r.rotation} ${c.x} ${c.y})`}
          pointerEvents="none"
        >
          {r.code}
        </text>
      )}
    </g>
  );
}

export function PlanEditor() {
  const w = useWarehouse();
  const step = useStore((s) => s.step);
  const selection = useStore((s) => s.selection);
  const draw = useStore((s) => s.draw);
  const snap = useStore((s) => s.snap);
  const st = useStore.getState;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: 10 });
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [shift, setShift] = useState(false);
  const drag = useRef<Drag | null>(null);
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(
    (wh: Warehouse | undefined = w) => {
      if (!wh) return;
      const b = warehouseBounds(wh);
      const bw = Math.max(10, b.maxX - b.minX + 6);
      const bh = Math.max(10, b.maxY - b.minY + 6);
      setView({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale: Math.min(size.w / bw, size.h / bh) });
    },
    [w, size.w, size.h],
  );

  useEffect(() => {
    if (!w || size.w < 10) return;
    if (fittedFor.current !== w.id) {
      fittedFor.current = w.id;
      fit(w);
    }
  }, [w, size, fit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => setShift(e.shiftKey);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', down);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', down);
    };
  }, []);

  const vb = {
    x: view.cx - size.w / 2 / view.scale,
    y: view.cy - size.h / 2 / view.scale,
    w: size.w / view.scale,
    h: size.h / view.scale,
  };

  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: vb.x + (clientX - rect.left) / view.scale, y: vb.y + (clientY - rect.top) / view.scale };
  };
  const snapPt = (p: Pt): Pt =>
    snap > 0 ? { x: round(p.x, snap), y: round(p.y, snap) } : { x: round(p.x), y: round(p.y) };

  /** Точка для рисования: привязка к сетке и (с Shift) только по горизонтали/вертикали. */
  const drawPoint = (p: Pt): Pt => {
    let q = snapPt(p);
    const last = draw?.points[draw.points.length - 1];
    if (last && shift) {
      q = Math.abs(q.x - last.x) > Math.abs(q.y - last.y) ? { x: q.x, y: last.y } : { x: last.x, y: q.y };
    }
    return q;
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = toWorld(e.clientX, e.clientY);
    const k = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const scale = Math.max(0.5, Math.min(400, v.scale * k));
      const f = v.scale / scale;
      return { scale, cx: p.x + (v.cx - p.x) * f, cy: p.y + (v.cy - p.y) * f };
    });
  };

  const startPan = (e: React.PointerEvent) => {
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onBgDown = (e: React.PointerEvent) => {
    if (draw && e.button === 0) {
      const p = drawPoint(toWorld(e.clientX, e.clientY));
      const first = draw.points[0];
      if (first && draw.points.length >= 3 && dist(p, first) * view.scale < 12) {
        st().finishDraw();
        return;
      }
      const last = draw.points[draw.points.length - 1];
      if (!last || dist(last, p) > 1e-6) st().addDrawPoint(p);
      return;
    }
    startPan(e);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toWorld(e.clientX, e.clientY);
    setCursor(p);
    const d = drag.current;
    if (!d || !w) return;
    if (d.kind === 'pan') {
      const dx = (e.clientX - d.sx) / view.scale;
      const dy = (e.clientY - d.sy) / view.scale;
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
      setView((v) => ({ ...v, cx: d.cx - dx, cy: d.cy - dy }));
    } else if (d.kind === 'vertex') {
      const q = snapPt(p);
      const list = d.target === 'room' ? w.rooms : w.zones;
      const item = list.find((x) => x.id === d.id);
      if (!item) return;
      const pts = item.points.map((pt, i) => (i === d.index ? q : pt));
      if (d.target === 'room') st().updateRoom(d.id, { points: pts }, false);
      else st().updateZone(d.id, { points: pts }, false);
    } else if (d.kind === 'rack') {
      if (!d.moved) {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 5) return;
        st().checkpoint();
        d.moved = true;
      }
      const q = snapPt({ x: p.x - d.dx, y: p.y - d.dy });
      st().updateRack(d.id, { x: q.x, y: q.y }, false);
    } else if (d.kind === 'shape') {
      if (!d.moved) {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 5) return;
        st().checkpoint();
        d.moved = true;
      }
      const delta = snapPt({ x: p.x - d.start.x, y: p.y - d.start.y });
      st().moveShape(d.target, d.id, delta.x, delta.y, d.orig);
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'pan' && !d.moved && !draw) st().select(null);
  };

  const startVertexDrag = (e: React.PointerEvent, target: 'room' | 'zone', id: string, index: number) => {
    if (draw) return;
    e.stopPropagation();
    st().checkpoint();
    drag.current = { kind: 'vertex', target, id, index };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const insertVertex = (target: 'room' | 'zone', id: string, after: number, p: Pt) => {
    if (!w) return;
    const item = (target === 'room' ? w.rooms : w.zones).find((x) => x.id === id);
    if (!item) return;
    const pts = [...item.points.slice(0, after + 1), snapPt(p), ...item.points.slice(after + 1)];
    if (target === 'room') st().updateRoom(id, { points: pts });
    else st().updateZone(id, { points: pts });
  };

  const removeVertex = (target: 'room' | 'zone', id: string, index: number) => {
    if (!w) return;
    const item = (target === 'room' ? w.rooms : w.zones).find((x) => x.id === id);
    if (!item || item.points.length <= 3) return;
    const pts = item.points.filter((_, i) => i !== index);
    if (target === 'room') st().updateRoom(id, { points: pts });
    else st().updateZone(id, { points: pts });
  };

  // Тепловая карта секций для режима заполнения
  const { cells } = useCells();
  const fills = useFills();
  const showHeat = step === 'fill' || step === 'connect';
  const heat = useMemo(() => {
    if (!showHeat) return null;
    const acc = new Map<string, { sum: number[]; n: number[] }>();
    for (const c of cells) {
      if (c.blocked) continue;
      let a = acc.get(c.rackId);
      if (!a) acc.set(c.rackId, (a = { sum: [], n: [] }));
      const i = c.section - 1;
      a.sum[i] = (a.sum[i] ?? 0) + (fills[c.address]?.fill ?? 0);
      a.n[i] = (a.n[i] ?? 0) + 1;
    }
    const out = new Map<string, number[]>();
    acc.forEach((a, id) =>
      out.set(
        id,
        a.sum.map((s, i) => (a.n[i] ? s / a.n[i] : 0)),
      ),
    );
    return out;
  }, [showHeat, cells, fills]);

  if (!w) return <div className="plan-wrap" ref={wrapRef} />;

  // Сетка
  const minor = GRID_STEPS.find((s) => s * view.scale >= 14) ?? 100;
  const major = minor * 5;
  const gridLines: React.ReactElement[] = [];
  const x0 = Math.floor(vb.x / minor) * minor;
  const y0 = Math.floor(vb.y / minor) * minor;
  for (let x = x0; x <= vb.x + vb.w; x += minor) {
    const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    gridLines.push(
      <line
        key={`x${x.toFixed(3)}`}
        x1={x}
        y1={vb.y}
        x2={x}
        y2={vb.y + vb.h}
        className={isMajor ? 'grid-major' : 'grid-minor'}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  for (let y = y0; y <= vb.y + vb.h; y += minor) {
    const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
    gridLines.push(
      <line
        key={`y${y.toFixed(3)}`}
        x1={vb.x}
        y1={y}
        x2={vb.x + vb.w}
        y2={y}
        className={isMajor ? 'grid-major' : 'grid-minor'}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  const roomsInteractive = !draw && (step === 'rooms' || step === 'objects');
  const zonesInteractive = !draw && step === 'zones';
  const racksInteractive = !draw && (step === 'racks' || step === 'cells' || step === 'fill' || step === 'connect');
  const selRoom = selection?.kind === 'room' ? w.rooms.find((r) => r.id === selection.id) : undefined;
  const selZone = selection?.kind === 'zone' ? w.zones.find((z) => z.id === selection.id) : undefined;
  const selRackId =
    selection?.kind === 'rack' ? selection.id : selection?.kind === 'cell' ? selection.rackId : undefined;
  const editShape =
    !draw &&
    (selRoom && step === 'rooms'
      ? { target: 'room' as const, item: selRoom }
      : selZone && step === 'zones'
        ? { target: 'zone' as const, item: selZone }
        : null);
  const hr = 6 / view.scale;
  const drawPreview = draw && cursor ? drawPoint(cursor) : null;
  const zoom = (k: number) => setView((v) => ({ ...v, scale: Math.max(0.5, Math.min(400, v.scale * k)) }));

  return (
    <div className="plan-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={`plan ${draw ? 'drawing' : ''}`}
        width={size.w}
        height={size.h}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onWheel={onWheel}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={() => draw && st().finishDraw()}
        onContextMenu={(e) => {
          if (draw) {
            e.preventDefault();
            st().undoDrawPoint();
          }
        }}
      >
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} className="plan-bg" onPointerDown={onBgDown} />
        <g pointerEvents="none">{gridLines}</g>
        <line
          x1={0}
          y1={vb.y}
          x2={0}
          y2={vb.y + vb.h}
          className="grid-axis"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <line
          x1={vb.x}
          y1={0}
          x2={vb.x + vb.w}
          y2={0}
          className="grid-axis"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />

        {/* Помещения */}
        {w.rooms.map((r) => {
          const sel = selRoom?.id === r.id;
          return (
            <g key={r.id}>
              <polygon
                points={r.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={r.color}
                fillOpacity={sel ? 0.18 : 0.08}
                stroke={sel ? '#2563eb' : r.color}
                strokeWidth={sel ? 3 : 2}
                vectorEffect="non-scaling-stroke"
                pointerEvents={roomsInteractive ? 'all' : 'none'}
                style={{ cursor: roomsInteractive ? (sel ? 'move' : 'pointer') : undefined }}
                onPointerDown={(e) => {
                  if (!roomsInteractive || e.button !== 0) return;
                  e.stopPropagation();
                  st().select({ kind: 'room', id: r.id });
                  if (step === 'rooms') {
                    drag.current = {
                      kind: 'shape',
                      target: 'room',
                      id: r.id,
                      start: toWorld(e.clientX, e.clientY),
                      sx: e.clientX,
                      sy: e.clientY,
                      orig: w,
                      moved: false,
                    };
                    svgRef.current?.setPointerCapture(e.pointerId);
                  }
                }}
              />
            </g>
          );
        })}

        {/* Зоны */}
        {w.zones.map((z) => {
          const sel = selZone?.id === z.id;
          return (
            <g key={z.id}>
              <polygon
                points={z.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={z.color}
                fillOpacity={sel ? 0.35 : 0.18}
                stroke={z.color}
                strokeWidth={sel ? 3 : 1.5}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                pointerEvents={zonesInteractive ? 'all' : 'none'}
                style={{ cursor: zonesInteractive ? (sel ? 'move' : 'pointer') : undefined }}
                onPointerDown={(e) => {
                  if (!zonesInteractive || e.button !== 0) return;
                  e.stopPropagation();
                  st().select({ kind: 'zone', id: z.id });
                  drag.current = {
                    kind: 'shape',
                    target: 'zone',
                    id: z.id,
                    start: toWorld(e.clientX, e.clientY),
                    sx: e.clientX,
                    sy: e.clientY,
                    orig: w,
                    moved: false,
                  };
                  svgRef.current?.setPointerCapture(e.pointerId);
                }}
              />
            </g>
          );
        })}

        {/* Стеллажи */}
        {w.racks.map((r) => (
          <RackShape
            key={r.id}
            r={r}
            scale={view.scale}
            selected={selRackId === r.id}
            heat={heat?.get(r.id)}
            onDown={
              racksInteractive
                ? (e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    st().select({ kind: 'rack', id: r.id });
                    if (step === 'racks') {
                      const p = toWorld(e.clientX, e.clientY);
                      drag.current = {
                        kind: 'rack',
                        id: r.id,
                        dx: p.x - r.x,
                        dy: p.y - r.y,
                        sx: e.clientX,
                        sy: e.clientY,
                        moved: false,
                      };
                      svgRef.current?.setPointerCapture(e.pointerId);
                    }
                  }
                : undefined
            }
          />
        ))}

        {/* Подписи и размеры — поверх стеллажей */}
        <g pointerEvents="none">
          {w.rooms.map((r) => {
            const p = roomLabelPoint(r.points);
            return (
              <g key={r.id}>
                <text
                  x={p.x}
                  y={p.y}
                  fontSize={14 / view.scale}
                  textAnchor={p.anchor}
                  dominantBaseline="hanging"
                  className="plan-room-label"
                >
                  {r.name}
                </text>
                {(selRoom?.id === r.id || step === 'rooms') && (
                  <EdgeLabels
                    points={r.points}
                    scale={view.scale}
                    color={selRoom?.id === r.id ? '#1d4ed8' : '#64748b'}
                  />
                )}
              </g>
            );
          })}
          {w.zones.map((z) => {
            const sel = selZone?.id === z.id;
            if (step !== 'zones' && !sel) return null;
            const c = polygonCentroid(z.points);
            return (
              <g key={z.id}>
                <text
                  x={c.x}
                  y={c.y}
                  fontSize={12 / view.scale}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="plan-zone-label"
                >
                  {z.name} · {z.height} м
                </text>
                {sel && <EdgeLabels points={z.points} scale={view.scale} color={z.color} />}
              </g>
            );
          })}
        </g>

        {/* Вершины выбранного контура */}
        {editShape && (
          <g>
            {editShape.item.points.map((a, i) => {
              const b = editShape.item.points[(i + 1) % editShape.item.points.length];
              return (
                <rect
                  key={`m${i}`}
                  x={(a.x + b.x) / 2 - hr * 0.6}
                  y={(a.y + b.y) / 2 - hr * 0.6}
                  width={hr * 1.2}
                  height={hr * 1.2}
                  className="handle-mid"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    insertVertex(editShape.target, editShape.item.id, i, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                  }}
                >
                  <title>Добавить вершину</title>
                </rect>
              );
            })}
            {editShape.item.points.map((p, i) => (
              <circle
                key={`v${i}`}
                cx={p.x}
                cy={p.y}
                r={hr}
                className="handle"
                onPointerDown={(e) => startVertexDrag(e, editShape.target, editShape.item.id, i)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  removeVertex(editShape.target, editShape.item.id, i);
                }}
              >
                <title>
                  Вершина {i + 1}: {fmt(p.x)}; {fmt(p.y)} м — перетащите, двойной щелчок удаляет
                </title>
              </circle>
            ))}
          </g>
        )}

        {/* Рисование нового контура */}
        {draw && (
          <g pointerEvents="none">
            {draw.points.length > 0 && (
              <polyline
                points={[...draw.points, ...(drawPreview ? [drawPreview] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
                className="draw-line"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {draw.points.length >= 2 && drawPreview && (
              <line
                x1={drawPreview.x}
                y1={drawPreview.y}
                x2={draw.points[0].x}
                y2={draw.points[0].y}
                className="draw-close"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <EdgeLabels
              points={[...draw.points, ...(drawPreview ? [drawPreview] : [])]}
              scale={view.scale}
              color="#dc2626"
            />
            {draw.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hr * (i === 0 ? 1.3 : 0.9)}
                className={i === 0 ? 'draw-first' : 'draw-pt'}
              />
            ))}
            {drawPreview && <circle cx={drawPreview.x} cy={drawPreview.y} r={hr * 0.7} className="draw-cursor" />}
          </g>
        )}
      </svg>

      <div className="plan-tools">
        <button className="icon-btn" title="Показать весь объект" onClick={() => fit()}>
          ⤢
        </button>
        <button className="icon-btn" title="Приблизить" onClick={() => zoom(1.3)}>
          +
        </button>
        <button className="icon-btn" title="Отдалить" onClick={() => zoom(1 / 1.3)}>
          −
        </button>
        <label className="snap" title="Привязка к сетке">
          Шаг
          <select value={snap} onChange={(e) => st().setSnap(Number(e.target.value))}>
            <option value={0}>нет</option>
            <option value={0.1}>0,1 м</option>
            <option value={0.25}>0,25 м</option>
            <option value={0.5}>0,5 м</option>
            <option value={1}>1 м</option>
          </select>
        </label>
      </div>

      {draw && (
        <div className="plan-hint">
          <b>{draw.target === 'room' ? 'Контур помещения' : 'Контур зоны'}</b>: щёлкайте по углам. Shift — только
          горизонталь/вертикаль. Замкнуть — щелчок по первой точке, двойной щелчок или Enter. Правая кнопка / Backspace
          — отменить точку, Esc — выйти.
          <div className="plan-hint-actions">
            <button className="btn small primary" disabled={draw.points.length < 3} onClick={() => st().finishDraw()}>
              Готово ({draw.points.length} т.)
            </button>
            <button className="btn small" onClick={() => st().cancelDraw()}>
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="plan-status">
        {cursor ? `x ${fmt(cursor.x)} м · y ${fmt(cursor.y)} м` : 'Колесо — масштаб, перетаскивание — сдвиг'} · сетка{' '}
        {fmt(minor)} м
      </div>
    </div>
  );
}
