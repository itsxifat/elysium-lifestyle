"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CalendarClock, ArrowRight } from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";
import { CountdownText } from "./Countdown";

// A campaign that is switched on but has not started: a teaser with a live
// countdown, linking to its page (where the deals can be previewed).
export default function UpcomingSaleCard({ sale }) {
  const router = useRouter();
  const thumbs = sale.items.map((i) => i.product.images?.[0]).filter(Boolean).slice(0, 3);

  return (
    <Link
      href={`/flash-sale/${sale.slug}`}
      className="group flex flex-col bg-white rounded-xl border border-brand-tan/15 overflow-hidden transition-shadow hover:shadow-[0_10px_30px_-12px_rgba(44,24,16,0.25)]"
    >
      <div className="relative aspect-[16/7] bg-gradient-to-br from-brand-cream-dark to-brand-tan/30 overflow-hidden">
        {sale.bannerImage ? (
          <Image
            src={sale.bannerImage}
            alt=""
            fill
            unoptimized={shouldUnoptimizeImage(sale.bannerImage)}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className={`absolute inset-0 grid ${["", "grid-cols-1", "grid-cols-2", "grid-cols-3"][thumbs.length] || "grid-cols-3"}`}>
            {thumbs.map((src) => (
              <div key={src} className="relative">
                <Image src={src} alt="" fill unoptimized={shouldUnoptimizeImage(src)} className="object-cover" sizes="15vw" />
              </div>
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-brand-brown/20" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-white/95 text-brand-brown text-[10px] font-semibold uppercase tracking-[2px] px-2.5 py-1 rounded-full">
          <CalendarClock size={11} /> Coming soon
        </span>
      </div>

      <div className="p-4 flex flex-col gap-1 flex-1">
        <p className="font-semibold text-brand-brown leading-snug">{sale.title}</p>
        {sale.subtitle && <p className="text-[12px] text-brand-tan line-clamp-2">{sale.subtitle}</p>}
        <p className="text-[12px] text-brand-tan mt-1">
          Starts in{" "}
          <CountdownText target={sale.startsAt} onDone={() => router.refresh()} className="font-semibold text-brand-terracotta" />
        </p>
        <p className="mt-auto pt-2 flex items-center justify-between text-[11px] text-brand-tan">
          <span>
            {sale.stats.count} deal{sale.stats.count === 1 ? "" : "s"}
            {sale.stats.maxDiscount > 0 && <> · up to {sale.stats.maxDiscount}% off</>}
          </span>
          <span className="inline-flex items-center gap-1 text-brand-brown group-hover:text-brand-terracotta transition-colors">
            Preview <ArrowRight size={12} />
          </span>
        </p>
      </div>
    </Link>
  );
}
