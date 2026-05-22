"use client";

import { cn, formatPrice } from "@/lib/utils";

export default function VariantSelector({ variants = [], selectedSize, onSizeChange, onSizeGuideClick, hasSizeChart = false }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-medium text-brand-brown uppercase tracking-widest">
            Size
            {selectedSize && (
              <span className="font-normal text-brand-tan ml-2 normal-case tracking-normal">— {selectedSize}</span>
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
            return (
              <button
                key={v.size}
                onClick={() => onSizeChange(v.size)}
                disabled={!available}
                className={cn(
                  "relative px-4 py-2.5 text-[12px] font-medium border transition-all duration-150 min-w-[60px] text-center",
                  isSelected
                    ? "bg-brand-brown text-brand-cream border-brand-brown"
                    : "border-brand-tan/40 text-brand-brown hover:border-brand-brown",
                  !available && "opacity-30 cursor-not-allowed line-through"
                )}
              >
                <span className="block">{v.size}</span>
                <span className={cn("block text-[10px] mt-0.5", isSelected ? "text-brand-cream/70" : "text-brand-tan")}>
                  {formatPrice(v.price)}
                </span>
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

      {selectedSize && (() => {
        const v = variants.find((v) => v.size === selectedSize);
        if (!v) return null;
        return (
          <p className="text-xs">
            {v.stock === 0 ? (
              <span className="text-red-500">Out of stock</span>
            ) : v.stock < 5 ? (
              <span className="text-amber-600">Only {v.stock} left</span>
            ) : (
              <span className="text-emerald-600">In stock</span>
            )}
          </p>
        );
      })()}
    </div>
  );
}
