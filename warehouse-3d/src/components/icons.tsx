import type { ReactElement } from 'react';

const P: Record<string, ReactElement> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  warehouse: (
    <>
      <path d="M3 21V8.5L12 4l9 4.5V21" />
      <path d="M7 21v-8h10v8M7 17h10" />
    </>
  ),
  boxes: (
    <>
      <path d="M3 7.5 12 3l9 4.5-9 4.5z" />
      <path d="M3 7.5V16l9 4.5 9-4.5V7.5M12 12v8.5" />
    </>
  ),
  truck: (
    <>
      <path d="M2 6h11v10H2zM13 9h4l4 4v3h-8" />
      <circle cx="6" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  inbound: (
    <>
      <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" />
      <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
    </>
  ),
  orders: (
    <>
      <path d="M7 4h10a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M9.5 9h5M9.5 13h5M9.5 17h3" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  plan: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
      <path d="M3.5 10h7v10.5M10.5 3.5V7M14 10h6.5" />
    </>
  ),
  split: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M12 4.5v15" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5" />
    </>
  ),
  filter: <path d="M3.5 5h17l-6.5 8v6l-4 1.5V13z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  move: (
    <>
      <path d="M4 12h16M15 7l5 5-5 5" />
      <path d="M9 7 4 12" opacity="0" />
    </>
  ),
  count: (
    <>
      <path d="M7 4h10a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="m9 12.5 2 2 4-4.5" />
    </>
  ),
  shipment: (
    <>
      <path d="M12 14V3M7.5 7.5 12 3l4.5 4.5" />
      <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="1" />
      <path d="M8 8h2M14 8h2M8 12h2M14 12h2M10.5 20.5v-4h3v4" />
    </>
  ),
  zone: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" strokeDasharray="3 2.5" />
      <path d="M8 16V9h8" />
    </>
  ),
  rack: (
    <>
      <path d="M5 3v18M19 3v18M5 7h14M5 12h14M5 17h14" />
    </>
  ),
  cells: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
      <path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17" />
    </>
  ),
  forklift: (
    <>
      <path d="M3 17V9h6l2 4h2v4M13 4v13M13 15h7" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="11" cy="18" r="1.5" />
    </>
  ),
  dots: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4.5M12 17v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.5v.5" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  undo: <path d="M9 7 4.5 11.5 9 16M5 11.5h9a5.5 5.5 0 0 1 0 11" />,
  redo: <path d="m15 7 4.5 4.5L15 16M19 11.5h-9a5.5 5.5 0 0 0 0 11" />,
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 19.5h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 19.5h16" />
    </>
  ),
  edit: <path d="m15 4.5 4.5 4.5L9 19.5H4.5V15z" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {P[name]}
    </svg>
  );
}

// ---------- Изометрические иллюстрации для палитры ----------

interface IsoBox {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  c: string;
  o?: number;
}

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Рисует набор коробок в изометрии (x — вправо-вниз, y — влево-вниз, z — вверх). */
function Iso({ boxes, scale = 6, ox = 36, oy = 34 }: { boxes: IsoBox[]; scale?: number; ox?: number; oy?: number }) {
  const pr = (x: number, y: number, z: number) => [ox + (x - y) * C30 * scale, oy + (x + y) * S30 * scale - z * scale];
  const sorted = [...boxes].sort((a, b) => a.x + a.y + a.z * 0.01 - (b.x + b.y + b.z * 0.01));
  return (
    <svg viewBox="0 0 72 60" width="72" height="60" aria-hidden>
      {sorted.map((b, i) => {
        const { x, y, z, w, d, h, c } = b;
        const pts = (list: number[][]) => list.map((p) => pr(p[0], p[1], p[2]).join(',')).join(' ');
        const top = pts([
          [x, y, z + h],
          [x + w, y, z + h],
          [x + w, y + d, z + h],
          [x, y + d, z + h],
        ]);
        const right = pts([
          [x + w, y, z],
          [x + w, y + d, z],
          [x + w, y + d, z + h],
          [x + w, y, z + h],
        ]);
        const left = pts([
          [x, y + d, z],
          [x + w, y + d, z],
          [x + w, y + d, z + h],
          [x, y + d, z + h],
        ]);
        return (
          <g key={i} opacity={b.o ?? 1}>
            <polygon points={right} fill={shade(c, 0.72)} />
            <polygon points={left} fill={shade(c, 0.88)} />
            <polygon points={top} fill={shade(c, 1.08)} />
          </g>
        );
      })}
    </svg>
  );
}

const rackBoxes = (color = '#1e40af', beam = '#ea580c', cargo = true): IsoBox[] => {
  const b: IsoBox[] = [];
  for (const x of [0, 3, 6]) for (const y of [0, 1.6]) b.push({ x, y, z: 0, w: 0.25, d: 0.25, h: 5.5, c: color });
  for (const z of [1.7, 3.5, 5.3])
    for (const y of [0, 1.35]) b.push({ x: 0, y, z, w: 6.25, d: 0.25, h: 0.25, c: beam });
  if (cargo)
    for (const [x, z, c] of [
      [0.5, 0, '#d4a373'],
      [3.4, 0, '#60a5fa'],
      [0.5, 1.95, '#f59e0b'],
      [3.4, 3.75, '#d4a373'],
    ] as [number, number, string][])
      b.push({ x, y: 0.2, z, w: 2.2, d: 1.4, h: 1.4, c });
  return b;
};

export const ILLUSTRATIONS: Record<string, () => ReactElement> = {
  wall: () => <Iso boxes={[{ x: -1, y: 0, z: 0, w: 8, d: 0.6, h: 4.5, c: '#9aa4b2' }]} />,
  partition: () => <Iso boxes={[{ x: -1, y: 0.5, z: 0, w: 8, d: 0.3, h: 3.5, c: '#cbd5e1', o: 0.85 }]} />,
  door: () => (
    <Iso
      boxes={[
        { x: 1, y: 0, z: 0, w: 0.4, d: 0.4, h: 5.5, c: '#64748b' },
        { x: 1.4, y: 0, z: 0, w: 2.6, d: 0.3, h: 5, c: '#94a3b8' },
        { x: 4, y: 0, z: 0, w: 0.4, d: 0.4, h: 5.5, c: '#64748b' },
      ]}
    />
  ),
  gate: () => (
    <Iso
      boxes={[
        { x: -1, y: 0, z: 0, w: 0.5, d: 0.5, h: 5, c: '#64748b' },
        ...[0, 1, 2, 3].map((i) => ({ x: -0.5, y: 0.1, z: i * 1.15, w: 6.5, d: 0.3, h: 1.05, c: '#94a3b8' })),
        { x: 6, y: 0, z: 0, w: 0.5, d: 0.5, h: 5, c: '#64748b' },
      ]}
    />
  ),
  column: () => <Iso boxes={[{ x: 2, y: 2, z: 0, w: 1.2, d: 1.2, h: 7, c: '#9aa4b2' }]} />,
  dock: () => (
    <Iso
      boxes={[
        { x: 0, y: 0, z: 0, w: 6, d: 4, h: 1.6, c: '#475569' },
        { x: 1, y: 2.2, z: 1.6, w: 4, d: 1.8, h: 0.15, c: '#9ca3af' },
        { x: 0, y: 4, z: 0.6, w: 6, d: 0.3, h: 0.5, c: '#facc15' },
      ]}
      oy={30}
    />
  ),
  conveyor: () => (
    <Iso
      boxes={[
        { x: -1, y: 1, z: 0, w: 0.3, d: 0.3, h: 1.6, c: '#334155' },
        { x: 6.5, y: 1, z: 0, w: 0.3, d: 0.3, h: 1.6, c: '#334155' },
        { x: -1.5, y: 0.6, z: 1.6, w: 9, d: 1.8, h: 0.35, c: '#94a3b8' },
        { x: 0, y: 0.9, z: 1.95, w: 1.6, d: 1.2, h: 1, c: '#d4a373' },
        { x: 4, y: 0.9, z: 1.95, w: 1.6, d: 1.2, h: 1, c: '#d4a373' },
      ]}
    />
  ),
  forklift: () => (
    <Iso
      boxes={[
        { x: 0, y: 0, z: 0.4, w: 3.5, d: 2.2, h: 1.6, c: '#f59e0b' },
        { x: 0.3, y: 0.2, z: 2, w: 0.2, d: 0.2, h: 2.4, c: '#111827' },
        { x: 0.3, y: 1.8, z: 2, w: 0.2, d: 0.2, h: 2.4, c: '#111827' },
        { x: 0.2, y: 0, z: 4.3, w: 2.8, d: 2.2, h: 0.2, c: '#111827' },
        { x: 3.5, y: 0.3, z: 0, w: 0.3, d: 1.6, h: 5, c: '#4b5563' },
        { x: 3.8, y: 0.4, z: 0.2, w: 2.4, d: 0.3, h: 0.15, c: '#6b7280' },
        { x: 3.8, y: 1.3, z: 0.2, w: 2.4, d: 0.3, h: 0.15, c: '#6b7280' },
      ]}
      ox={30}
      oy={38}
    />
  ),
  truck: () => (
    <Iso
      boxes={[
        { x: -3, y: 0, z: 0.8, w: 7, d: 2.4, h: 3, c: '#e2e8f0' },
        { x: 4.2, y: 0, z: 0.8, w: 1.8, d: 2.4, h: 2.2, c: '#2563eb' },
      ]}
      ox={38}
      oy={36}
    />
  ),
  workzone: () => (
    <Iso
      boxes={[
        { x: -1, y: -1, z: 0, w: 8, d: 5, h: 0.1, c: '#22c55e', o: 0.6 },
        { x: 0, y: 0.5, z: 1.4, w: 2.6, d: 1.4, h: 0.2, c: '#e5e7eb' },
        { x: 3.6, y: 0.5, z: 1.4, w: 2.6, d: 1.4, h: 0.2, c: '#e5e7eb' },
        { x: 0.4, y: 0.7, z: 1.6, w: 1, d: 0.8, h: 0.8, c: '#d4a373' },
        { x: 1.2, y: 1, z: 0, w: 0.2, d: 0.2, h: 1.4, c: '#64748b' },
        { x: 4.8, y: 1, z: 0, w: 0.2, d: 0.2, h: 1.4, c: '#64748b' },
      ]}
    />
  ),
  office: () => (
    <Iso
      boxes={[
        { x: 0, y: 0, z: 0, w: 6, d: 4, h: 0.15, c: '#64748b' },
        { x: 0, y: 0, z: 0, w: 6, d: 0.2, h: 3, c: '#38bdf8', o: 0.6 },
        { x: 0, y: 0, z: 0, w: 0.2, d: 4, h: 3, c: '#38bdf8', o: 0.6 },
        { x: 1, y: 1.5, z: 0.15, w: 2, d: 1, h: 1, c: '#e2e8f0' },
        { x: 3.6, y: 1.5, z: 0.15, w: 2, d: 1, h: 1, c: '#e2e8f0' },
      ]}
    />
  ),
  toilet: () => (
    <Iso
      boxes={[
        { x: 1, y: 1, z: 0, w: 3.5, d: 3, h: 4.5, c: '#a78bfa' },
        { x: 4.5, y: 1.8, z: 0, w: 0.1, d: 1.2, h: 2.8, c: '#ede9fe' },
      ]}
    />
  ),
  'rack-pallet': () => <Iso boxes={rackBoxes()} scale={4.6} ox={36} oy={40} />,
  'rack-pallet2': () => <Iso boxes={rackBoxes('#1e40af', '#ea580c', false)} scale={4.6} ox={36} oy={40} />,
  'rack-shelf': () => (
    <Iso
      boxes={[
        ...[0, 6].flatMap((x) => [0, 1.6].map((y) => ({ x, y, z: 0, w: 0.2, d: 0.2, h: 6, c: '#64748b' }))),
        ...[0.4, 1.8, 3.2, 4.6, 6].map((z) => ({ x: 0, y: 0, z, w: 6.2, d: 1.8, h: 0.12, c: '#cbd5e1' })),
        { x: 0.5, y: 0.3, z: 0.52, w: 1.2, d: 1.1, h: 0.9, c: '#d4a373' },
        { x: 3.5, y: 0.3, z: 1.92, w: 1.4, d: 1.1, h: 0.9, c: '#60a5fa' },
        { x: 1.6, y: 0.3, z: 3.32, w: 1.2, d: 1.1, h: 0.9, c: '#f59e0b' },
      ]}
      scale={4.6}
      ox={36}
      oy={42}
    />
  ),
  'rack-rows': () => (
    <Iso
      boxes={[0, 2.6, 5.2].flatMap((y) => [{ x: -2, y, z: 0, w: 9, d: 1.1, h: 3.4, c: '#1e40af' }])}
      scale={4.2}
      ox={38}
      oy={30}
    />
  ),
  'room-rect': () => (
    <Iso boxes={[{ x: -2, y: -1, z: 0, w: 9, d: 7, h: 2.6, c: '#64748b', o: 0.9 }]} scale={4.6} oy={32} />
  ),
  'room-L': () => (
    <Iso
      boxes={[
        { x: -2, y: -1, z: 0, w: 9, d: 3.5, h: 2.6, c: '#64748b' },
        { x: -2, y: 2.5, z: 0, w: 4, d: 4, h: 2.6, c: '#64748b' },
      ]}
      scale={4.6}
      oy={32}
    />
  ),
  'room-U': () => (
    <Iso
      boxes={[
        { x: -2, y: -1, z: 0, w: 9, d: 3, h: 2.6, c: '#64748b' },
        { x: -2, y: 2, z: 0, w: 3, d: 4.5, h: 2.6, c: '#64748b' },
        { x: 4, y: 2, z: 0, w: 3, d: 4.5, h: 2.6, c: '#64748b' },
      ]}
      scale={4.6}
      oy={32}
    />
  ),
  'room-T': () => (
    <Iso
      boxes={[
        { x: -2, y: -1, z: 0, w: 9, d: 3, h: 2.6, c: '#64748b' },
        { x: 1, y: 2, z: 0, w: 3, d: 4.5, h: 2.6, c: '#64748b' },
      ]}
      scale={4.6}
      oy={32}
    />
  ),
  draw: () => (
    <svg viewBox="0 0 72 60" width="72" height="60" aria-hidden>
      <polygon
        points="12,44 24,14 52,10 62,36 38,50"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
      {[
        [12, 44],
        [24, 14],
        [52, 10],
        [62, 36],
        [38, 50],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#0b1220" stroke="#60a5fa" strokeWidth="2" />
      ))}
    </svg>
  ),
  zone: () => <Iso boxes={[{ x: -2, y: -1, z: 0, w: 9, d: 7, h: 0.3, c: '#3b82f6', o: 0.85 }]} scale={4.6} oy={34} />,
};

export function Illustration({ name }: { name: string }) {
  const I = ILLUSTRATIONS[name];
  return I ? <I /> : null;
}
