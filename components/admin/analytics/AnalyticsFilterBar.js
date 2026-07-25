"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { ANALYTICS_PRESETS } from "@/lib/order-date-range";
import DateOnlyPicker from "@/components/admin/DateOnlyPicker";

// One row of filters above everything they scope — every stat, chart and table
// on the page re-renders against the same slice, so the numbers always agree.
// Date range first: it's the control every reader reaches for.
function buildUrl(pathname, { range, from, to }) {
  const sp = new URLSearchParams();
  if (range && range !== "last_30_days") sp.set("range", range);
  if (from) sp.set("from", from);
  if (to) sp.set("to", to);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function AnalyticsFilterBar({ range = "last_30_days", from = "", to = "", weekStartsOn = 6 }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);
  useEffect(() => { setCFrom(from); setCTo(to); }, [from, to]);

  const bdToday = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const usingCustom = range === "custom" || !!from || !!to;
  const activePreset = usingCustom ? "custom" : range;

  const go = (next) => {
    startTransition(() => router.push(buildUrl(pathname, { range, from, to, ...next }), { scroll: false }));
  };

  const base = "px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors";

  return (
    <div className={`bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] mb-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5 p-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-tan mr-1">
          <CalendarRange size={12} /> Period
        </span>
        {ANALYTICS_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => go({ range: p.key, from: "", to: "" })}
            className={`${base} ${activePreset === p.key ? "bg-brand-terracotta text-white" : "bg-brand-cream/50 text-brand-brown hover:bg-brand-cream"}`}
          >
            {p.label}
          </button>
        ))}

        <span className="w-px h-6 bg-brand-tan/15 mx-1 hidden sm:block" />

        <div className="flex items-center gap-1.5 flex-wrap">
          <DateOnlyPicker value={cFrom} onChange={setCFrom} weekStartsOn={weekStartsOn} placeholder="From" max={bdToday} className="w-[150px]" />
          <span className="text-brand-tan text-xs">→</span>
          <DateOnlyPicker value={cTo} onChange={setCTo} weekStartsOn={weekStartsOn} placeholder="To" max={bdToday} className="w-[150px]" />
          <button
            type="button"
            onClick={() => (cFrom || cTo) && go({ range: "custom", from: cFrom, to: cTo })}
            disabled={!cFrom && !cTo}
            className={`${base} border ${activePreset === "custom" ? "bg-brand-terracotta text-white border-brand-terracotta" : "border-brand-tan/30 text-brand-brown hover:border-brand-brown"} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
