"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Zap, Package, TrendingDown } from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";
import { CountdownBoxes } from "./Countdown";
import FlashDealGrid from "./FlashDealGrid";

// One live campaign on the /flash-sale hub: its banner, countdown and a
// two-row preview of its deals — each buyable right here — with a button into
// the campaign's own page for the rest.
export default function FlashCampaignBlock({ sale, maxRows = 2 }) {
  const [ended, setEnded] = useState(false);
  const { stats } = sale;

  return (
    <section id={sale.slug} className="scroll-mt-40 bg-white rounded-2xl border border-brand-tan/15 overflow-hidden shadow-[0_1px_3px_rgba(44,24,16,0.04)]">
      {/* Banner header */}
      <div className="relative isolate">
        {sale.bannerImage ? (
          <>
            <Image
              src={sale.bannerImage}
              alt=""
              fill
              unoptimized={shouldUnoptimizeImage(sale.bannerImage)}
              className="object-cover -z-10"
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-brown/90 via-brand-brown/70 to-brand-brown/30" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-brown via-[#4a2518] to-brand-terracotta" />
        )}

        <div className="px-5 py-6 sm:px-8 sm:py-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 text-white">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[3px] text-brand-terracotta-light font-semibold">
              <Zap size={12} fill="currentColor" /> Flash sale
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2 leading-tight">{sale.title}</h2>
            {sale.subtitle && <p className="text-[14px] text-white/75 mt-1.5 max-w-xl">{sale.subtitle}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 border border-white/15 px-3 py-1 text-[11px]">
                <Package size={12} /> {stats.count} deal{stats.count === 1 ? "" : "s"}
              </span>
              {stats.maxDiscount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-terracotta px-3 py-1 text-[11px] font-semibold">
                  <TrendingDown size={12} /> Up to {stats.maxDiscount}% off
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0">
            {ended ? (
              <p className="text-[12px] uppercase tracking-[2px] text-white/80">This sale has ended</p>
            ) : sale.endsAt ? (
              <>
                <p className="text-[10px] uppercase tracking-[2px] text-white/70 mb-2">Ends in</p>
                <CountdownBoxes target={sale.endsAt} tone="light" onDone={() => setEnded(true)} />
              </>
            ) : (
              <p className="text-[11px] uppercase tracking-[2px] text-white/80">While stocks last</p>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <FlashDealGrid items={sale.items} maxRows={maxRows} mode={ended ? "ended" : "live"} />

        <div className="mt-6 flex justify-center">
          <Link
            href={`/flash-sale/${sale.slug}`}
            className="btn-primary inline-flex items-center justify-center gap-2 text-[11px] tracking-[2px] py-3.5 w-full sm:w-auto"
          >
            Open this sale · all {stats.count} deal{stats.count === 1 ? "" : "s"} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
