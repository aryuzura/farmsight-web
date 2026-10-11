import React from 'react';

// ---------- Format ----------
export const fmtNum = (v, digits = 1) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
    : '-';

export const fmtRp = (v) =>
  Number.isFinite(Number(v))
    ? `Rp ${Math.round(Number(v)).toLocaleString('id-ID')}`
    : '-';

export const fmtRpCompact = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1e9) return `Rp ${fmtNum(n / 1e9, 1)} M`;
  if (a >= 1e6) return `Rp ${fmtNum(n / 1e6, 1)} jt`;
  if (a >= 1e3) return `Rp ${fmtNum(n / 1e3, 0)} rb`;
  return `Rp ${fmtNum(n, 0)}`;
};

export const fmtPct = (v, digits = 1) =>
  Number.isFinite(Number(v)) ? `${fmtNum(Number(v) * 100, digits)}%` : '-';

export const fmtSigned = (v, formatter = fmtNum) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) < 1e-9) return formatter(0);
  return `${n > 0 ? '+' : '-'}${formatter(Math.abs(n))}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const fmtWeek = (w) => {
  if (!w) return '';
  const [y, m, d] = String(w).split('-');
  if (!d) return `${MONTHS[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
};

// ---------- Komponen dasar ----------
export const CARD = 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm';

export function SectionHeader({ step, title, subtitle, id }) {
  return (
    <div id={id} className="mb-4 flex scroll-mt-28 items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">
        {step}
      </span>
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-xl border border-gray-200 bg-gray-50 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.id ? 'bg-white text-teal-800 shadow-sm' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

export const selectClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20';

export function Slider({ label, value, onChange, min, max, step = 1, format, hint, minLabel, maxLabel, tone = 'teal' }) {
  const pct = ((value - min) / (max - min)) * 100;
  const color = tone === 'amber' ? '#d97706' : tone === 'rose' ? '#e11d48' : '#0f766e';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-gray-900">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--c)] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--c)] [&::-webkit-slider-thumb]:shadow"
        style={{
          '--c': color,
          background: `linear-gradient(to right, ${color} ${pct}%, #e5e7eb ${pct}%)`,
        }}
      />
      <div className="mt-1 flex justify-between text-[11px] text-gray-400">
        <span>{minLabel ?? (format ? format(min) : min)}</span>
        <span>{maxLabel ?? (format ? format(max) : max)}</span>
      </div>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'border-gray-200 bg-white',
    teal: 'border-teal-200 bg-teal-50',
    amber: 'border-amber-200 bg-amber-50',
    rose: 'border-rose-200 bg-rose-50',
    green: 'border-emerald-200 bg-emerald-50',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export function Notice({ tone = 'blue', children }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return <div className={`rounded-xl border p-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-rose-100 text-rose-800',
    teal: 'bg-teal-100 text-teal-800',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
