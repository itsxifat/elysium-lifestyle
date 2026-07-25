"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { TrendChart } from "./charts";

// The headline chart, with two toggles:
//  · metric — revenue or order count. Two measures of different scale never
//    share a plot (no dual axis), so they get their own view instead.
//  · view — chart or table. The table is the accessible, no-hover path to every
//    value the chart encodes.
const METRICS = [
  { key: "revenue", label: "Revenue" },
  { key: "orders", label: "Orders" },
];

function niceDate(key, granularity) {
  const [y, m, d] = key.split("-").map(Number);
  return granularity === "month"
    ? new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TrendPanel({ series, granularity }) {
  const [metric, setMetric] = useState("revenue");
  const [asTable, setAsTable] = useState(false);

  const tab = "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors";

  return (
    <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-brand-tan/12">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-brand-brown">
            {metric === "revenue" ? "Sales over time" : "Orders over time"}
          </h2>
          <p className="text-[11px] text-brand-tan mt-0.5">
            {granularity === "month" ? "By month" : "By day"} · Bangladesh time · cancelled orders excluded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-brand-cream/60 rounded-lg p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`${tab} ${metric === m.key ? "bg-white text-brand-brown shadow-sm" : "text-brand-tan hover:text-brand-brown"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            title={asTable ? "Show chart" : "Show table"}
            aria-pressed={asTable}
            className="w-8 h-8 rounded-lg border border-brand-tan/25 text-brand-tan hover:text-brand-brown hover:border-brand-brown flex items-center justify-center transition-colors"
          >
            {asTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {asTable ? (
          <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  {["Date", "Orders", "Net sales", "Delivered", "Cancelled"].map((h, i) => (
                    <th key={h} className={`${i ? "text-right" : "text-left"} py-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold whitespace-nowrap`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((r) => (
                  <tr key={r.key} className="border-t border-brand-tan/10">
                    <td className="py-2 px-2 text-[12px] text-brand-brown whitespace-nowrap">{niceDate(r.key, granularity)}</td>
                    <td className="py-2 px-2 text-[12px] text-brand-brown text-right tabular-nums">{r.orders}</td>
                    <td className="py-2 px-2 text-[12px] text-brand-brown text-right tabular-nums font-medium">{formatPrice(r.netSales)}</td>
                    <td className="py-2 px-2 text-[12px] text-brand-tan text-right tabular-nums">{formatPrice(r.collected)}</td>
                    <td className="py-2 px-2 text-[12px] text-brand-tan text-right tabular-nums">{r.cancelled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <TrendChart data={series} granularity={granularity} metric={metric} />
        )}
      </div>
    </div>
  );
}
