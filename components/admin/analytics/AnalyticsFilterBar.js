"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CalendarRange, Check, ChevronDown, Radio, UserRound, X } from "lucide-react";
import { ANALYTICS_PRESETS } from "@/lib/order-date-range";
import DateOnlyPicker from "@/components/admin/DateOnlyPicker";
import { CHANNEL_COLORS, SOURCE_COLORS } from "./palette";

// One row of filters above everything they scope — every stat, chart and table
// on the page re-renders against the same slice, so the numbers always agree.
//
// Three controls, in the order a reader reaches for them: WHEN, THROUGH WHAT,
// and BY WHOM. The last two are what turn the page from a report into something
// you can interrogate: "show me only WhatsApp", "show me only Rifat's sales".
//
// Custom popovers rather than native <select>: the options carry channel colour
// chips and role labels, which a native option list cannot render.

function buildUrl(pathname, { range, from, to, channel, staff }) {
  const sp = new URLSearchParams();
  if (range && range !== "last_30_days") sp.set("range", range);
  if (from) sp.set("from", from);
  if (to) sp.set("to", to);
  if (channel) sp.set("channel", channel);
  if (staff) sp.set("staff", staff);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// Generic popover picker. `options` is a flat list of
// { value, label, hint, color, group } — `group` starts a labelled section.
function Picker({ icon: Icon, value, options, onChange, placeholder, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-lg border text-[12px] text-left transition-colors ${
          value
            ? "border-brand-terracotta/40 bg-brand-terracotta/8 text-brand-brown"
            : "border-brand-tan/30 bg-white text-brand-brown hover:border-brand-brown/50"
        }`}
      >
        {selected?.color ? (
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: selected.color }} />
        ) : (
          <Icon size={13} className="text-brand-tan flex-shrink-0" />
        )}
        <span className={`flex-1 truncate ${selected ? "" : "text-brand-tan"}`}>{selected?.label || placeholder}</span>
        {value ? (
          <X
            size={13}
            aria-label="Clear filter"
            className="text-brand-tan hover:text-red-500 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onChange(""); }}
          />
        ) : (
          <ChevronDown size={13} className="text-brand-tan flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 left-0 min-w-full w-[240px] max-h-[320px] overflow-y-auto rounded-lg border border-brand-tan/20 bg-white shadow-lg py-1">
          {options.map((o, i) => (
            <div key={o.value || `all-${i}`}>
              {o.group && (
                <p className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-[1.5px] text-brand-tan font-semibold">{o.group}</p>
              )}
              <button
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                  o.value === value ? "bg-brand-cream text-brand-brown" : "text-brand-brown hover:bg-brand-cream/60"
                } ${o.indent ? "pl-7" : ""}`}
              >
                {o.color ? (
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: o.color }} />
                ) : (
                  <span className="w-2.5 flex-shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block text-[10px] text-brand-tan truncate">{o.hint}</span>}
                </span>
                {o.value === value && <Check size={12} className="text-brand-terracotta flex-shrink-0" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsFilterBar({
  range = "last_30_days",
  from = "",
  to = "",
  channel = "",
  staff = "",
  weekStartsOn = 6,
  channelGroups = [],
  sourceLabels = {},
  staffDirectory = [],
  roleLabels = {},
}) {
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
    startTransition(() =>
      router.push(buildUrl(pathname, { range, from, to, channel, staff, ...next }), { scroll: false })
    );
  };

  // Families first (the coarse cut most people want), each followed by the
  // individual channels inside it — same order and same colours as the charts.
  const channelOptions = [
    { value: "", label: "All channels" },
    ...channelGroups.flatMap((g) => [
      { value: g.key, label: g.label, hint: g.hint, color: CHANNEL_COLORS[g.key], group: g.label },
      ...(g.sources.length > 1
        ? g.sources.map((s) => ({
            value: s,
            label: sourceLabels[s] || s,
            color: SOURCE_COLORS[s],
            indent: true,
          }))
        : []),
    ]),
  ];

  const staffOptions = [
    { value: "", label: "Anyone" },
    { value: "any", label: "Keyed in by staff", hint: "Any manual / POS order", group: "By origin" },
    { value: "self", label: "Not keyed in by anyone", hint: "Storefront, /lp and partner orders" },
    ...staffDirectory.map((u, i) => ({
      value: u.id,
      label: u.name,
      hint: roleLabels[u.role] || u.role,
      ...(i === 0 ? { group: "Staff member" } : {}),
    })),
  ];

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

      {/* Dimension filters. Their own row so the date presets never wrap into
          them and the two scopes read as a pair. */}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-0 border-t border-brand-tan/10 -mt-px sm:pt-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-tan mr-1">
          <Radio size={12} /> Channel
        </span>
        <Picker
          icon={Radio}
          value={channel}
          options={channelOptions}
          onChange={(v) => go({ channel: v })}
          placeholder="All channels"
          className="w-[190px]"
        />

        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-tan ml-1 mr-1">
          <UserRound size={12} /> Created by
        </span>
        <Picker
          icon={UserRound}
          value={staff}
          options={staffOptions}
          onChange={(v) => go({ staff: v })}
          placeholder="Anyone"
          className="w-[190px]"
        />

        {(channel || staff) && (
          <button
            type="button"
            onClick={() => go({ channel: "", staff: "" })}
            className="text-[11px] text-brand-tan hover:text-brand-brown underline underline-offset-2 ml-1"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
