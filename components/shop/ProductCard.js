"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import QuickAddModal from "@/components/shop/QuickAddModal";

export default function ProductCard({ product }) {
  const [showModal, setShowModal] = useState(false);

  const totalStock = product.variants?.reduce((s, v) => s + v.stock, 0) ?? 0;
  const isOutOfStock = totalStock === 0;
  const variants = product.variants || [];
  const minPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : 0;
  const maxPrice = variants.length ? Math.max(...variants.map((v) => v.price)) : 0;
  const hasPriceRange = minPrice !== maxPrice;

  const handleQuickAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock || !variants.length) return;
    setShowModal(true);
  };

  return (
    <>
      <Link href={`/shop/${product.slug}`} className="group block">
        <div className="relative overflow-hidden bg-brand-cream-dark aspect-[3/4]">
          <Image
            src={product.images?.[0] || "/placeholder.jpg"}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          {product.images?.[1] && (
            <Image
              src={product.images[1]}
              alt={product.name}
              fill
              className="object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          )}

          <div className="absolute top-3 left-3 flex flex-col gap-1">
            {isOutOfStock && <Badge variant="out">Sold Out</Badge>}
            {!isOutOfStock && product.isNewArrival && <Badge variant="new">New</Badge>}
          </div>

          <button
            onClick={handleQuickAdd}
            disabled={isOutOfStock}
            className="absolute bottom-0 left-0 right-0 bg-brand-brown/90 backdrop-blur-sm text-brand-cream py-3 text-[10px] uppercase tracking-[3px] font-medium translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex items-center justify-center gap-2 hover:bg-brand-terracotta disabled:bg-brand-tan/70 disabled:cursor-not-allowed"
          >
            <ShoppingBag size={13} strokeWidth={1.5} />
            {isOutOfStock ? "Sold Out" : "Quick Add"}
          </button>
        </div>

        <div className="pt-3 pb-1">
          <h3 className="text-[13px] font-medium text-brand-brown truncate group-hover:text-brand-terracotta transition-colors duration-200">
            {product.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {hasPriceRange ? (
              <span className="text-[13px] font-medium text-brand-brown">
                From {formatPrice(minPrice)}
              </span>
            ) : (
              <span className="text-[13px] font-medium text-brand-brown">{formatPrice(minPrice)}</span>
            )}
          </div>
          {variants.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {variants.slice(0, 6).map((v) => (
                <span
                  key={v.size}
                  className={`text-[10px] px-1.5 py-0.5 border ${v.stock > 0 ? "border-brand-tan/40 text-brand-tan" : "border-brand-tan/20 text-brand-tan/30 line-through"}`}
                >
                  {v.size}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      {showModal && (
        <QuickAddModal product={product} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
