"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, Flame, Clock, Eye } from "lucide-react";
import { formatPrice, shouldUnoptimizeImage, cn } from "@/lib/utils";

// Why a card can't be bought from, when it can't: a sneak peek of a sale that
// has not started, a sale that has just ended, or a staff preview of a draft.
const CLOSED = {
  upcoming: { label: "Coming soon", icon: Clock },
  ended: { label: "Sale ended", icon: Clock },
  preview: { label: "Preview only", icon: Eye },
};

// One product in a flash sale (lib/flashSale.js → toPublicSale). `mode` is
// "live", or one of CLOSED — prices stay visible, buying is disabled.
export default function FlashDealCard({ item, onBuy, mode = "live", className }) {
  const { product, price, regularPrice, minPrice, maxPrice, maxDiscount, remaining, sold, soldPct, soldOut, sizes } = item;
  const image = product.images?.[0] || "";
  const hover = product.images?.[1];
  const ranged = minPrice != null && maxPrice != null && minPrice !== maxPrice;
  const offs = (sizes || []).map((s) => s.discount || 0);
  const offVaries = offs.length > 1 && Math.min(...offs) !== Math.max(...offs);
  const urgent = !soldOut && remaining > 0 && remaining <= 5;
  const closed = CLOSED[mode] || null;
  const ButtonIcon = closed ? closed.icon : ShoppingBag;

  return (
    <div
      className={cn(
        "group flex flex-col bg-white rounded-lg overflow-hidden border border-brand-tan/15 transition-shadow duration-300 hover:shadow-[0_10px_30px_-12px_rgba(44,24,16,0.25)]",
        className
      )}
    >
      <Link href={`/shop/${product.slug}`} className="relative block aspect-[3/4] bg-brand-cream-dark overflow-hidden">
        {image && (
          <Image
            src={image}
            alt={product.name}
            fill
            unoptimized={shouldUnoptimizeImage(image)}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        )}
        {hover && (
          <Image
            src={hover}
            alt=""
            fill
            unoptimized={shouldUnoptimizeImage(hover)}
            className="object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        )}

        {maxDiscount > 0 && (
          <span className="absolute top-2 left-2 bg-brand-terracotta text-white text-[11px] font-bold px-2 py-1 rounded shadow-sm">
            {offVaries ? `Up to ${maxDiscount}% off` : `-${maxDiscount}%`}
          </span>
        )}
        {urgent && !closed && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-white/95 text-red-600 text-[10px] font-semibold px-2 py-1 rounded-full shadow-sm">
            <Flame size={10} /> {remaining} left
          </span>
        )}
        {soldOut && !closed && (
          <span className="absolute inset-0 bg-brand-brown/55 flex items-center justify-center text-brand-cream text-[11px] uppercase tracking-[2px] font-semibold">
            All claimed
          </span>
        )}
      </Link>

      <div className="p-3 flex flex-col flex-1">
        <Link href={`/shop/${product.slug}`}>
          <h3 className="text-[13px] font-medium text-brand-brown truncate hover:text-brand-terracotta transition-colors">{product.name}</h3>
        </Link>

        <div className="flex items-baseline flex-wrap gap-x-2 mt-1">
          <span className="text-[15px] font-bold text-brand-terracotta">
            {ranged && <span className="text-[11px] font-medium mr-0.5">From</span>}
            {formatPrice(price)}
          </span>
          {regularPrice > price && <span className="text-[12px] text-brand-tan line-through">{formatPrice(regularPrice)}</span>}
        </div>

        {/* The sizes the deal covers; a size whose deal is gone is struck out. */}
        {sizes?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sizes.slice(0, 5).map((s) => (
              <span
                key={s.size}
                className={cn(
                  "text-[10px] leading-none px-1.5 py-1 border rounded-sm",
                  s.remaining > 0 ? "border-brand-tan/35 text-brand-brown/80" : "border-brand-tan/15 text-brand-tan/40 line-through"
                )}
              >
                {s.size}
              </span>
            ))}
            {sizes.length > 5 && <span className="text-[10px] leading-none px-1 py-1 text-brand-tan">+{sizes.length - 5}</span>}
          </div>
        )}

        {/* Stock urgency */}
        {!closed && (
          <div className="mt-2.5">
            <div className="h-1.5 bg-brand-cream-dark rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700",
                  soldOut ? "bg-brand-tan/50" : remaining <= 3 ? "bg-red-500" : remaining <= 10 ? "bg-amber-500" : "bg-gradient-to-r from-brand-terracotta-light to-brand-terracotta"
                )}
                style={{ width: `${soldOut ? 100 : Math.max(soldPct, 6)}%` }}
              />
            </div>
            <p className="flex justify-between gap-2 text-[11px] mt-1.5 font-medium">
              {soldOut ? (
                <span className="text-brand-tan">Sold out at this price</span>
              ) : remaining <= 3 ? (
                <span className="text-red-500">Only {remaining} left!</span>
              ) : remaining <= 10 ? (
                <span className="text-amber-600">Hurry — {remaining} left</span>
              ) : (
                <>
                  <span className="text-brand-tan">{sold > 0 ? `${sold} sold` : "Just dropped"}</span>
                  <span className="text-brand-tan">{remaining} left</span>
                </>
              )}
            </p>
          </div>
        )}

        {/* mt-auto pins the button to the bottom so a row of cards lines up. */}
        <div className="mt-auto pt-3">
          <button
            type="button"
            onClick={() => onBuy?.(item)}
            disabled={soldOut || !!closed}
            className={cn(
              "w-full py-2.5 text-[10px] uppercase tracking-[2px] font-semibold rounded flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed",
              closed
                ? "bg-brand-cream-dark text-brand-tan"
                : soldOut
                ? "bg-brand-tan/40 text-white"
                : "bg-brand-brown text-brand-cream hover:bg-brand-terracotta"
            )}
          >
            <ButtonIcon size={13} strokeWidth={1.8} />
            {closed ? closed.label : soldOut ? "Sold Out" : "Grab Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
