"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/admin/ui";

// ── Formatting ────────────────────────────────────────────────────────────────

// Money is always whole taka here — no shop in this market quotes poisha, and
// the extra ".00" costs a column's worth of width on a phone.
export function taka(n) {
  const v = Number(n) || 0;
  return "৳" + Math.round(v).toLocaleString("en-BD");
}

// Compact form for stat cards, where ৳1,247,300 would wrap.
export function takaShort(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 10000000) return "৳" + (v / 10000000).toFixed(2) + "cr";
  if (v >= 100000) return "৳" + (v / 100000).toFixed(2) + "L";
  if (v >= 1000) return "৳" + (v / 1000).toFixed(1) + "k";
  return "৳" + v.toLocaleString("en-BD");
}

export function shortDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

// "3 days ago" reads faster than a date when the question is "is this recent".
export function timeAgo(d) {
  if (!d) return "Never";
  const ms = Date.now() - new Date(d).getTime();
  const day = 86400000;
  if (ms < 0) return "just now";
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + "m ago";
  if (ms < day) return Math.round(ms / 3600000) + "h ago";
  const days = Math.round(ms / day);
  if (days < 31) return days + "d ago";
  if (days < 365) return Math.round(days / 30) + "mo ago";
  return Math.round(days / 365) + "y ago";
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A stable colour per customer so the same person looks the same on every visit.
const AVATAR_TONES = [
  "bg-brand-terracotta", "bg-brand-brown", "bg-brand-tan",
  "bg-emerald-600", "bg-blue-600", "bg-amber-600", "bg-rose-600", "bg-violet-600",
];
export function avatarTone(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export const CHANNEL_LABELS = {
  website: "Website",
  landing_page: "Landing page",
  ncom: "ncom.bd",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  phone: "Phone",
  offline: "Walk-in",
  other: "Other",
};
export const channelLabel = (c) => CHANNEL_LABELS[c] || c || "Website";

const CHANNEL_TONES = {
  website: "brown", landing_page: "terracotta", ncom: "blue",
  facebook: "blue", instagram: "red", whatsapp: "green",
  phone: "amber", offline: "gray", other: "gray",
};
export const channelTone = (c) => CHANNEL_TONES[c] || "gray";

// ── Presentational bits ───────────────────────────────────────────────────────

export function Avatar({ user, size = "sm" }) {
  const cls = {
    xs: "w-7 h-7 text-[10px]",
    sm: "w-9 h-9 text-[11px]",
    lg: "w-16 h-16 text-xl",
  }[size];
  if (user?.image) {
    return <img src={user.image} alt="" className={cn(cls, "rounded-full object-cover flex-shrink-0")} />;
  }
  return (
    <div
      className={cn(
        cls,
        avatarTone(user?._id || user?.phone || user?.name),
        "rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 select-none"
      )}
    >
      {initials(user?.name)}
    </div>
  );
}

// What kind of record this is, in one glance. A guest is not a lesser customer —
// it just means they have never signed in, which is true of almost every COD
// buyer — so it reads as a neutral fact, not a warning.
export function TypeBadge({ user }) {
  if (user.role && user.role !== "customer") return <Pill tone="brown">{user.role}</Pill>;
  if (user.isGuest) return <Pill tone="gray">Guest</Pill>;
  return <Pill tone="green">Registered</Pill>;
}

export function ChannelPills({ channels = [], max = 2 }) {
  if (!channels.length) return <span className="text-brand-tan/50 text-[11px]">—</span>;
  const shown = channels.slice(0, max);
  const rest = channels.length - shown.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((c) => (
        <Pill key={c} tone={channelTone(c)}>{channelLabel(c)}</Pill>
      ))}
      {rest > 0 && <span className="text-[10px] text-brand-tan">+{rest}</span>}
    </span>
  );
}

// ── Custom form controls ──────────────────────────────────────────────────────
// Native <select> and <input type=checkbox> render differently on every Android
// browser in this market, so the panel ships its own.

export function Checkbox({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cn(
        "w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors flex-shrink-0",
        checked
          ? "bg-brand-terracotta border-brand-terracotta text-white"
          : "bg-white border-brand-tan/40 hover:border-brand-tan",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

export function Dropdown({ value, onChange, options, className, align = "left", widthClass = "w-52" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-white",
          "text-[13px] text-brand-brown transition-colors",
          open ? "border-brand-brown ring-2 ring-brand-terracotta/15" : "border-brand-tan/30 hover:border-brand-tan/60"
        )}
      >
        <span className="truncate">{current?.label ?? "Select"}</span>
        <ChevronDown size={14} className={cn("text-brand-tan transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-brand-tan/20 bg-white py-1",
            "shadow-[0_8px_24px_rgba(44,24,16,0.12)]",
            widthClass,
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 transition-colors",
                o.value === value ? "text-brand-terracotta font-medium bg-brand-cream/60" : "text-brand-brown hover:bg-brand-cream/70"
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check size={13} className="flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Slide-over shell shared by the detail drawer. Fixed to the right on desktop,
// full-height sheet on a phone.
export function Drawer({ open, onClose, children, labelledBy }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="absolute inset-0 bg-brand-brown/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:max-w-xl lg:max-w-2xl bg-brand-cream shadow-2xl animate-slide-in-right flex flex-col">
        {children}
      </div>
    </div>
  );
}

// Centred modal shell for the forms.
export function Modal({ open, onClose, children, size = "md", labelledBy }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="absolute inset-0 bg-brand-brown/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cn("relative w-full bg-white rounded-t-2xl sm:rounded-xl shadow-2xl animate-slide-up max-h-[92vh] flex flex-col", width)}>
        {children}
      </div>
    </div>
  );
}
