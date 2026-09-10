"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, ChevronUp, UserRound, Wrench } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { CHANNEL_COLORS, SOURCE_COLORS, VIZ } from "./palette";
import { Delta } from "./parts";

// Who sold what.
//
// SCOPE, and it matters: every number here comes from orders a person KEYED IN
// (`createdBy`). Storefront, landing-page and ncom orders have no author and are
// deliberately absent — crediting the website to whoever was on shift would make
// the whole board meaningless. The "Keyed in by the team" tile above the table is
// the denominator this is a breakdown of.
//
// Sorting is the control that makes this a tool rather than a list: the same ten
// people rank completely differently by revenue, by units and by delivery rate,
// and which one you sort by is the actual management question.

const ROLE_LABELS = {
  superadmin: "Super Admin",
  admin: "Admin",
  moderator: "Moderator",
  staff: "Staff",
};

const ROLE_TONES = {
  superadmin: "bg-brand-brown/10 text-brand-brown",
  admin: "bg-brand-terracotta/12 text-brand-terracotta",
  moderator: "bg-blue-100 text-blue-700",
  staff: "bg-brand-cream-dark text-brand-tan",
};

// `align` is "right" for every measure; the name column is the only left one.
const COLUMNS = [
  { key: "orders", label: "Orders", hint: "Orders this person created, cancellations included" },
  { key: "units", label: "Units", hint: "Items sold, net of returns" },
  { key: "netSales", label: "Net sales", money: true, hint: "Invoiced value, cancellations excluded" },
  { key: "collected", label: "Collected", money: true, hint: "Value of their orders that were delivered" },
  { key: "aov", label: "AOV", money: true, hint: "Net sales per live order" },
  { key: "unitsPerOrder", label: "Items/order", hint: "How much they add to a basket" },
  { key: "deliveryRate", label: "Delivery", suffix: "%", hint: "Delivered as a share of their settled orders" },
  { key: "cancelRate", label: "Cancel", suffix: "%", invert: true, hint: "Cancelled as a share of their orders" },
  { key: "buyers", label: "Customers", hint: "Distinct buyers served" },
  { key: "activeDays", label: "Days", hint: "Days they logged at least one sale" },
];

function fmt(row, col) {
  const v = row[col.key] ?? 0;
  if (col.money) return formatPrice(v);
  if (col.suffix) return `${v}${col.suffix}`;
  return v.toLocaleString("en-BD");
}

function RolePill({ role, active }) {
  if (!role) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide bg-brand-cream-dark text-brand-tan">
        Account removed
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${ROLE_TONES[role] || ROLE_TONES.staff}`}>
      {ROLE_LABELS[role] || role}
      {!active ? " · inactive" : ""}
    </span>
  );
}

// A person's channel split as one 100%-wide bar. Answers "is this a Facebook
// closer or a counter salesperson" without another table.
function ChannelSplitBar({ channels }) {
  const total = channels.reduce((s, c) => s + c.netSales, 0);
  if (!total) return null;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-brand-cream-dark/70 gap-[2px]">
      {channels.map((c) => (
        <span
          key={c.key}
          title={`${c.label}: ${formatPrice(c.netSales)}`}
          style={{ width: `${(c.netSales / total) * 100}%`, background: SOURCE_COLORS[c.key] || CHANNEL_COLORS[c.group] || VIZ.strong }}
        />
      ))}
    </div>
  );
}

export default function TeamPanel({ team }) {
  const [sort, setSort] = useState({ key: "netSales", dir: "desc" });
  const [open, setOpen] = useState(() => new Set());

  const rows = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...team.members].sort((a, b) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      if (av === bv) return b.netSales - a.netSales; // stable, meaningful tiebreak
      return av > bv ? dir : -dir;
    });
  }, [team.members, sort]);

  const toggleSort = (key) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const toggleRow = (id) =>
    setOpen((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (!team.members.length && !team.processors.length) {
    return (
      <div className="text-center py-12 px-4">
        <UserRound size={28} className="mx-auto text-brand-tan/40 mb-3" strokeWidth={1.5} />
        <p className="text-brand-brown font-medium">Nobody keyed in an order</p>
        <p className="text-[13px] text-brand-tan mt-1 max-w-sm mx-auto">
          Manual and POS orders created from the admin panel are credited here. Storefront and
          landing-page orders have no author, so they never appear.
        </p>
      </div>
    );
  }

  const best = rows[0];

  return (
    <div className="space-y-4">
      {team.members.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left pb-2 px-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold">Staff member</th>
                {COLUMNS.map((c) => {
                  const on = sort.key === c.key;
                  const Arrow = sort.dir === "asc" ? ChevronUp : ChevronDown;
                  return (
                    <th
                      key={c.key}
                      className="pb-2 px-2"
                      aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        title={`${c.hint} — click to sort`}
                        className={`w-full inline-flex items-center justify-end gap-0.5 text-[10px] uppercase tracking-[1.5px] font-semibold whitespace-nowrap transition-colors ${
                          on ? "text-brand-terracotta" : "text-brand-tan hover:text-brand-brown"
                        }`}
                      >
                        {c.label}
                        {on && <Arrow size={11} />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const expanded = open.has(m.id);
                return [
                  <tr key={m.id} className="border-t border-brand-tan/10">
                    <td className="py-2.5 px-2 min-w-[210px]">
                      <button
                        type="button"
                        onClick={() => toggleRow(m.id)}
                        aria-expanded={expanded}
                        className="flex items-start gap-2 text-left w-full min-w-0"
                      >
                        <span className="w-5 text-[11px] text-brand-tan tabular-nums pt-0.5 flex-shrink-0">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[12.5px] font-medium text-brand-brown truncate">{m.name}</span>
                            {m === best && sort.key === "netSales" && sort.dir === "desc" && (
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-terracotta flex-shrink-0">Top</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 mt-0.5">
                            <RolePill role={m.role} active={m.active} />
                          </span>
                          <span className="block mt-1.5 max-w-[170px]">
                            <ChannelSplitBar channels={m.channels} />
                          </span>
                        </span>
                        <ChevronRight size={13} className={`text-brand-tan flex-shrink-0 mt-0.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
                      </button>
                    </td>
                    {COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`py-2.5 px-2 text-right text-[12px] tabular-nums whitespace-nowrap align-top ${
                          c.invert && (m[c.key] ?? 0) >= 20
                            ? "text-red-600"
                            : sort.key === c.key
                            ? "text-brand-brown font-semibold"
                            : "text-brand-brown"
                        }`}
                      >
                        {fmt(m, c)}
                        {c.key === "netSales" && m.netSalesChange !== undefined && (
                          <span className="block font-normal">
                            <Delta change={m.netSalesChange} suffix="" />
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>,
                  ...(expanded
                    ? [
                        <tr key={`${m.id}-detail`} className="border-t border-brand-tan/8 bg-brand-cream/25">
                          <td colSpan={COLUMNS.length + 1} className="px-2 py-4">
                            <div className="grid gap-5 md:grid-cols-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold mb-2">Channels sold through</p>
                                {m.channels.length === 0 ? (
                                  <p className="text-[12px] text-brand-tan">No channel recorded</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {m.channels.map((c) => (
                                      <li key={c.key} className="flex items-baseline justify-between gap-3">
                                        <span className="inline-flex items-center gap-1.5 min-w-0">
                                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: SOURCE_COLORS[c.key] || CHANNEL_COLORS[c.group] }} />
                                          <span className="text-[12px] text-brand-brown truncate">{c.label}</span>
                                        </span>
                                        <span className="text-[12px] text-brand-brown tabular-nums whitespace-nowrap">
                                          {formatPrice(c.netSales)}
                                          <span className="text-[11px] text-brand-tan ml-1.5">
                                            {c.orders} order{c.orders === 1 ? "" : "s"} · {c.units} unit{c.units === 1 ? "" : "s"}
                                          </span>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div>
                                <p className="text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold mb-2">Work on orders</p>
                                <p className="text-[12px] text-brand-brown">
                                  Processed <span className="font-semibold tabular-nums">{m.ordersTouched}</span> order
                                  {m.ordersTouched === 1 ? "" : "s"} in <span className="font-semibold tabular-nums">{m.actions}</span> action
                                  {m.actions === 1 ? "" : "s"}
                                </p>
                                {m.actionBreakdown.length > 0 ? (
                                  <ul className="mt-2 space-y-1">
                                    {m.actionBreakdown.map((a) => (
                                      <li key={a.key} className="flex items-baseline justify-between gap-3">
                                        <span className="text-[12px] text-brand-tan truncate">{a.label}</span>
                                        <span className="text-[12px] text-brand-brown tabular-nums">{a.n}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[11px] text-brand-tan mt-1.5">
                                    No audited changes in this period — audit entries are written on PIN-gated edits only.
                                  </p>
                                )}
                              </div>

                              <div>
                                <p className="text-[10px] uppercase tracking-[1.5px] text-brand-tan font-semibold mb-2">Pace &amp; money</p>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                                  {[
                                    { label: "Orders / active day", value: m.ordersPerActiveDay },
                                    { label: "Share of team sales", value: `${m.shareOfSales}%` },
                                    { label: "Discounts given", value: formatPrice(m.discounts) },
                                    { label: "Still in flight", value: formatPrice(m.inFlight) },
                                    { label: "Cancelled value", value: formatPrice(m.cancelledValue) },
                                    {
                                      label: "Last sale",
                                      value: m.lastOrderAt
                                        ? new Date(m.lastOrderAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                                        : "—",
                                    },
                                  ].map((s) => (
                                    <div key={s.label} className="min-w-0">
                                      <dt className="text-[11px] text-brand-tan truncate">{s.label}</dt>
                                      <dd className="text-[13px] font-semibold text-brand-brown tabular-nums">{s.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            </div>
                          </td>
                        </tr>,
                      ]
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* People who never create an order but move every one of them along.
          Kept off the sales table so it stays a sales table. */}
      {team.processors.length > 0 && (
        <div className="pt-4 border-t border-brand-tan/12">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Wrench size={12} className="text-brand-tan" />
            <h3 className="text-[11px] uppercase tracking-[1.5px] text-brand-tan font-semibold">Processed orders, sold none</h3>
          </div>
          <p className="text-[11px] text-brand-tan mb-3 max-w-2xl">
            Read off the order audit trail and windowed on when the work happened, not when the order
            was placed — so somebody who spent the week pushing other people&apos;s orders through is
            visible here rather than nowhere.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {team.processors.map((p) => (
              <li key={p.id} className="border border-brand-tan/15 rounded-lg px-3 py-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-brand-brown truncate">{p.name}</span>
                  <RolePill role={p.role} active={p.active} />
                </div>
                <p className="text-[11px] text-brand-tan mt-1">
                  <span className="font-semibold text-brand-brown tabular-nums">{p.ordersTouched}</span> order
                  {p.ordersTouched === 1 ? "" : "s"} ·{" "}
                  <span className="font-semibold text-brand-brown tabular-nums">{p.actions}</span> action
                  {p.actions === 1 ? "" : "s"}
                </p>
                <p className="text-[10px] text-brand-tan mt-1 truncate">
                  {p.actionBreakdown.map((a) => `${a.label} ${a.n}`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
