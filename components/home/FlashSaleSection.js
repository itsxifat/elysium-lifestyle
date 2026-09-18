"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountdownBoxes } from "@/components/flash/Countdown";
import FlashDealGrid from "@/components/flash/FlashDealGrid";

// The homepage teaser for the live flash sales (lib/flashSale.js →
// getPublicFlashSales). One campaign at a time — a tab per campaign when
// several are running — and never more than two rows of deals, so a big sale
// can't swamp the page. The buttons carry the rest: the campaign's own page,
// and the /flash-sale hub with every campaign.
export default function FlashSaleSection({ sales = [] }) {
  const [activeId, setActiveId] = useState(sales[0]?._id || null);
  const [ended, setEnded] = useState([]);

  const visible = sales.filter((s) => !ended.includes(s._id));
  if (!visible.length) return null;
  const sale = visible.find((s) => s._id === activeId) || visible[0];
  const markEnded = (id) => setEnded((e) => (e.includes(id) ? e : [...e, id]));

  return (
    <section className="py-14 sm:py-20 bg-gradient-to-b from-brand-terracotta/[0.07] to-brand-cream">
      <div className="container-custom">
        {/* Header + countdown */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-6 sm:mb-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-terracotta text-white">
                <Zap size={15} fill="currentColor" />
              </span>
              <p className="section-subtitle text-brand-terracotta">Flash Sale · limited stock</p>
            </div>
            <h2 className="section-title truncate">{sale.title}</h2>
            {sale.subtitle && <p className="text-sm text-brand-tan mt-1">{sale.subtitle}</p>}
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
            {sale.endsAt ? (
              <>
                <span className="text-[10px] uppercase tracking-[2px] text-brand-tan">Ends in</span>
                <CountdownBoxes key={sale._id} target={sale.endsAt} onDone={() => markEnded(sale._id)} />
              </>
            ) : (
              <span className="text-[11px] uppercase tracking-[2px] text-brand-tan">While stocks last</span>
            )}
          </div>
        </div>

        {/* One tab per campaign */}
        {visible.length > 1 && (
          <div role="tablist" aria-label="Flash sales" className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
            {visible.map((s) => {
              const on = s._id === sale._id;
              return (
                <button
                  key={s._id}
                  role="tab"
                  aria-selected={on}
                  type="button"
                  onClick={() => setActiveId(s._id)}
                  className={cn(
                    "flex-shrink-0 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium transition-colors",
                    on
                      ? "bg-brand-brown border-brand-brown text-brand-cream"
                      : "bg-white border-brand-tan/25 text-brand-brown hover:border-brand-brown/50"
                  )}
                >
                  {s.title}
                  {s.stats.maxDiscount > 0 && (
                    <span className={cn("text-[10px] font-bold", on ? "text-brand-terracotta-light" : "text-brand-terracotta")}>
                      -{s.stats.maxDiscount}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Two rows at most, whatever the screen */}
        <FlashDealGrid key={sale._id} items={sale.items} maxRows={2} />

        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <Link
            href={`/flash-sale/${sale.slug}`}
            className="btn-primary inline-flex items-center justify-center gap-2 text-[11px] tracking-[2px] py-3.5"
          >
            View all {sale.stats.count} deal{sale.stats.count === 1 ? "" : "s"} <ArrowRight size={14} />
          </Link>
          <Link
            href="/flash-sale"
            className="btn-outline inline-flex items-center justify-center gap-2 text-[11px] tracking-[2px] py-3.5"
          >
            <Zap size={13} /> All flash sales{visible.length > 1 ? ` (${visible.length})` : ""}
          </Link>
        </div>
      </div>
    </section>
  );
}
