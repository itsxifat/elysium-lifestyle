"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";

// Three datasets, one button. A single "Export CSV" link had to pick one of
// them, and the channel and team tables are exactly the numbers somebody wants
// in a spreadsheet — so it picks nothing and offers all three. Every link
// carries the page's current period and filters, so a download always matches
// what is on screen.
const DATASETS = [
  { key: "series", label: "Sales over time", hint: "One row per day or month" },
  { key: "channels", label: "Sales channels", hint: "Every measure, one row per channel" },
  { key: "team", label: "Team performance", hint: "Per staff member, incl. processing" },
];

export default function ExportMenu({ params }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, []);

  const href = (dataset) => `/api/admin/analytics/export?${new URLSearchParams({ ...params, dataset })}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-tan/30 bg-white text-[12px] font-medium text-brand-brown hover:border-brand-brown transition-colors"
      >
        <Download size={13} /> Export CSV
        <ChevronDown size={12} className="text-brand-tan" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[248px] rounded-lg border border-brand-tan/20 bg-white shadow-lg py-1">
          {DATASETS.map((d) => (
            <a
              key={d.key}
              href={href(d.key)}
              download
              onClick={() => setOpen(false)}
              className="block px-3 py-2 hover:bg-brand-cream/60 transition-colors"
            >
              <span className="block text-[12px] text-brand-brown">{d.label}</span>
              <span className="block text-[10px] text-brand-tan">{d.hint}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
