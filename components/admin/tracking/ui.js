"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Shared, dependency-free UI primitives for the tracking admin (toggles,
// badges, stat cards, JSON inspector, and lightweight SVG charts).

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-brand-terracotta" : "bg-gray-300",
        disabled && "opacity-40 cursor-not-allowed"
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        )}
      />
    </button>
  );
}

const STATUS_STYLES = {
  success: "bg-green-100 text-green-700 border-green-200",
  error: "bg-red-100 text-red-700 border-red-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  skipped: "bg-gray-100 text-gray-500 border-gray-200",
};

export function StatusBadge({ status }) {
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border",
        STATUS_STYLES[status] || STATUS_STYLES.skipped
      )}
    >
      {status}
    </span>
  );
}

export function Pill({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-blue-100 text-blue-700",
    violet: "bg-violet-100 text-violet-700",
    terracotta: "bg-brand-terracotta/10 text-brand-terracotta",
  };
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", accent || "text-brand-brown")}>{value}</p>
      {sub != null && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-gray-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className={cn(
        "w-full px-3 py-2 rounded-md border border-gray-300 text-[13px] bg-white",
        "focus:outline-none focus:ring-2 focus:ring-brand-terracotta/40 focus:border-brand-terracotta",
        props.className
      )}
    />
  );
}

export function JsonViewer({ data, maxHeight = 360 }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data ?? null, null, 2);
  return (
    <div className="relative">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 hover:bg-white/20"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre
        className="text-[11px] leading-relaxed bg-[#1b1b1b] text-gray-200 rounded-md p-3 overflow-auto font-mono"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}

// --- Lightweight SVG charts (no chart lib) -------------------------------

export function BarSeries({ data, height = 140, color = "#B85C3A", valueKey = "value", labelKey = "label" }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => {
        const h = ((d[valueKey] || 0) / max) * (height - 22);
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0 group">
            <span className="text-[9px] text-gray-400 mb-0.5 opacity-0 group-hover:opacity-100">
              {d[valueKey]}
            </span>
            <div
              className="w-full rounded-t"
              style={{ height: Math.max(2, h), backgroundColor: color }}
              title={`${d[labelKey]}: ${d[valueKey]}`}
            />
            <span className="text-[8px] text-gray-400 mt-1 truncate w-full text-center">
              {String(d[labelKey]).slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Two stacked series per bucket (e.g. client vs server).
export function StackedBars({ data, height = 160, keys, colors, labelKey = "label" }) {
  const max = Math.max(1, ...data.map((d) => keys.reduce((s, k) => s + (d[k] || 0), 0)));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const total = keys.reduce((s, k) => s + (d[k] || 0), 0);
          const totalH = (total / max) * (height - 18);
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0">
              <div className="w-full flex flex-col-reverse" style={{ height: Math.max(2, totalH) }} title={`${d[labelKey]}: ${total}`}>
                {keys.map((k, ki) => {
                  const seg = total ? ((d[k] || 0) / total) * totalH : 0;
                  return <div key={k} style={{ height: seg, backgroundColor: colors[ki] }} className={ki === 0 ? "rounded-t" : ""} />;
                })}
              </div>
              <span className="text-[8px] text-gray-400 mt-1 truncate w-full text-center">
                {String(d[labelKey]).slice(5)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colors[i] }} /> {k}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CoverageBar({ label, pct, tone = "#B85C3A" }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-400">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tone }} />
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-2 text-gray-400 text-[13px] py-8 justify-center">
      <span className="w-4 h-4 border-2 border-gray-300 border-t-brand-terracotta rounded-full animate-spin" />
      {label}
    </div>
  );
}
