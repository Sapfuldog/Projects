import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import type { Cell } from '../../types';

export interface Label3D {
  key: string;
  x: number;
  y: number;
  z: number;
  text: string;
  cls: string;
  color?: string;
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
    for (const l of registry.labels) {
      const el = registry.els.get(l.key);
      if (el) place(el, l.x, l.y, l.z);
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
          ref={(el) => {
            if (el) registry.els.set(l.key, el);
            else registry.els.delete(l.key);
          }}
        >
          {l.text}
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
