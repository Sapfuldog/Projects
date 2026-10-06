import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Ширина контейнера для адаптивных SVG-графиков. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** «Красивые» деления оси: 0 / 1 000 / 2 000 … */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

export const fmtAxis = (v: number) =>
  v >= 1e6
    ? `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`
    : v >= 1e4
      ? `${Math.round(v / 1e3)} тыс`
      : v.toLocaleString('ru-RU');

function Tooltip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.min(Math.max(8, x + 12), width - 170);
  return (
    <div className="chart-tip" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

// ---------- Кольцевая диаграмма ----------

export interface DonutItem {
  label: string;
  value: number;
  /** Подпись значения для легенды/подсказки */
  display: string;
}

export function Donut({
  items,
  centerLabel,
  centerValue,
}: {
  items: DonutItem[];
  centerLabel: string;
  centerValue: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const R = 70;
  const r = 48;
  let a0 = -Math.PI / 2;
  const arc = (a1: number, a2: number) => {
    const large = a2 - a1 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${90 + rad * Math.cos(a)} ${90 + rad * Math.sin(a)}`;
    return `M ${p(R, a1)} A ${R} ${R} 0 ${large} 1 ${p(R, a2)} L ${p(r, a2)} A ${r} ${r} 0 ${large} 0 ${p(r, a1)} Z`;
  };
  const h = hover !== null ? items[hover] : null;
  return (
    <div className="donut">
      <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label={`Диаграмма: ${centerLabel}`}>
        {items.map((it, i) => {
          const a1 = a0;
          const a2 = a0 + (it.value / total) * Math.PI * 2;
          a0 = a2;
          return (
            <path
              key={it.label}
              d={arc(a1, Math.max(a1 + 0.001, a2 - 0.0001))}
              fill={`var(--series-${i + 1})`}
              stroke="var(--surface)"
              strokeWidth={2}
              opacity={hover === null || hover === i ? 1 : 0.45}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        <text x="90" y="86" textAnchor="middle" className="donut-value">
          {h ? `${Math.round((h.value / total) * 100)}%` : centerValue}
        </text>
        <text x="90" y="106" textAnchor="middle" className="donut-label">
          {h ? h.label : centerLabel}
        </text>
      </svg>
      <div className="legend-list">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`legend-row ${hover === i ? 'hover' : ''}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <i style={{ background: `var(--series-${i + 1})` }} />
            <span className="grow">{it.label}</span>
            <span className="mono">{Math.round((it.value / total) * 100)}%</span>
            <span className="muted small">{it.display}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Линия с заливкой ----------

export function AreaLine({
  points,
  label,
  height = 220,
  format = (v: number) => v.toLocaleString('ru-RU'),
}: {
  points: { x: number; y: number }[];
  label: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const pad = { l: 56, r: 56, t: 14, b: 26 };
  const W = Math.max(200, width);
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const maxY = Math.max(...points.map((p) => p.y), 1);
  const minY = Math.min(...points.map((p) => p.y));
  const ticks = niceTicks(maxY);
  const top = ticks[ticks.length - 1];
  const step = ticks[1] - ticks[0];
  // Линия не обязана начинаться с нуля: при узком диапазоне поднимаем базу до «круглого» значения
  const base = minY > top * 0.5 ? Math.floor((minY * 0.95) / step) * step : 0;
  const scaleTicks = ticks.filter((t) => t >= base);
  const x = (i: number) => pad.l + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + ih - ((v - base) / (top - base || 1)) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.y)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${pad.t + ih} L ${x(0)} ${pad.t + ih} Z`;
  const last = points[points.length - 1];
  const fmtDay = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={W}
          height={height}
          role="img"
          aria-label={label}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (points.length - 1));
            setHi(Math.max(0, Math.min(points.length - 1, i)));
          }}
          onMouseLeave={() => setHi(null)}
        >
          {scaleTicks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
              <text x={pad.l - 8} y={y(t)} className="axis-text" textAnchor="end" dominantBaseline="middle">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
              <text key={i} x={x(i)} y={height - 6} className="axis-text" textAnchor="middle">
                {fmtDay(p.x)}
              </text>
            ) : null,
          )}
          <path d={area} fill="var(--series-1)" opacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {last && (
            <>
              <circle
                cx={x(points.length - 1)}
                cy={y(last.y)}
                r={4}
                fill="var(--series-1)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
              <text x={x(points.length - 1) + 8} y={y(last.y)} className="end-label" dominantBaseline="middle">
                {fmtAxis(last.y)}
              </text>
            </>
          )}
          {hi !== null && (
            <>
              <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
              <circle
                cx={x(hi)}
                cy={y(points[hi].y)}
                r={4}
                fill="var(--series-1)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      )}
      {hi !== null && (
        <Tooltip x={x(hi)} y={y(points[hi].y)} width={W}>
          <b>{new Date(points[hi].x).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</b>
          <span>
            {label}: {format(points[hi].y)}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Сгруппированные столбцы ----------

export function Columns({
  data,
  series,
  height = 220,
}: {
  data: { x: number; values: number[] }[];
  series: string[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const pad = { l: 56, r: 12, t: 14, b: 26 };
  const W = Math.max(200, width);
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, (band * 0.7 - 2 * (series.length - 1)) / series.length);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const fmtDay = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const bar = (bx: number, v: number) => {
    const h = Math.max(0, (v / top) * ih);
    const r = Math.min(4, h, bw / 2);
    const yb = pad.t + ih;
    return `M ${bx} ${yb} L ${bx} ${yb - h + r} Q ${bx} ${yb - h} ${bx + r} ${yb - h} L ${bx + bw - r} ${yb - h} Q ${bx + bw} ${yb - h} ${bx + bw} ${yb - h + r} L ${bx + bw} ${yb} Z`;
  };
  return (
    <div className="chart" ref={ref}>
      <div className="chart-legend">
        {series.map((s, i) => (
          <span key={s}>
            <i style={{ background: `var(--series-${i + 1})` }} />
            {s}
          </span>
        ))}
      </div>
      {width > 0 && (
        <svg width={W} height={height} role="img" aria-label={series.join(' и ')} onMouseLeave={() => setHi(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
              <text x={pad.l - 8} y={y(t)} className="axis-text" textAnchor="end" dominantBaseline="middle">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const gx = pad.l + i * band + (band - (bw * series.length + 2 * (series.length - 1))) / 2;
            return (
              <g key={d.x} onMouseEnter={() => setHi(i)}>
                <rect x={pad.l + i * band} y={pad.t} width={band} height={ih} fill="transparent" />
                {hi === i && <rect x={pad.l + i * band} y={pad.t} width={band} height={ih} className="band-hover" />}
                {d.values.map((v, k) => (
                  <path key={k} d={bar(gx + k * (bw + 2), v)} fill={`var(--series-${k + 1})`} />
                ))}
                {(i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
                  <text x={pad.l + i * band + band / 2} y={height - 6} className="axis-text" textAnchor="middle">
                    {fmtDay(d.x)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hi !== null && data[hi] && (
        <Tooltip x={pad.l + hi * band + band / 2} y={y(Math.max(...data[hi].values))} width={W}>
          <b>{new Date(data[hi].x).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</b>
          {series.map((s, k) => (
            <span key={s}>
              <i style={{ background: `var(--series-${k + 1})` }} />
              {s}: {data[hi].values[k].toLocaleString('ru-RU')}
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Горизонтальные полосы (заполнение по помещениям, нагрузка стеллажей) ----------

export interface HBarItem {
  key: string;
  label: string;
  sub?: string;
  /** Доля 0..1 (может быть больше 1 — перегруз) */
  value: number;
  display: string;
  color?: string;
  onClick?: () => void;
}

export function HBars({ items, limit = false }: { items: HBarItem[]; limit?: boolean }) {
  return (
    <div className="hbars">
      {items.map((it) => (
        <button
          key={it.key}
          className={`hbar ${it.onClick ? 'clickable' : ''}`}
          onClick={it.onClick}
          disabled={!it.onClick}
        >
          <span className="hbar-label">
            <b>{it.label}</b>
            {it.sub && <em>{it.sub}</em>}
          </span>
          <span className="hbar-track">
            <i
              style={{
                width: `${Math.min(100, Math.max(0, it.value) * 100)}%`,
                background: it.color ?? 'var(--series-1)',
              }}
            />
            {limit && <u />}
          </span>
          <span className="hbar-value">{it.display}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Мини-график ----------

export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = 'var(--series-1)',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const k = max - min || 1;
  const pts = values.map(
    (v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - min) / k) * (height - 6)}`,
  );
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden>
      <polyline
        points={`2,${height - 2} ${pts.join(' ')} ${width - 2},${height - 2}`}
        fill={color}
        opacity={0.12}
        stroke="none"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------- Гистограмма ----------

export function Histogram({
  values,
  labels,
  colors,
  height = 150,
}: {
  values: number[];
  labels: string[];
  colors?: string[];
  height?: number;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="histogram" style={{ height }}>
      {values.map((v, i) => (
        <div key={labels[i]} className="hist-col" title={`${labels[i]}: ${v.toLocaleString('ru-RU')}`}>
          <span className="hist-val">{v.toLocaleString('ru-RU')}</span>
          <span className="hist-bar">
            <i style={{ height: `${(v / max) * 100}%`, background: colors?.[i] ?? 'var(--series-1)' }} />
          </span>
          <span className="hist-label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Несколько линий ----------

export function Lines({
  series,
  height = 220,
  format = (v: number) => v.toLocaleString('ru-RU'),
  max: fixedMax,
}: {
  series: { label: string; color: string; points: { x: number; y: number }[] }[];
  height?: number;
  format?: (v: number) => string;
  max?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const pad = { l: 48, r: 16, t: 14, b: 26 };
  const W = Math.max(200, width);
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = Math.max(...series.map((s) => s.points.length), 1);
  const maxY = fixedMax ?? Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)));
  const ticks = niceTicks(maxY);
  const top = fixedMax ?? ticks[ticks.length - 1];
  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + ih - (v / (top || 1)) * ih;
  const base = series[0]?.points ?? [];
  const fmtDay = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  return (
    <div className="chart" ref={ref}>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {width > 0 && (
        <svg
          width={W}
          height={height}
          role="img"
          aria-label={series.map((s) => s.label).join(', ')}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (n - 1));
            setHi(Math.max(0, Math.min(n - 1, i)));
          }}
          onMouseLeave={() => setHi(null)}
        >
          {(fixedMax ? [0, fixedMax / 4, fixedMax / 2, (fixedMax * 3) / 4, fixedMax] : ticks).map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
              <text x={pad.l - 8} y={y(t)} className="axis-text" textAnchor="end" dominantBaseline="middle">
                {format(t)}
              </text>
            </g>
          ))}
          {base.map((p, i) =>
            i % Math.ceil(n / 6) === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 6} className="axis-text" textAnchor="middle">
                {fmtDay(p.x)}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <path
              key={s.label}
              d={s.points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.y)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hi !== null && (
            <>
              <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
              {series.map(
                (s) =>
                  s.points[hi] && (
                    <circle
                      key={s.label}
                      cx={x(hi)}
                      cy={y(s.points[hi].y)}
                      r={4}
                      fill={s.color}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  ),
              )}
            </>
          )}
        </svg>
      )}
      {hi !== null && base[hi] && (
        <Tooltip x={x(hi)} y={pad.t + 10} width={W}>
          <b>{new Date(base[hi].x).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</b>
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}: {s.points[hi] ? format(s.points[hi].y) : '—'}
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  );
}
