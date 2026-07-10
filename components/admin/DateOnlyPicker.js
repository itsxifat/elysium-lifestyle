"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Date-only picker (no native input). Emits a civil "YYYY-MM-DD" string — no
// timezone conversion, so the day you click is exactly the day stored. Weekday
// columns are reordered to `weekStartsOn` (0=Sun … 6=Sat) so the calendar
// matches the store's configured week logic.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n) => String(n).padStart(2, "0");
const toStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parse(str) {
  const [y, m, d] = String(str || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

export default function DateOnlyPicker({ value, onChange, weekStartsOn = 6, placeholder = "Select date", max, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sel = parse(value);
  const now = new Date();
  const [view, setView] = useState(() => (sel ? { y: sel.y, m: sel.m } : { y: now.getFullYear(), m: now.getMonth() }));

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { y, m } = view;
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = (firstDow - weekStartsOn + 7) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const weekdays = Array.from({ length: 7 }, (_, i) => WD[(weekStartsOn + i) % 7]);
  const maxStr = max ? (() => { const p = parse(max); return p ? toStr(p.y, p.m, p.d) : null; })() : null;

  const shift = (delta) => setView((v) => {
    const nm = v.m + delta;
    if (nm < 0) return { y: v.y - 1, m: 11 };
    if (nm > 11) return { y: v.y + 1, m: 0 };
    return { y: v.y, m: nm };
  });

  const pick = (day) => {
    const str = toStr(y, m, day);
    if (maxStr && str > maxStr) return;
    onChange(str);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-tan/30 bg-white text-[13px] text-left text-brand-brown hover:border-brand-brown/50 focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-terracotta/15 transition-shadow"
      >
        <Calendar size={14} className="text-brand-tan flex-shrink-0" />
        <span className={cn("flex-1 truncate", !value && "text-brand-tan/50")}>{value || placeholder}</span>
        {value && (
          <X
            size={14}
            className="text-brand-tan hover:text-red-500 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
          />
        )}
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-[248px] bg-white border border-brand-tan/25 rounded-xl shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} className="p-1.5 rounded-md text-brand-tan hover:bg-brand-cream">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[13px] font-semibold text-brand-brown">{MONTHS[m]} {y}</span>
            <button type="button" onClick={() => shift(1)} className="p-1.5 rounded-md text-brand-tan hover:bg-brand-cream">
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {weekdays.map((w, i) => <div key={i} className="text-[10px] font-medium text-brand-tan/70 py-1">{w}</div>)}
            {cells.map((day, i) => day === null ? (
              <div key={`e${i}`} />
            ) : (
              (() => {
                const str = toStr(y, m, day);
                const isSel = value === str;
                const disabled = maxStr && str > maxStr;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(day)}
                    className={cn(
                      "h-8 w-8 mx-auto flex items-center justify-center rounded-md text-[12px] transition-colors",
                      isSel ? "bg-brand-terracotta text-white font-semibold"
                        : disabled ? "text-brand-tan/30 cursor-not-allowed"
                        : "text-brand-brown hover:bg-brand-cream"
                    )}
                  >
                    {day}
                  </button>
                );
              })()
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
