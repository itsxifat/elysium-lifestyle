"use client";

import { Zap } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";

// The colours a product comes in (when it has more than one): picking one shows
// that colour's sizes and switches the gallery to its photos.
export function ColourSelector({ colours = [], selected, onChange, variants = [] }) {
  if (colours.length < 2) return null;
  return (
    <div>
      <p className="text-[13px] font-medium text-brand-brown uppercase tracking-widest mb-3">
        Colour
        {selected && <span className="font-normal text-brand-tan ml-2 normal-case tracking-normal">— {selected}</span>}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Colour">
        {colours.map((colour) => {
          const isSelected = selected === colour;
          const available = variants.some((v) => v.colour === colour && v.stock > 0);
          return (
            <button
              key={colour}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(colour)}
              className={cn(
                "px-4 py-2.5 text-[12px] font-medium border transition-all duration-150 min-w-[60px] text-center focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-brown focus-visible:ring-offset-2",
                isSelected
                  ? "bg-brand-brown text-brand-cream border-brand-brown"
                  : "border-brand-tan/40 text-brand-brown hover:border-brand-brown",
                !available && !isSelected && "text-brand-tan"
              )}
            >
              {colour}
              {!available && <span className="sr-only"> (sold out)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The sizes, each with its price now and, when the ERP sends one, its regular
// price struck through (`compareAt`). A size a live flash sale prices carries
// the zap. `labelOf` names a size within the chosen colour.
export default function VariantSelector({
  variants = [],
  selectedSize,
  onSizeChange,
  onSizeGuideClick,
  hasSizeChart = false,
  labelOf = (v) => v.size,
}) {
  const selected = variants.find((v) => v.size === selectedSize);
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-medium text-brand-brown uppercase tracking-widest">
            Size
            {selected && (
              <span className="font-normal text-brand-tan ml-2 normal-case tracking-normal">— {labelOf(selected)}</span>
            )}
          </p>
          {hasSizeChart && (
            <button
              type="button"
              onClick={onSizeGuideClick}
              className="text-[11px] text-brand-tan hover:text-brand-brown underline underline-offset-2 tracking-wide uppercase transition-colors"
            >
              Size Guide
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {variants.map((v) => {
            const available = v.stock > 0;
            const isSelected = selectedSize === v.size;
            const flash = !!v.flash;
            const reduced = v.compareAt > v.price;
            return (
              <button
                key={v.skuId || v.size}
                type="button"
                onClick={() => onSizeChange(v.size)}
                disabled={!available}
                className={cn(
                  "relative px-4 py-2.5 text-[12px] font-medium border transition-all duration-150 min-w-[60px] text-center",
                  isSelected
                    ? "bg-brand-brown text-brand-cream border-brand-brown"
                    : reduced
                    ? "border-brand-terracotta/50 text-brand-brown hover:border-brand-terracotta"
                    : "border-brand-tan/40 text-brand-brown hover:border-brand-brown",
                  !available && "opacity-30 cursor-not-allowed line-through"
                )}
              >
                {flash && available && (
                  <Zap size={9} fill="currentColor" className={cn("absolute top-1 right-1", isSelected ? "text-brand-cream/80" : "text-brand-terracotta")} />
                )}
                <span className="block">{labelOf(v)}</span>
                <span className={cn(
                  "block text-[10px] mt-0.5 tabular-nums",
                  isSelected ? "text-brand-cream/70" : reduced ? "text-brand-terracotta font-semibold" : "text-brand-tan"
                )}>
                  {formatPrice(v.price)}
                </span>
                {reduced && (
                  <s className={cn("block text-[9px] tabular-nums", isSelected ? "text-brand-cream/50" : "text-brand-tan/70")}>
                    <span className="sr-only">Regular price </span>
                    {formatPrice(v.compareAt)}
                  </s>
                )}
                {!available && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-full h-px bg-brand-tan/50 rotate-45 absolute" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <p className="text-xs">
          {selected.stock === 0 ? (
            <span className="text-red-500">Out of stock</span>
          ) : selected.stock < 5 ? (
            <span className="text-amber-600">Only {selected.stock} left</span>
          ) : (
            <span className="text-emerald-600">In stock</span>
          )}
        </p>
      )}
    </div>
  );
}
