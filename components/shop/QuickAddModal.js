"use client";

import { useState, useEffect } from "react";
import { X, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice, cn, shouldUnoptimizeImage } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import Spinner from "@/components/ui/Spinner";
import WasPrice from "@/components/ui/WasPrice";
import { priceSummary } from "@/lib/storefront-map";
import toast from "react-hot-toast";

// Buy a product without leaving the page. A card or a flash deal only knows a
// product's name and price range, so the sizes — each with its live stock, its
// price now, its regular price struck through and any flash offer — are read
// from the shop when the modal opens (GET /api/products/<slug>, from the ERP).
export default function QuickAddModal({ product: summary, onClose }) {
  const { addItem } = useCart();
  const [product, setProduct] = useState(summary?.variants ? summary : null);
  const [failed, setFailed] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product) return;
    let active = true;
    fetch(`/api/products/${encodeURIComponent(summary.slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((data) => { if (active) setProduct(data.product); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [product, summary.slug]);

  useEffect(() => {
    const handle = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const dealFor = (v) => (v?.flash && v.flash.remaining > 0 ? v.flash : null);

  const variants = product?.variants || [];
  const selectedVariant = variants.find((v) => v.size === selectedSize);
  const selectedDeal = dealFor(selectedVariant);
  const unitPrice = selectedVariant?.price;
  const summaryPrices = priceSummary(variants);
  const minPrice = variants.length ? summaryPrices.min : summary.minPrice ?? 0;
  const maxPrice = variants.length ? summaryPrices.max : summary.maxPrice ?? 0;
  const lowestWas = variants.length ? summaryPrices.compareAt : summary.compareAt ?? null;
  const hasDeals = variants.some((v) => dealFor(v));
  const image = summary.images?.[0] || product?.images?.[0] || "";

  // A flash line can only hold what the deal has left — past that the line
  // would be charged the normal price at checkout.
  const lineCap = selectedVariant
    ? Math.min(selectedVariant.stock, selectedDeal ? selectedDeal.remaining : Infinity)
    : 0;
  const maxQty = selectedVariant ? Math.min(lineCap, 10) : 10;

  const handleAdd = () => {
    if (!selectedSize) { toast.error("Please select a size"); return; }
    if (!selectedVariant || selectedVariant.stock === 0) { toast.error("This size is out of stock"); return; }
    addItem(
      {
        id: product._id,
        skuId: selectedVariant.skuId,
        slug: product.slug,
        name: product.name,
        image,
        price: unitPrice,
        regularPrice: selectedVariant.compareAt ?? undefined,
        sku: selectedVariant.sku || "",
      },
      selectedSize,
      quantity,
      lineCap // caps the cart line, not just this one add
    );
    toast.success(`${product.name} added to bag!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div role="dialog" aria-modal="true" aria-label={summary.name} className="relative bg-white w-full sm:max-w-[440px] sm:mx-auto shadow-2xl animate-slide-up sm:animate-none max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center text-brand-tan hover:text-brand-brown transition-colors"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        {/* Product header */}
        <div className="flex gap-4 p-5 border-b border-brand-tan/15">
          <Link href={`/shop/${summary.slug}`} onClick={onClose} className="relative w-[60px] h-[76px] flex-shrink-0 bg-brand-cream-dark overflow-hidden block">
            {image && (
              <Image src={image} alt={summary.name} fill unoptimized={shouldUnoptimizeImage(image)} className="object-cover" sizes="60px" />
            )}
          </Link>
          <div className="flex-1 min-w-0 pr-8">
            {hasDeals && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[2px] text-brand-terracotta mb-1">
                <Zap size={10} fill="currentColor" /> Flash deal
              </span>
            )}
            <Link href={`/shop/${summary.slug}`} onClick={onClose} className="block">
              <h3 className="text-[13px] font-semibold text-brand-brown leading-snug line-clamp-2 hover:text-brand-terracotta transition-colors">
                {summary.name}
              </h3>
            </Link>
            <div className="mt-1.5">
              {selectedVariant ? (
                <span className="flex items-baseline gap-2">
                  <span className={cn("text-base font-bold tabular-nums", selectedVariant.compareAt ? "text-brand-terracotta" : "text-brand-brown")}>{formatPrice(unitPrice)}</span>
                  <WasPrice amount={selectedVariant.compareAt} className="text-[12px]" />
                </span>
              ) : minPrice !== maxPrice && !lowestWas ? (
                <span className="text-sm text-brand-tan tabular-nums">
                  {formatPrice(minPrice)} – {formatPrice(maxPrice)}
                </span>
              ) : (
                <span className="flex items-baseline gap-2">
                  <span className={cn("text-base font-bold tabular-nums", lowestWas ? "text-brand-terracotta" : "text-brand-brown")}>
                    {minPrice !== maxPrice ? "From " : ""}{formatPrice(minPrice)}
                  </span>
                  <WasPrice amount={lowestWas} className="text-[12px]" />
                </span>
              )}
            </div>
          </div>
        </div>

        {!product ? (
          <div className="p-10 flex justify-center">
            {failed ? (
              <p className="text-[12px] text-brand-tan">This product is not available right now.</p>
            ) : (
              <Spinner size="md" />
            )}
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Size selector */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[2px] text-brand-brown">Select Size</p>
                {selectedSize && selectedVariant && (
                  <span className="text-[11px] text-brand-tan">
                    {selectedSize} · {formatPrice(unitPrice)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const available = v.stock > 0;
                  const isSelected = selectedSize === v.size;
                  const deal = dealFor(v);
                  const reduced = v.compareAt > v.price;
                  return (
                    <button
                      key={v.skuId}
                      type="button"
                      onClick={() => { if (available) { setSelectedSize(v.size); setQuantity(1); } }}
                      disabled={!available}
                      className={cn(
                        "relative flex flex-col items-center px-3 py-2 border transition-all duration-150 min-w-[64px] text-center",
                        isSelected
                          ? "bg-brand-brown text-brand-cream border-brand-brown"
                          : available
                          ? reduced
                            ? "border-brand-terracotta/50 text-brand-brown hover:border-brand-terracotta"
                            : "border-brand-tan/40 text-brand-brown hover:border-brand-brown"
                          : "border-brand-tan/20 text-brand-tan/30 cursor-not-allowed"
                      )}
                    >
                      {deal && available && (
                        <Zap size={9} fill="currentColor" className={cn("absolute top-1 right-1", isSelected ? "text-brand-cream/80" : "text-brand-terracotta")} />
                      )}
                      <span className="text-[12px] font-medium leading-tight">{v.size}</span>
                      <span className={cn(
                        "text-[10px] mt-0.5 leading-tight tabular-nums",
                        isSelected ? "text-brand-cream/80" : reduced ? "text-brand-terracotta font-semibold" : "text-brand-tan"
                      )}>
                        {formatPrice(v.price)}
                      </span>
                      {reduced && (
                        <s className={cn("text-[9px] leading-tight tabular-nums", isSelected ? "text-brand-cream/50" : "text-brand-tan/70")}>
                          <span className="sr-only">Regular price </span>
                          {formatPrice(v.compareAt)}
                        </s>
                      )}
                      {!deal && hasDeals && available && (
                        <span className={cn("text-[8px] uppercase tracking-wide leading-tight mt-0.5", isSelected ? "text-brand-cream/60" : "text-brand-tan/70")}>
                          Regular
                        </span>
                      )}
                      {!available && (
                        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="w-full h-px bg-brand-tan/30 rotate-45 absolute" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedVariant && (
                <p className="text-[11px] mt-2">
                  {selectedVariant.stock === 0 ? (
                    <span className="text-red-500">Out of stock</span>
                  ) : selectedDeal && selectedDeal.remaining <= 10 ? (
                    <span className="text-brand-terracotta font-medium">
                      Only {Math.min(selectedDeal.remaining, selectedVariant.stock)} left at the flash price
                    </span>
                  ) : selectedVariant.stock <= 3 ? (
                    <span className="text-amber-600">Only {selectedVariant.stock} left!</span>
                  ) : selectedVariant.stock <= 8 ? (
                    <span className="text-amber-500">Only {selectedVariant.stock} left</span>
                  ) : (
                    <span className="text-emerald-600">In stock</span>
                  )}
                </p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[2px] text-brand-brown mb-3">Quantity</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                  className="w-9 h-9 border border-brand-tan/40 flex items-center justify-center text-brand-brown hover:border-brand-brown transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus size={13} />
                </button>
                <span className="text-base font-semibold text-brand-brown w-8 text-center tabular-nums">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  disabled={!selectedVariant || quantity >= maxQty}
                  aria-label="Increase quantity"
                  className="w-9 h-9 border border-brand-tan/40 flex items-center justify-center text-brand-brown hover:border-brand-brown transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!selectedSize || !selectedVariant || selectedVariant.stock === 0}
                className="w-full bg-brand-terracotta text-white py-4 uppercase text-[11px] tracking-[3px] font-bold hover:bg-brand-terracotta/90 disabled:bg-brand-tan/40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <ShoppingBag size={14} strokeWidth={2} />
                {!selectedSize
                  ? "Select a Size"
                  : selectedVariant?.stock === 0
                  ? "Out of Stock"
                  : `Add to Bag · ${formatPrice(unitPrice * quantity)}`}
              </button>
              <Link
                href={`/shop/${summary.slug}`}
                onClick={onClose}
                className="w-full flex items-center justify-center py-2.5 border border-brand-tan/30 text-[11px] uppercase tracking-[2px] text-brand-tan hover:border-brand-brown hover:text-brand-brown transition-colors"
              >
                View Full Details
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
