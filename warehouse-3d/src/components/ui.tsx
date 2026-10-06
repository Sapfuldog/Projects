import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Числовое поле: применяет значение по Enter/потере фокуса, чтобы не плодить шаги отмены. */
export function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  title,
  disabled,
}: {
  label?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  title?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const commit = (raw = text) => {
    const v = Number(raw.replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(v)) return setText(String(value));
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (clamped !== value) onChange(clamped);
    setText(String(clamped));
  };
  return (
    <label className="field" title={title}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input">
        <input
          type="number"
          inputMode="decimal"
          value={text}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onChange={(e) => {
            setText(e.target.value);
            // Стрелки спиннера — применяем сразу
            const ne = e.nativeEvent as InputEvent;
            if (!ne.inputType) commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

export function Text({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const commit = () => text !== value && onChange(text);
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <input
        className={mono ? 'mono' : undefined}
        value={text}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label?: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field color">
      {label && <span className="field-label">{label}</span>}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Section({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="bar">
      <div
        className="bar-fill"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }}
      />
    </div>
  );
}

export function Warn({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="warn">
      {items.map((t) => (
        <div key={t}>⚠ {t}</div>
      ))}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}

export function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
