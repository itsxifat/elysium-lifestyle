"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, Zap } from "lucide-react";
import { formatPrice, shouldUnoptimizeImage, PLACEHOLDER_IMAGE } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import QuickAddModal from "@/components/shop/QuickAddModal";

// A product card from the ERP's list (lib/storefront.js → mapCard): its price
// range, sizes and whether any size is in stock. `product.flash` is set when a
// live flash sale covers it: the card then shows the flash price. Quick add
// loads the sizes with their stock and prices when it opens.
export default function ProductCard({ product }) {
  const [showModal, setShowModal] = useState(false);

  const isOutOfStock = !product.inStock;
  const flash = product.flash || null;
  const minPrice = flash ? Math.min(flash.price, product.minPrice) : product.minPrice;
  const hasPriceRange = product.minPrice !== product.maxPrice;
  const mainImage = product.images?.[0] || PLACEHOLDER_IMAGE;
  const hoverImage = product.images?.[1];
  const sizes = product.sizes || [];

  const handleQuickAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    setShowModal(true);
  };

  return (
    <>
      <Link href={`/shop/${product.slug}`} className="group block" data-testid="product-card">
        <div className="relative overflow-hidden bg-brand-cream-dark aspect-[3/4]">
          <Image
            src={mainImage}
            alt={product.name}
            fill
            unoptimized={shouldUnoptimizeImage(mainImage)}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          {hoverImage && (
            <Image
              src={hoverImage}
              alt={product.name}
              fill
              unoptimized={shouldUnoptimizeImage(hoverImage)}
              className="object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          )}

          <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
            {isOutOfStock && <Badge variant="out">Sold Out</Badge>}
            {!isOutOfStock && flash && (
              <span className="inline-flex items-center gap-1 bg-brand-terracotta text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1">
                <Zap size={10} fill="currentColor" /> -{flash.discount}%
              </span>
            )}
            {!isOutOfStock && !flash && product.isNewArrival && <Badge variant="new">New</Badge>}
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
            <span className={`text-[13px] font-medium ${flash ? "text-brand-terracotta" : "text-brand-brown"}`}>
              {hasPriceRange || (flash && flash.price !== product.minPrice) ? "From " : ""}
              {formatPrice(minPrice)}
            </span>
            {flash && flash.regularPrice > minPrice && (
              <span className="text-[12px] text-brand-tan line-through">{formatPrice(flash.regularPrice)}</span>
            )}
          </div>
          {sizes.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {sizes.slice(0, 6).map((size) => (
                <span
                  key={size}
                  className={`text-[10px] px-1.5 py-0.5 border ${!isOutOfStock ? "border-brand-tan/40 text-brand-tan" : "border-brand-tan/20 text-brand-tan/30 line-through"}`}
                >
                  {size}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      {showModal && <QuickAddModal product={product} onClose={() => setShowModal(false)} />}
    </>
  );
}
