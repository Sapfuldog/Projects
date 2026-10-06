import type { Pt } from '../../types';
import { dist, fmt } from '../../lib/geometry';
import { Num } from '../ui';

/** Таблица вершин контура: точный ввод координат, добавление и удаление углов. */
export function VerticesEditor({ points, onChange }: { points: Pt[]; onChange: (pts: Pt[]) => void }) {
  const set = (i: number, p: Partial<Pt>) => onChange(points.map((q, j) => (j === i ? { ...q, ...p } : q)));
  return (
    <div className="vertices">
      <div className="vertices-head">
        <span>№</span>
        <span>X, м</span>
        <span>Y, м</span>
        <span title="Длина стороны до следующей вершины">Сторона</span>
        <span />
      </div>
      {points.map((p, i) => (
        <div className="vertices-row" key={i}>
          <span className="muted">{i + 1}</span>
          <Num value={p.x} step={0.1} onChange={(x) => set(i, { x })} />
          <Num value={p.y} step={0.1} onChange={(y) => set(i, { y })} />
          <span className="muted small">{fmt(dist(p, points[(i + 1) % points.length]))} м</span>
          <span className="vertices-actions">
            <button
              className="icon-btn small"
              title="Добавить вершину после этой (середина стороны)"
              onClick={() => {
                const n = points[(i + 1) % points.length];
                const mid = {
                  x: Math.round(((p.x + n.x) / 2) * 100) / 100,
                  y: Math.round(((p.y + n.y) / 2) * 100) / 100,
                };
                onChange([...points.slice(0, i + 1), mid, ...points.slice(i + 1)]);
              }}
            >
              +
            </button>
            <button
              className="icon-btn small"
              title="Удалить вершину"
              disabled={points.length <= 3}
              onClick={() => onChange(points.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
