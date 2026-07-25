// Presentational pieces for the Analytics page.
//
// NOT a client component (same reasoning as components/admin/ui.js): these are
// pure and take Lucide icons as props from Server Components. Every value here
// is DIRECTLY labelled, so none of them needs a hover layer to be readable.
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/admin/ui";
import { cn, formatPrice } from "@/lib/utils";
import { VIZ } from "./palette";

// ── Change vs the previous period ─────────────────────────────────────────────
// `invert` for metrics where up is bad (cancellations, returns). A null change
// means the baseline was zero — growth from nothing isn't a percentage.
export function Delta({ change, invert = false, suffix = "vs prev." }) {
  if (change === null || change === undefined) {
    return <span className="text-[11px] text-brand-tan">No prior data</span>;
  }
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-brand-tan">
        <Minus size={11} /> No change {suffix}
      </span>
    );
  }
  const up = change > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", good ? "text-emerald-600" : "text-red-600")}>
      <Icon size={12} />
      {up ? "+" : ""}{change}%
      <span className="text-brand-tan font-normal ml-0.5">{suffix}</span>
    </span>
  );
}

// KPI tile: label · value · change. The one number a reader scans for.
export function MetricCard({ label, value, change, invert, hint, icon: Icon, accent }) {
  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-brand-tan font-medium">{label}</p>
        {Icon && (
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", accent || "bg-brand-terracotta/10 text-brand-terracotta")}>
            <Icon size={14} />
          </div>
        )}
      </div>
      <p className="text-xl sm:text-2xl font-bold text-brand-brown mt-1.5 tabular-nums truncate">{value}</p>
      <div className="mt-1">
        {change !== undefined ? <Delta change={change} invert={invert} /> : hint && <span className="text-[11px] text-brand-tan">{hint}</span>}
      </div>
      {change !== undefined && hint && <p className="text-[11px] text-brand-tan mt-0.5 truncate">{hint}</p>}
    </Card>
  );
}

// ── Horizontal magnitude bars ─────────────────────────────────────────────────
// Length encodes magnitude; one hue throughout (identity comes from the label
// beside each row, never from the colour). `colors` overrides per row for the
// reserved status palette.
export function BarList({ rows, money = true, colors, emptyText = "Nothing in this period" }) {
  if (!rows?.length) return <p className="text-[13px] text-brand-tan py-6 text-center">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[12px] text-brand-brown truncate">{r.label}</span>
            <span className="text-[12px] font-semibold text-brand-brown tabular-nums whitespace-nowrap">
              {money ? formatPrice(r.value) : r.value.toLocaleString("en-BD")}
              {r.sub && <span className="text-[11px] font-normal text-brand-tan ml-1.5">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-brand-cream-dark/70 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`, background: colors?.[r.key] || VIZ.strong }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// A card wrapper with a title (and optional right-hand slot) for chart blocks.
export function ChartCard({ title, subtitle, action, children, className }) {
  return (
    <Card padded={false} className={cn("min-w-0", className)}>
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-brand-tan/12">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-brand-brown">{title}</h2>
          {subtitle && <p className="text-[11px] text-brand-tan mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}
