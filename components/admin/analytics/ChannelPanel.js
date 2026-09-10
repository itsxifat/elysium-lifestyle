"use client";

import { useState } from "react";
import { BarChart3, Table2, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { ChannelMixChart } from "./charts";
import { CHANNEL_COLORS, SOURCE_COLORS } from "./palette";
import { Delta } from "./parts";

// The channel section of the Analytics page.
//
// Two panels, because "where do the orders come from" is really two questions
// with two different shapes:
//
//   ChannelMixPanel   how the mix MOVED — stacked over time, share or volume
//   ChannelBreakdown  how each channel PERFORMED — every measure, one row each
//
// Both key channels by the same five families and the same fixed hue order (see
// ./palette.js), so a colour means the same thing in the chart, the table and
// the filter bar.

const tab = "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors";
const tabOn = "bg-white text-brand-brown shadow-sm";
const tabOff = "text-brand-tan hover:text-brand-brown";

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex gap-0.5 bg-brand-cream/60 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`${tab} ${value === o.key ? tabOn : tabOff}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function niceDate(key, granularity) {
  const [y, m, d] = key.split("-").map(Number);
  return granularity === "month"
    ? new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Mix over time ─────────────────────────────────────────────────────────────
export function ChannelMixPanel({ series, groups, granularity }) {
  const [metric, setMetric] = useState("netSales");
  const [mode, setMode] = useState("value");
  const [asTable, setAsTable] = useState(false);

  const money = metric === "netSales";
  const present = groups.filter((g) => series.some((d) => (d.parts[g.key]?.orders || 0) > 0));
  const shown = present.length ? present : groups.slice(0, 1);

  return (
    <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-brand-tan/12">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-brand-brown">
            {mode === "share" ? "Channel mix over time" : money ? "Sales by channel over time" : "Orders by channel over time"}
          </h2>
          <p className="text-[11px] text-brand-tan mt-0.5">
            {mode === "share"
              ? "Each period as 100% — volume removed, so quiet and busy periods compare"
              : "Stacked by channel family · cancelled orders excluded"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={metric}
            onChange={setMetric}
            options={[{ key: "netSales", label: "Revenue" }, { key: "orders", label: "Orders" }]}
          />
          <Segmented
            value={mode}
            onChange={setMode}
            options={[{ key: "value", label: "Volume" }, { key: "share", label: "Share" }]}
          />
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
                  <th className="text-left py-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold whitespace-nowrap">
                    {granularity === "month" ? "Month" : "Date"}
                  </th>
                  {shown.map((g) => (
                    <th key={g.key} className="text-right py-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: CHANNEL_COLORS[g.key] }} />
                        {g.label}
                      </span>
                    </th>
                  ))}
                  <th className="text-right py-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {series.map((r) => {
                  const total = shown.reduce((s, g) => s + (r.parts[g.key]?.[metric] || 0), 0);
                  return (
                    <tr key={r.key} className="border-t border-brand-tan/10">
                      <td className="py-2 px-2 text-[12px] text-brand-brown whitespace-nowrap">{niceDate(r.key, granularity)}</td>
                      {shown.map((g) => {
                        const v = r.parts[g.key]?.[metric] || 0;
                        return (
                          <td key={g.key} className="py-2 px-2 text-[12px] text-brand-tan text-right tabular-nums whitespace-nowrap">
                            {v ? (money ? formatPrice(v) : v) : "—"}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-[12px] text-brand-brown text-right tabular-nums font-medium whitespace-nowrap">
                        {money ? formatPrice(total) : total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ChannelMixChart
            data={series}
            groups={shown}
            colors={CHANNEL_COLORS}
            granularity={granularity}
            metric={metric}
            mode={mode}
          />
        )}
      </div>
    </div>
  );
}

// ── Per-channel detail ────────────────────────────────────────────────────────
// Families collapsed by default with their own totals; opening one reveals the
// individual channels inside it. Rates are re-derived per family rather than
// averaged, so a family row is never the mean of its children.
const COLUMNS = [
  { key: "orders", label: "Orders", money: false, hint: "Everything placed, cancellations included" },
  { key: "units", label: "Units", money: false, hint: "Net of returned items" },
  { key: "netSales", label: "Net sales", money: true, hint: "Invoiced, cancellations excluded" },
  { key: "collected", label: "Collected", money: true, hint: "Value of delivered orders" },
  { key: "aov", label: "AOV", money: true, hint: "Net sales per live order" },
  { key: "deliveryRate", label: "Delivery", money: false, suffix: "%", hint: "Delivered as a share of settled orders" },
  { key: "cancelRate", label: "Cancel", money: false, suffix: "%", invert: true, hint: "Cancelled as a share of orders placed" },
];

function Cell({ row, col }) {
  const v = row[col.key] ?? 0;
  const text = col.money ? formatPrice(v) : col.suffix ? `${v}${col.suffix}` : v.toLocaleString("en-BD");
  const tone = col.invert && v >= 20 ? "text-red-600" : "text-brand-brown";
  return <td className={`py-2.5 px-2 text-right text-[12px] tabular-nums whitespace-nowrap ${tone}`}>{text}</td>;
}

export function ChannelBreakdown({ channels, totalNet }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (key) =>
    setOpen((cur) => {
      const next = new Set(cur);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  if (!channels.groups.length) {
    return <p className="text-[13px] text-brand-tan py-6 text-center">No orders in this period</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr>
            <th className="text-left pb-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold">Channel</th>
            {COLUMNS.map((c) => (
              <th key={c.key} title={c.hint} className="text-right pb-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold whitespace-nowrap">
                {c.label}
              </th>
            ))}
            <th className="text-right pb-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold whitespace-nowrap">Share of sales</th>
          </tr>
        </thead>
        <tbody>
          {channels.groups.map((g) => {
            const expanded = open.has(g.key);
            // A family with a single channel in it has nothing to reveal.
            const expandable = g.channels.length > 1;
            return [
              <tr key={g.key} className="border-t border-brand-tan/12 bg-brand-cream/25">
                <td className="py-2.5 px-2">
                  <button
                    type="button"
                    onClick={() => expandable && toggle(g.key)}
                    aria-expanded={expandable ? expanded : undefined}
                    className={`flex items-center gap-2 text-left min-w-0 ${expandable ? "" : "cursor-default"}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CHANNEL_COLORS[g.key] }} />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold text-brand-brown truncate">{g.label}</span>
                      <span className="block text-[10px] text-brand-tan truncate">{g.hint}</span>
                    </span>
                    {expandable && (
                      <ChevronRight
                        size={13}
                        className={`text-brand-tan flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                    )}
                  </button>
                </td>
                {COLUMNS.map((c) => (
                  <Cell key={c.key} row={g} col={c} />
                ))}
                <td className="py-2.5 px-2 w-[140px]">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-[12px] font-semibold text-brand-brown tabular-nums">{g.shareOfSales}%</span>
                    <span className="h-2 w-16 rounded-full bg-brand-cream-dark/70 overflow-hidden flex-shrink-0">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(2, g.shareOfSales)}%`, background: CHANNEL_COLORS[g.key] }}
                      />
                    </span>
                  </div>
                  {g.netSalesChange !== undefined && (
                    <div className="text-right mt-0.5">
                      <Delta change={g.netSalesChange} />
                    </div>
                  )}
                </td>
              </tr>,
              ...(expanded
                ? g.channels.map((c) => (
                    <tr key={`${g.key}-${c.key}`} className="border-t border-brand-tan/8">
                      <td className="py-2 px-2 pl-8">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: SOURCE_COLORS[c.key] || CHANNEL_COLORS[g.key] }} />
                          <span className="text-[12px] text-brand-brown truncate">{c.label}</span>
                        </span>
                      </td>
                      {COLUMNS.map((col) => (
                        <Cell key={col.key} row={c} col={col} />
                      ))}
                      <td className="py-2 px-2 text-right text-[12px] text-brand-tan tabular-nums">{c.shareOfSales}%</td>
                    </tr>
                  ))
                : []),
            ];
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-brand-tan/20">
            <td className="py-2.5 px-2 text-[12px] font-semibold text-brand-brown">All channels</td>
            {COLUMNS.map((c) => {
              // Only the additive columns roll up. An average AOV or an average
              // of delivery rates would be a different number from the store's
              // real one, so those cells stay blank rather than lie.
              if (["aov", "deliveryRate", "cancelRate"].includes(c.key)) {
                return <td key={c.key} className="py-2.5 px-2 text-right text-[12px] text-brand-tan">—</td>;
              }
              const total = channels.groups.reduce((s, g) => s + (g[c.key] || 0), 0);
              return (
                <td key={c.key} className="py-2.5 px-2 text-right text-[12px] font-semibold text-brand-brown tabular-nums whitespace-nowrap">
                  {c.money ? formatPrice(total) : total.toLocaleString("en-BD")}
                </td>
              );
            })}
            <td className="py-2.5 px-2 text-right text-[12px] font-semibold text-brand-brown tabular-nums">{formatPrice(totalNet)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
