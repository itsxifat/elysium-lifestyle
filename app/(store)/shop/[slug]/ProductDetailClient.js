"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronDown, X,
  Truck, RotateCcw, ShieldCheck, MessageCircle,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import ImageGallery from "@/components/product/ImageGallery";
import VariantSelector from "@/components/product/VariantSelector";
import AddToCartButton from "@/components/product/AddToCartButton";
import ProductCard from "@/components/shop/ProductCard";
import { track } from "@/lib/tracking/client";

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-brand-tan/15">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-4 text-left group"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[2px] text-brand-brown group-hover:text-brand-terracotta transition-colors">
          {title}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={`text-brand-tan transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="pb-5">{children}</div>}
    </div>
  );
}

function SizeChartModal({ chart, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-tan/15 flex-shrink-0">
          <div>
            <h3 className="text-[12px] font-bold text-brand-brown uppercase tracking-wider">{chart.name}</h3>
            <p className="text-[10px] text-brand-tan mt-0.5">All measurements in cm unless stated</p>
          </div>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown transition-colors">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="overflow-auto flex-1 p-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {chart.columns.map((col, i) => (
                  <th
                    key={i}
                    className="border border-brand-tan/20 bg-brand-cream px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-brand-brown whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-brand-cream/30"}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-brand-tan/15 px-4 py-2.5 text-[13px] text-brand-brown"
                    >
                      {cell || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailClient({ product, related = [] }) {
  const [selectedSize, setSelectedSize] = useState("");
  const [showSizeChart, setShowSizeChart] = useState(false);

  const selectedVariant = product.variants?.find((v) => v.size === selectedSize);
  const minPrice = product.variants?.length
    ? Math.min(...product.variants.map((v) => v.price))
    : 0;
  const maxPrice = product.variants?.length
    ? Math.max(...product.variants.map((v) => v.price))
    : 0;
  const hasPriceRange = minPrice !== maxPrice;
  const displayPrice = selectedVariant ? selectedVariant.price : minPrice;

  const productId = product._id || product.id;
  // ViewContent — fires once per product view.
  useEffect(() => {
    track.viewContent({
      customData: {
        value: minPrice,
        currency: "BDT",
        content_type: "product",
        content_ids: [productId],
        content_name: product.name,
        contents: [{ id: productId, quantity: 1, item_price: minPrice }],
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "8801700000000";
  const whatsappMsg = encodeURIComponent(`Hi, I'm interested in: ${product.name}`);

  return (
    <div className="bg-brand-cream min-h-screen">
      <div className="container-custom py-6 md:py-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[10px] text-brand-tan mb-8 uppercase tracking-[2px] flex-wrap">
          <Link href="/" className="hover:text-brand-brown transition-colors">Home</Link>
          <ChevronRight size={10} strokeWidth={2.5} />
          <Link href="/shop" className="hover:text-brand-brown transition-colors">Shop</Link>
          {product.category && (
            <>
              <ChevronRight size={10} strokeWidth={2.5} />
              <Link
                href={`/shop?gender=${product.category.gender}`}
                className="hover:text-brand-brown transition-colors"
              >
                {product.category.name}
              </Link>
            </>
          )}
          <ChevronRight size={10} strokeWidth={2.5} />
          <span className="text-brand-brown/60 truncate max-w-[180px] normal-case tracking-normal text-[11px]">
            {product.name}
          </span>
        </nav>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 lg:gap-14 lg:items-start">

          {/* Left — gallery */}
          <ImageGallery images={product.images} name={product.name} />

          {/* Right — info (sticky on desktop) */}
          <div className="lg:sticky lg:top-[165px] space-y-5">

            {/* Category + new badge */}
            <div className="flex items-center gap-2.5">
              {product.category && (
                <Link
                  href={`/shop?gender=${product.category.gender}`}
                  className="text-[10px] uppercase tracking-[3px] text-brand-tan hover:text-brand-brown transition-colors"
                >
                  {product.category.name}
                </Link>
              )}
              {product.isNewArrival && (
                <span className="text-[8px] uppercase tracking-[2px] bg-brand-terracotta text-white px-2 py-0.5 font-medium">
                  New Arrival
                </span>
              )}
              {product.featured && (
                <span className="text-[8px] uppercase tracking-[2px] bg-brand-brown text-brand-cream px-2 py-0.5 font-medium">
                  Featured
                </span>
              )}
            </div>

            {/* Product name */}
            <h1 className="font-display text-[2rem] md:text-[2.5rem] font-light text-brand-brown leading-[1.15]">
              {product.name}
            </h1>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-semibold text-brand-brown tracking-tight">
                {hasPriceRange && !selectedVariant
                  ? `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`
                  : formatPrice(displayPrice)}
              </span>
              {hasPriceRange && !selectedVariant && (
                <span className="text-[10px] text-brand-tan uppercase tracking-wider">varies by size</span>
              )}
            </div>

            <div className="h-px bg-brand-tan/15" />

            {/* Variants */}
            <VariantSelector
              variants={product.variants}
              selectedSize={selectedSize}
              onSizeChange={setSelectedSize}
              hasSizeChart={!!product.sizeChart}
              onSizeGuideClick={() => setShowSizeChart(true)}
            />

            {/* Add to cart */}
            <AddToCartButton
              product={product}
              selectedSize={selectedSize}
              selectedVariant={selectedVariant}
            />

            {/* WhatsApp enquiry */}
            <a
              href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full border border-brand-tan/30 py-3 text-[10px] uppercase tracking-[2px] text-brand-tan hover:border-brand-brown hover:text-brand-brown transition-all duration-200"
            >
              <MessageCircle size={13} strokeWidth={1.5} />
              Enquire on WhatsApp
            </a>

            {/* Trust strip */}
            <div className="grid grid-cols-3 border border-brand-tan/15">
              {[
                { Icon: Truck,        title: "Free shipping", sub: "Over ৳1500"   },
                { Icon: RotateCcw,    title: "7-day returns", sub: "Easy returns"  },
                { Icon: ShieldCheck,  title: "COD available", sub: "Pay on arrival" },
              ].map(({ Icon, title, sub }) => (
                <div
                  key={title}
                  className="flex flex-col items-center text-center px-2 py-4 border-r border-brand-tan/15 last:border-r-0 gap-1.5"
                >
                  <Icon size={15} strokeWidth={1.5} className="text-brand-tan" />
                  <p className="text-[9px] font-semibold uppercase tracking-[1.5px] text-brand-brown leading-tight">
                    {title}
                  </p>
                  <p className="text-[9px] text-brand-tan/70">{sub}</p>
                </div>
              ))}
            </div>

            {/* Accordion details */}
            <div className="border-b border-brand-tan/15">
              {product.description && (
                <Accordion title="Description" defaultOpen>
                  <p className="text-[13px] text-brand-brown/70 leading-[1.85] whitespace-pre-line">
                    {product.description}
                  </p>
                </Accordion>
              )}

              {(product.material || product.careInstructions) && (
                <Accordion title="Material & Care">
                  <dl className="space-y-2 text-[13px]">
                    {product.material && (
                      <div className="flex gap-3">
                        <dt className="text-brand-brown font-medium min-w-[80px]">Material</dt>
                        <dd className="text-brand-brown/70">{product.material}</dd>
                      </div>
                    )}
                    {product.careInstructions && (
                      <div className="flex gap-3">
                        <dt className="text-brand-brown font-medium min-w-[80px]">Care</dt>
                        <dd className="text-brand-brown/70">{product.careInstructions}</dd>
                      </div>
                    )}
                  </dl>
                </Accordion>
              )}

              {product.tags?.length > 0 && (
                <Accordion title="Tags">
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/shop?search=${encodeURIComponent(tag)}`}
                        className="text-[10px] uppercase tracking-wider border border-brand-tan/30 px-2.5 py-1 text-brand-tan hover:border-brand-brown hover:text-brand-brown transition-colors"
                      >
                        {tag}
                      </Link>
                    ))}
                  </div>
                </Accordion>
              )}
            </div>

          </div>
        </div>

        {/* Size chart modal */}
        {showSizeChart && product.sizeChart && (
          <SizeChartModal chart={product.sizeChart} onClose={() => setShowSizeChart(false)} />
        )}

        {/* Related products */}
        {related.length > 0 && (
          <div className="mt-20 pt-14 border-t border-brand-tan/15">
            <div className="flex items-center gap-3 mb-10">
              <span className="block w-[3px] h-4 bg-brand-terracotta flex-shrink-0" />
              <h2 className="font-display text-2xl md:text-3xl font-light text-brand-brown">
                You May Also Like
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
              {related.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
