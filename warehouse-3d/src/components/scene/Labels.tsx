import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import type { Cell } from '../../types';
import { Icon, type IconName } from '../icons';
import { fillColor } from '../../lib/colors';

export interface Label3D {
  key: string;
  x: number;
  y: number;
  z: number;
  text: string;
  /** room | zone | rack | callout | elev | tier */
  cls: string;
  color?: string;
  /** Для выносок: строки, иконка, шкала загрузки, число нарушений, действие по щелчку */
  lines?: string[];
  icon?: string;
  progress?: number;
  badge?: number;
  /** Скрывать подпись, если камера дальше, м */
  maxDist?: number;
  onClick?: () => void;
}

/** Содержимое карточки ячейки под курсором. */
export interface HoverInfo {
  title: string;
  sub: string;
  fill?: number;
  rows: [string, string][];
  items: { name: string; qty: string; note?: string; color?: string }[];
  alerts: string[];
}

/** Общий реестр DOM-подписей: проектор внутри Canvas двигает их каждый кадр без перерисовки React. */
export interface LabelRegistry {
  labels: Label3D[];
  els: Map<string, HTMLDivElement>;
  tip: HTMLDivElement | null;
}

/** Ячейка под курсором — отдельное мини-хранилище, чтобы наведение не перерисовывало сцену. */
export const useHover = create<{
  cell: Cell | null;
  pos: [number, number, number] | null;
  set: (c: Cell | null, pos?: [number, number, number] | null) => void;
}>((set) => ({
  cell: null,
  pos: null,
  set: (cell, pos = null) => set({ cell, pos }),
}));

const v = new THREE.Vector3();

export function LabelProjector({ registry }: { registry: LabelRegistry }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const place = (el: HTMLDivElement, x: number, y: number, z: number, maxDist?: number) => {
    if (maxDist !== undefined && camera.position.distanceTo(v.set(x, y, z)) > maxDist) {
      el.style.visibility = 'hidden';
      return;
    }
    v.set(x, y, z).project(camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = 'visible';
    el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
  };
  useFrame(() => {
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const l of registry.labels) {
      const el = registry.els.get(l.key);
      if (!el) continue;
      if (l.cls !== 'callout') {
        place(el, l.x, l.y, l.z, l.maxDist);
        continue;
      }
      // Выноски не перекрывают друг друга: ищем ближайшее свободное место выше или ниже, иначе прячем
      v.set(l.x, l.y, l.z).project(camera);
      if (v.z > 1 || v.z < -1) {
        el.style.visibility = 'hidden';
        continue;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = ((v.x + 1) / 2) * size.width - w / 2;
      const y0 = ((1 - v.y) / 2) * size.height - h;
      const free = (yy: number) =>
        yy >= 4 &&
        yy + h <= size.height - 56 &&
        x > -w / 2 &&
        x + w / 2 < size.width &&
        !boxes.some((b) => x < b.x + b.w + 6 && x + w + 6 > b.x && yy < b.y + b.h + 6 && yy + h + 6 > b.y);
      const candidates = [y0];
      for (let k = 1; k <= 6; k++) candidates.push(y0 - k * (h / 2 + 6), y0 + k * (h / 2 + 6));
      const found = candidates.find(free);
      if (found === undefined) {
        el.style.visibility = 'hidden';
        continue;
      }
      boxes.push({ x, y: found, w, h });
      el.style.visibility = 'visible';
      el.style.transform = `translate(${x}px, ${found}px)`;
    }
    const tip = registry.tip;
    const pos = useHover.getState().pos;
    if (tip) {
      if (!pos) tip.style.visibility = 'hidden';
      else {
        v.set(pos[0], pos[1], pos[2]).project(camera);
        if (v.z > 1 || v.z < -1) {
          tip.style.visibility = 'hidden';
          return;
        }
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        let x = ((v.x + 1) / 2) * size.width - w / 2;
        let y = ((1 - v.y) / 2) * size.height - h - 14;
        if (y < 6) y = ((1 - v.y) / 2) * size.height + 24;
        x = Math.max(6, Math.min(size.width - w - 6, x));
        y = Math.max(6, Math.min(size.height - h - 6, y));
        tip.style.visibility = 'visible';
        tip.style.transform = `translate(${x}px, ${y}px)`;
      }
    }
  });
  return null;
}

function HoverCard({ describe }: { describe?: (c: Cell) => HoverInfo | null }) {
  const cell = useHover((s) => s.cell);
  const info = useMemo(() => (cell && describe ? describe(cell) : null), [cell, describe]);
  if (!info) return null;
  return (
    <>
      <div className="hc-head">
        <b className="mono">{info.title}</b>
        {info.fill !== undefined && (
          <span className="hc-fill" style={{ background: fillColor(info.fill) }}>
            {Math.round(info.fill * 100)}%
          </span>
        )}
      </div>
      <div className="hc-sub">{info.sub}</div>
      {info.fill !== undefined && (
        <div className="hc-bar">
          <i style={{ width: `${Math.round(info.fill * 100)}%`, background: fillColor(info.fill) }} />
        </div>
      )}
      <div className="hc-rows">
        {info.rows.map(([k, val]) => (
          <span key={k}>
            <em>{k}</em>
            <b>{val}</b>
          </span>
        ))}
      </div>
      {info.items.length > 0 && (
        <div className="hc-items">
          {info.items.map((it, i) => (
            <div key={i}>
              <i style={{ background: it.color }} />
              <span className="grow">
                {it.name}
                {it.note && <em>{it.note}</em>}
              </span>
              <b>{it.qty}</b>
            </div>
          ))}
        </div>
      )}
      {info.alerts.map((a) => (
        <div key={a} className="hc-alert">
          <Icon name="alert" size={13} /> {a}
        </div>
      ))}
    </>
  );
}

export function LabelsLayer({
  registry,
  labels,
  describe,
}: {
  registry: LabelRegistry;
  labels: Label3D[];
  describe?: (c: Cell) => HoverInfo | null;
}) {
  registry.labels = labels;
  return (
    <div className="labels-layer">
      {labels.map((l) => (
        <div
          key={l.key}
          className={`label3d ${l.cls} ${l.onClick ? 'clickable' : ''}`}
          style={l.color ? ({ '--lc': l.color } as React.CSSProperties) : undefined}
          onClick={l.onClick}
          ref={(el) => {
            if (el) registry.els.set(l.key, el);
            else registry.els.delete(l.key);
          }}
        >
          {l.cls === 'callout' ? (
            <>
              <span className="callout-icon">
                <Icon name={(l.icon ?? 'boxes') as IconName} size={16} />
              </span>
              <span className="callout-body">
                <b>
                  {l.text}
                  {!!l.badge && <span className="callout-badge">{l.badge}</span>}
                </b>
                {l.lines?.map((t) => (
                  <span key={t}>{t}</span>
                ))}
                {l.progress !== undefined && (
                  <span className="callout-bar">
                    <i style={{ width: `${Math.round(l.progress * 100)}%`, background: fillColor(l.progress) }} />
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              {l.icon && <Icon name={l.icon as IconName} size={12} />}
              {l.text}
            </>
          )}
        </div>
      ))}
      <div
        className="hovercard"
        ref={(el) => {
          registry.tip = el;
        }}
        style={{ visibility: 'hidden' }}
      >
        <HoverCard describe={describe} />
      </div>
    </div>
  );
}
