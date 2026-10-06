import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import type { Cell } from '../../types';
import { Icon, type IconName } from '../icons';
import { fillColor } from '../../lib/fill';

export interface Label3D {
  key: string;
  x: number;
  y: number;
  z: number;
  text: string;
  cls: string;
  color?: string;
  /** Для выносок: строки, иконка, шкала загрузки, действие по щелчку */
  lines?: string[];
  icon?: string;
  progress?: number;
  onClick?: () => void;
}

/** Общий реестр DOM-подписей: проектор внутри Canvas двигает их каждый кадр без перерисовки React. */
export interface LabelRegistry {
  labels: Label3D[];
  els: Map<string, HTMLDivElement>;
  tip: HTMLDivElement | null;
}

/** Ячейка под курсором — отдельное мини-хранилище, чтобы наведение не перерисовывало сцену. */
export const useHover = create<{ cell: Cell | null; text: string; set: (c: Cell | null, text?: string) => void }>(
  (set) => ({
    cell: null,
    text: '',
    set: (cell, text = '') => set({ cell, text }),
  }),
);

const v = new THREE.Vector3();

export function LabelProjector({ registry }: { registry: LabelRegistry }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const place = (el: HTMLDivElement, x: number, y: number, z: number) => {
    v.set(x, y, z).project(camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) {
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
        place(el, l.x, l.y, l.z);
        continue;
      }
      // Выноски не должны перекрывать друг друга: сдвигаем вверх, пока есть пересечение
      v.set(l.x, l.y, l.z).project(camera);
      if (v.z > 1 || v.z < -1) {
        el.style.visibility = 'hidden';
        continue;
      }
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = ((v.x + 1) / 2) * size.width - w / 2;
      let y = ((1 - v.y) / 2) * size.height - h;
      // Ищем ближайшее свободное место выше или ниже; если его нет — прячем выноску
      const y0 = y;
      const free = (yy: number) =>
        yy >= 4 &&
        yy + h <= size.height - 64 &&
        !boxes.some((b) => x < b.x + b.w + 6 && x + w + 6 > b.x && yy < b.y + b.h + 6 && yy + h + 6 > b.y);
      const candidates = [y0];
      for (let k = 1; k <= 6; k++) candidates.push(y0 - k * (h / 2 + 6), y0 + k * (h / 2 + 6));
      const found = candidates.find(free);
      if (found === undefined) {
        el.style.visibility = 'hidden';
        continue;
      }
      y = found;
      boxes.push({ x, y, w, h });
      el.style.visibility = 'visible';
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
    const tip = registry.tip;
    const c = useHover.getState().cell;
    if (tip) {
      if (c) place(tip, c.cx, c.cy + c.height / 2000 + 0.2, c.cz);
      else tip.style.visibility = 'hidden';
    }
  });
  return null;
}

export function LabelsLayer({ registry, labels }: { registry: LabelRegistry; labels: Label3D[] }) {
  registry.labels = labels;
  const text = useHover((s) => s.text);
  return (
    <div className="labels-layer">
      {labels.map((l) => (
        <div
          key={l.key}
          className={`label3d ${l.cls}`}
          style={l.color ? { borderColor: l.color } : undefined}
          onClick={l.onClick}
          ref={(el) => {
            if (el) registry.els.set(l.key, el);
            else registry.els.delete(l.key);
          }}
        >
          {l.cls === 'callout' ? (
            <>
              <span className="callout-icon" style={{ color: l.color }}>
                <Icon name={(l.icon ?? 'boxes') as IconName} size={16} />
              </span>
              <span className="callout-body">
                <b>{l.text}</b>
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
            l.text
          )}
        </div>
      ))}
      <div
        className="tip3d"
        ref={(el) => {
          registry.tip = el;
        }}
        style={{ visibility: 'hidden' }}
      >
        {text}
      </div>
    </div>
  );
}
