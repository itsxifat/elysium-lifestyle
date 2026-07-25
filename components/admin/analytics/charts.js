"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { VIZ } from "./palette";

// Charts for the Analytics page. Plain HTML/CSS marks (no charting library) so
// they stay responsive without measuring the DOM and inherit the panel's type.
// The palette and what each colour means live in ./palette.js.

const compact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
  if (Math.abs(v) >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
};

// Round the axis top up to a clean number so ticks read 0 / 5k / 10k.
function niceMax(value) {
  const v = Number(value) || 0;
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const step = [1, 2, 2.5, 5, 10].find((s) => v <= s * mag) ?? 10;
  return step * mag;
}

// "2026-07-25" / "2026-07" → a short axis label in the store's own date order.
function shortLabel(key, granularity) {
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number);
    // "May 2026", never "May 26" — a 2-digit year reads as a day of the month.
    return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function longLabel(key, granularity) {
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
// Values lead, labels follow. Series are keyed by a short stroke of their color.
function Tooltip({ title, rows, align }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-full mb-2 z-20 min-w-[150px] rounded-lg bg-brand-brown px-3 py-2 shadow-lg ${
        align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-white/50 whitespace-nowrap">{title}</p>
      <div className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 whitespace-nowrap">
            {r.color && <span className="w-2.5 h-[2px] rounded-full flex-shrink-0" style={{ background: r.color }} />}
            <span className="text-[13px] font-semibold text-white tabular-nums">{r.value}</span>
            <span className="text-[11px] text-white/55">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sales / orders over time ──────────────────────────────────────────────────
// Stacked columns: delivered money sits on the baseline, still-in-flight money
// rides on top, separated by a 2px gap in the surface color. `metric="orders"`
// switches to a single-series column chart (one measure per chart — never two
// y-scales on one plot).
export function TrendChart({ data, granularity, metric = "revenue" }) {
  const [active, setActive] = useState(null);

  if (!data?.length) {
    return <div className="h-[240px] flex items-center justify-center text-[13px] text-brand-tan">No sales in this period</div>;
  }

  const isOrders = metric === "orders";
  const totalOf = (d) => (isOrders ? d.orders : d.netSales);
  const max = niceMax(Math.max(...data.map(totalOf), 0));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => ({ f, value: max * f }));

  // Thin the x-labels so they never collide: ~8 across a wide card, ~4 on a
  // phone. Done with responsive classes rather than by measuring the DOM.
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const mobileStep = Math.max(labelStep, Math.ceil(data.length / 4));

  return (
    <div>
      <div className="flex">
        {/* Y axis */}
        <div className="relative w-11 flex-shrink-0 h-[220px]">
          {ticks.map((t) => (
            <span
              key={t.f}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] text-brand-tan tabular-nums"
              style={{ top: `${(1 - t.f) * 100}%` }}
            >
              {isOrders ? Math.round(t.value) : compact(t.value)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative flex-1 min-w-0 h-[220px]">
          {ticks.map((t) => (
            <div
              key={t.f}
              className="absolute left-0 right-0 border-t"
              style={{ top: `${(1 - t.f) * 100}%`, borderColor: VIZ.grid }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const total = totalOf(d);
              const isActive = active === i;
              const collectedPct = max ? (d.collected / max) * 100 : 0;
              const flightPct = max ? Math.max(0, (d.netSales - d.collected) / max) * 100 : 0;
              const ordersPct = max ? (d.orders / max) * 100 : 0;
              const align = i < 2 ? "left" : i > data.length - 3 ? "right" : "center";

              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                  className="relative flex-1 min-w-0 h-full flex flex-col justify-end items-center outline-none focus-visible:bg-brand-cream/60 rounded-t"
                >
                  {isActive && (
                    <Tooltip
                      align={align}
                      title={longLabel(d.key, granularity)}
                      rows={
                        isOrders
                          ? [
                              { label: "orders", value: d.orders, color: VIZ.strong },
                              { label: "cancelled", value: d.cancelled, color: VIZ.soft },
                            ]
                          : [
                              { label: "net sales", value: formatPrice(d.netSales) },
                              { label: "delivered", value: formatPrice(d.collected), color: VIZ.strong },
                              { label: "in flight", value: formatPrice(Math.max(0, d.netSales - d.collected)), color: VIZ.soft },
                            ]
                      }
                    />
                  )}

                  {/* Bars cap at 24px — the slot's leftover width stays as air. */}
                  <div className="w-full max-w-[24px] flex flex-col justify-end h-full" style={{ opacity: isActive || active === null ? 1 : 0.45 }}>
                    {isOrders ? (
                      <div
                        className="w-full rounded-t"
                        style={{ height: `${ordersPct}%`, background: VIZ.strong, minHeight: d.orders ? 2 : 0 }}
                      />
                    ) : (
                      <>
                        <div
                          className="w-full rounded-t"
                          style={{ height: `${flightPct}%`, background: VIZ.soft, minHeight: flightPct > 0 ? 2 : 0 }}
                        />
                        {/* 2px surface gap does the separating — never a stroke. */}
                        {flightPct > 0 && collectedPct > 0 && <div className="h-[2px] flex-shrink-0" style={{ background: VIZ.surface }} />}
                        <div
                          className={`w-full ${flightPct > 0 ? "" : "rounded-t"}`}
                          style={{ height: `${collectedPct}%`, background: VIZ.strong, minHeight: collectedPct > 0 ? 2 : 0 }}
                        />
                      </>
                    )}
                  </div>
                  <span className="sr-only">
                    {longLabel(d.key, granularity)}: {isOrders ? `${d.orders} orders` : formatPrice(total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X axis */}
      <div className="flex mt-2">
        <div className="w-11 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex gap-[2px]">
          {data.map((d, i) => (
            <div key={d.key} className="flex-1 min-w-0 text-center">
              {i % labelStep === 0 && (
                <span
                  className={`text-[10px] text-brand-tan whitespace-nowrap ${i % mobileStep === 0 ? "" : "hidden sm:inline"}`}
                >
                  {shortLabel(d.key, granularity)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend — always present for two series, never for one. */}
      {!isOrders && (
        <div className="flex items-center gap-4 mt-3 pl-11">
          {[
            { label: "Delivered (collected)", color: VIZ.strong },
            { label: "In flight (not yet collected)", color: VIZ.soft },
          ].map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-brand-tan">
              <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small column chart (weekday / hour of day) ────────────────────────────────
// Single measure, single hue — magnitude only, so no legend.
export function ColumnChart({ data, valueLabel = "orders", money = false, height = 120 }) {
  const [active, setActive] = useState(null);
  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const pct = max ? (d.value / max) * 100 : 0;
          const isActive = active === i;
          const align = i < 3 ? "left" : i > data.length - 4 ? "right" : "center";
          return (
            <div
              key={d.key}
              tabIndex={0}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((cur) => (cur === i ? null : cur))}
              className="relative flex-1 min-w-0 h-full flex flex-col justify-end items-center outline-none"
            >
              {isActive && (
                <Tooltip
                  align={align}
                  title={d.label || d.key}
                  rows={[{ label: valueLabel, value: money ? formatPrice(d.value) : d.value, color: VIZ.strong }]}
                />
              )}
              <div
                className="w-full max-w-[24px] rounded-t"
                style={{
                  height: `${pct}%`,
                  minHeight: d.value ? 2 : 0,
                  background: VIZ.strong,
                  opacity: isActive || active === null ? 1 : 0.45,
                }}
              />
              <span className="sr-only">{d.label || d.key}: {d.value}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {data.map((d, i) => (
          <div key={d.key} className="flex-1 min-w-0 text-center">
            {(data.length <= 8 || i % 3 === 0) && (
              <span className="text-[10px] text-brand-tan whitespace-nowrap">{d.key}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
