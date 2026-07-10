"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { DATE_PRESETS } from "@/lib/order-date-range";
import DateOnlyPicker from "./DateOnlyPicker";

// Status tabs, in display order. `all` clears the status filter.
const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

// Colour accent per status for the inactive-tab count badge ("tulip").
const TAB_BADGE = {
  all: "bg-brand-brown/10 text-brand-brown",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function buildUrl(pathname, { status, range, from, to }) {
  const sp = new URLSearchParams();
  if (status && status !== "all") sp.set("status", status);
  if (range && range !== "all") sp.set("range", range);
  if (from) sp.set("from", from);
  if (to) sp.set("to", to);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function OrdersFilterBar({ status = "all", range = "all", from = "", to = "", counts = {}, weekStartsOn = 6 }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);
  useEffect(() => { setCFrom(from); setCTo(to); }, [from, to]);

  const bdToday = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const usingCustom = range === "custom" || (!!from || !!to);
  const activePreset = usingCustom ? "custom" : (range || "all");

  const go = (next) => {
    startTransition(() => router.push(buildUrl(pathname, { status, range, from, to, ...next }), { scroll: false }));
  };

  const pickStatus = (key) => go({ status: key });
  const pickPreset = (key) => go({ range: key, from: "", to: "" });
  const applyCustom = () => {
    if (!cFrom && !cTo) return;
    go({ range: "custom", from: cFrom, to: cTo });
  };

  const tabBase = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors";
  const presetBase = "px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors";

  return (
    <div className={`bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] mb-4 ${pending ? "opacity-70" : ""}`}>
      {/* Status tabs with live counts */}
      <div className="flex flex-wrap gap-1.5 p-3 border-b border-brand-tan/10">
        {STATUS_TABS.map((t) => {
          const active = (status || "all") === t.key;
          const count = counts?.[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => pickStatus(t.key)}
              className={`${tabBase} ${active ? "bg-brand-brown text-white" : "bg-brand-cream/50 text-brand-brown hover:bg-brand-cream"}`}
            >
              {t.label}
              <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold ${active ? "bg-white/25 text-white" : TAB_BADGE[t.key]}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-1.5 p-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-tan mr-1">
          <SlidersHorizontal size={12} /> Date
        </span>
        {DATE_PRESETS.map((p) => {
          const active = activePreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => pickPreset(p.key)}
              className={`${presetBase} ${active ? "bg-brand-terracotta text-white" : "bg-brand-cream/50 text-brand-brown hover:bg-brand-cream"}`}
            >
              {p.label}
            </button>
          );
        })}

        <span className="w-px h-6 bg-brand-tan/15 mx-1 hidden sm:block" />

        <div className="flex items-center gap-1.5 flex-wrap">
          <DateOnlyPicker value={cFrom} onChange={setCFrom} weekStartsOn={weekStartsOn} placeholder="From" max={bdToday} className="w-[150px]" />
          <span className="text-brand-tan text-xs">→</span>
          <DateOnlyPicker value={cTo} onChange={setCTo} weekStartsOn={weekStartsOn} placeholder="To" max={bdToday} className="w-[150px]" />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!cFrom && !cTo}
            className={`${presetBase} border ${activePreset === "custom" ? "bg-brand-terracotta text-white border-brand-terracotta" : "border-brand-tan/30 text-brand-brown hover:border-brand-brown"} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
