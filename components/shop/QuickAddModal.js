"use client";

import { useState, useEffect } from "react";
import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice, cn } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import toast from "react-hot-toast";

export default function QuickAddModal({ product, onClose }) {
  const { addItem } = useCart();
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);

  const variants = product.variants || [];
  const selectedVariant = variants.find((v) => v.size === selectedSize);
  const minPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : 0;
  const maxPrice = variants.length ? Math.max(...variants.map((v) => v.price)) : 0;
  const hasPriceRange = minPrice !== maxPrice;

  useEffect(() => {
    const handle = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleAdd = () => {
    if (!selectedSize) { toast.error("Please select a size"); return; }
    if (!selectedVariant || selectedVariant.stock === 0) { toast.error("This size is out of stock"); return; }
    addItem(
      { id: product._id, slug: product.slug, name: product.name, image: product.images?.[0], price: selectedVariant.price },
      selectedSize,
      quantity
    );
    toast.success(`${product.name} added to bag!`);
    onClose();
  };

  const maxQty = selectedVariant ? Math.min(selectedVariant.stock, 10) : 10;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative bg-white w-full sm:max-w-[420px] sm:mx-auto shadow-2xl animate-slide-up sm:animate-none">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center text-brand-tan hover:text-brand-brown transition-colors"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        {/* Product header */}
        <div className="flex gap-4 p-5 border-b border-brand-tan/15">
          <Link href={`/shop/${product.slug}`} onClick={onClose} className="relative w-[60px] h-[76px] flex-shrink-0 bg-brand-cream-dark overflow-hidden block">
            <Image
              src={product.images?.[0] || "/placeholder.jpg"}
              alt={product.name}
              fill
              className="object-cover"
              sizes="60px"
            />
          </Link>
          <div className="flex-1 min-w-0 pr-8">
            <Link href={`/shop/${product.slug}`} onClick={onClose} className="block">
              <h3 className="text-[13px] font-semibold text-brand-brown leading-snug line-clamp-2 hover:text-brand-terracotta transition-colors">
                {product.name}
              </h3>
            </Link>
            <div className="mt-1.5">
              {selectedVariant ? (
                <span className="text-base font-bold text-brand-terracotta">
                  {formatPrice(selectedVariant.price)}
                </span>
              ) : hasPriceRange ? (
                <span className="text-sm text-brand-tan">
                  {formatPrice(minPrice)} – {formatPrice(maxPrice)}
                </span>
              ) : (
                <span className="text-base font-bold text-brand-brown">
                  {formatPrice(minPrice)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Size selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[2px] text-brand-brown">
                Select Size
              </p>
              {selectedSize && selectedVariant && (
                <span className="text-[11px] text-brand-tan">
                  {selectedSize} · {formatPrice(selectedVariant.price)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const available = v.stock > 0;
                const isSelected = selectedSize === v.size;
                return (
                  <button
                    key={v.size}
                    type="button"
                    onClick={() => { if (available) { setSelectedSize(v.size); setQuantity(1); } }}
                    disabled={!available}
                    className={cn(
                      "relative flex flex-col items-center px-3 py-2 border transition-all duration-150 min-w-[58px] text-center",
                      isSelected
                        ? "bg-brand-brown text-brand-cream border-brand-brown"
                        : available
                        ? "border-brand-tan/40 text-brand-brown hover:border-brand-brown"
                        : "border-brand-tan/20 text-brand-tan/30 cursor-not-allowed"
                    )}
                  >
                    <span className="text-[12px] font-medium leading-tight">{v.size}</span>
                    <span className={cn(
                      "text-[10px] mt-0.5 leading-tight",
                      isSelected ? "text-brand-cream/70" : "text-brand-tan"
                    )}>
                      {formatPrice(v.price)}
                    </span>
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
                className="w-9 h-9 border border-brand-tan/40 flex items-center justify-center text-brand-brown hover:border-brand-brown transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Minus size={13} />
              </button>
              <span className="text-base font-semibold text-brand-brown w-8 text-center tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={!selectedVariant || quantity >= maxQty}
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
                : `Add to Bag · ${formatPrice(selectedVariant.price * quantity)}`}
            </button>
            <Link
              href={`/shop/${product.slug}`}
              onClick={onClose}
              className="w-full flex items-center justify-center py-2.5 border border-brand-tan/30 text-[11px] uppercase tracking-[2px] text-brand-tan hover:border-brand-brown hover:text-brand-brown transition-colors"
            >
              View Full Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
