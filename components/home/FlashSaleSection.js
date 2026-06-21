"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Zap, ShoppingBag } from "lucide-react";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";
import QuickAddModal from "@/components/shop/QuickAddModal";

function pad(n) { return String(n).padStart(2, "0"); }

// Live countdown to `endsAt`. Returns null until mounted (avoids SSR/client
// hydration mismatch), when no end is set, or once elapsed.
function useCountdown(endsAt) {
  const target = endsAt ? new Date(endsAt).getTime() : null;
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target || now == null) return null;
  const diff = Math.max(0, target - now);
  const totalSec = Math.floor(diff / 1000);
  return {
    expired: diff <= 0,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

function CountdownBox({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="bg-brand-brown text-brand-cream text-base sm:text-lg font-bold tabular-nums rounded-md w-10 sm:w-12 py-1.5 text-center">
        {pad(value)}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-brand-tan mt-1">{label}</span>
    </div>
  );
}

function FlashCard({ item, onAdd }) {
  const { product, salePrice, stockLimit, soldCount, remaining } = item;
  const variants = product.variants || [];
  const totalRealStock = variants.reduce((s, v) => s + (v.stock || 0), 0);
  const origPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : 0;
  const off = origPrice > salePrice && origPrice > 0 ? Math.round(((origPrice - salePrice) / origPrice) * 100) : 0;
  const soldOut = remaining <= 0 || totalRealStock <= 0;
  const soldPct = stockLimit > 0 ? Math.min(100, Math.round((soldCount / stockLimit) * 100)) : 0;
  const image = product.images?.[0] || "/placeholder.jpg";

  return (
    <div className="group bg-white border border-brand-tan/15 rounded-lg overflow-hidden flex flex-col">
      <Link href={`/shop/${product.slug}`} className="relative block aspect-[3/4] bg-brand-cream-dark overflow-hidden">
        <Image
          src={image}
          alt={product.name}
          fill
          unoptimized={shouldUnoptimizeImage(image)}
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        {off > 0 && (
          <span className="absolute top-2 left-2 bg-brand-terracotta text-white text-[11px] font-bold px-2 py-1 rounded shadow-sm">
            -{off}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-0 bg-brand-brown/55 flex items-center justify-center text-brand-cream text-[11px] uppercase tracking-[2px] font-semibold">
            Sold Out
          </span>
        )}
      </Link>

      <div className="p-3 flex flex-col flex-1">
        <Link href={`/shop/${product.slug}`}>
          <h3 className="text-[13px] font-medium text-brand-brown truncate hover:text-brand-terracotta transition-colors">{product.name}</h3>
        </Link>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[15px] font-bold text-brand-terracotta">{formatPrice(salePrice)}</span>
          {origPrice > salePrice && <span className="text-[12px] text-brand-tan line-through">{formatPrice(origPrice)}</span>}
        </div>

        {/* Stock urgency */}
        <div className="mt-2.5">
          <div className="h-1.5 bg-brand-cream-dark rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${remaining <= 3 ? "bg-red-500" : remaining <= 8 ? "bg-amber-500" : "bg-brand-terracotta"}`}
              style={{ width: `${Math.max(soldPct, soldOut ? 100 : 6)}%` }}
            />
          </div>
          <p className="text-[11px] mt-1.5 font-medium">
            {soldOut ? (
              <span className="text-brand-tan">All claimed</span>
            ) : remaining <= 3 ? (
              <span className="text-red-500">🔥 Only {remaining} left!</span>
            ) : remaining <= 8 ? (
              <span className="text-amber-600">Hurry — {remaining} left</span>
            ) : (
              <span className="text-brand-tan">{remaining} left · {soldCount} sold</span>
            )}
          </p>
        </div>

        <button
          onClick={() => onAdd(item)}
          disabled={soldOut}
          className="mt-3 w-full bg-brand-brown text-brand-cream py-2.5 text-[10px] uppercase tracking-[2px] font-semibold rounded hover:bg-brand-terracotta disabled:bg-brand-tan/40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <ShoppingBag size={13} strokeWidth={1.8} />
          {soldOut ? "Sold Out" : "Grab Deal"}
        </button>
      </div>
    </div>
  );
}

export default function FlashSaleSection({ sale }) {
  const [active, setActive] = useState(null); // item open in QuickAddModal
  const cd = useCountdown(sale?.endsAt);

  if (!sale?.items?.length) return null;
  if (cd?.expired) return null;

  return (
    <section className="py-14 sm:py-20 bg-gradient-to-b from-brand-terracotta/5 to-brand-cream">
      <div className="container-custom">
        {/* Header + countdown */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-terracotta text-white">
                <Zap size={15} fill="currentColor" />
              </span>
              <p className="section-subtitle text-brand-terracotta">Limited time</p>
            </div>
            <h2 className="section-title">{sale.title || "Flash Sale"}</h2>
            {sale.subtitle && <p className="text-sm text-brand-tan mt-1">{sale.subtitle}</p>}
          </div>

          {cd && !cd.expired && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-brand-tan mr-1 hidden sm:block">Ends in</span>
              {cd.days > 0 && <CountdownBox value={cd.days} label="Days" />}
              <CountdownBox value={cd.hours} label="Hrs" />
              <CountdownBox value={cd.minutes} label="Min" />
              <CountdownBox value={cd.seconds} label="Sec" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {sale.items.map((item) => (
            <FlashCard key={item.product._id} item={item} onAdd={setActive} />
          ))}
        </div>
      </div>

      {active && (
        <QuickAddModal
          product={active.product}
          flashPrice={active.salePrice}
          flashStock={active.remaining}
          onClose={() => setActive(null)}
        />
      )}
    </section>
  );
}
