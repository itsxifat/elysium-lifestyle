"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ChevronRight, ChevronDown, X,
  MessageCircle, Zap,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import ImageGallery from "@/components/product/ImageGallery";
import VariantSelector, { ColourSelector } from "@/components/product/VariantSelector";
import AddToCartButton from "@/components/product/AddToCartButton";
import ProductCard from "@/components/shop/ProductCard";
import { CountdownText } from "@/components/flash/Countdown";
import { track } from "@/lib/tracking/client";
import { useSettings } from "@/context/SettingsContext";
import WasPrice from "@/components/ui/WasPrice";
import { coloursOf, galleryFor, priceSummary } from "@/lib/storefront-map";

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
            <p className="text-[10px] text-brand-tan mt-0.5">All measurements in inches unless stated</p>
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

export default function ProductDetailClient({ product, related = [], categoryPath = [] }) {
  const { settings } = useSettings();
  const [selectedSize, setSelectedSize] = useState("");
  const [showSizeChart, setShowSizeChart] = useState(false);

  const variants = useMemo(() => product.variants || [], [product.variants]);
  // A product in more than one colour (and sizes) gets a colour picker: it shows
  // that colour's sizes and switches the gallery to that colour's photos (the
  // ERP's photos by colour, D-643). It starts on the first colour in stock.
  const colours = useMemo(() => coloursOf(product), [product]);
  const pickColour = colours.length > 1 && variants.some((v) => v.sizeOnly);
  const [colour, setColour] = useState(() =>
    pickColour ? (variants.find((v) => v.colour && v.stock > 0)?.colour || colours[0]) : null
  );
  const shownVariants = pickColour ? variants.filter((v) => v.colour === colour) : variants;
  const labelOf = (v) => (pickColour ? v.sizeOnly || v.size : v.size);

  const selectedVariant = variants.find((v) => v.size === selectedSize);
  // Colours without sizes are picked as the "sizes" themselves; one colour never switches.
  const galleryColour = pickColour ? colour : colours.length > 1 ? selectedVariant?.colour || null : null;
  const gallery = useMemo(() => galleryFor(product, galleryColour), [product, galleryColour]);

  const changeColour = (next) => {
    setColour(next);
    // Keep the chosen size in the new colour when it comes in it.
    const same = selectedVariant && variants.find((v) => v.colour === next && v.sizeOnly === selectedVariant.sizeOnly && v.stock > 0);
    setSelectedSize(same ? same.size : "");
  };

  // What a shopper pays now (a live flash price included) and the regular price
  // struck through, both the ERP's (M39b, D-640); for the chosen colour's sizes.
  const summary = priceSummary(shownVariants);
  const minPrice = summary.min;
  const hasPriceRange = summary.min !== summary.max;

  // A live flash sale on this product: the strip names the sale the selected
  // size is priced from (sizes can come from different sales), else any. The
  // ERP's quote at checkout has the final word.
  const flash = product.flash || null;
  const deal = selectedVariant?.flash || null;
  const flashSale = deal?.sale || flash?.sale || null;

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

  const whatsappNumber =
    settings?.siteInfo?.whatsappNumber || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
  const whatsappMsg = encodeURIComponent(`Hi, I'm interested in: ${product.name}`);

  return (
    <div className="bg-brand-cream min-h-screen">
      <div className="container-custom py-6 md:py-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[10px] text-brand-tan mb-8 uppercase tracking-[2px] flex-wrap">
          <Link href="/" className="hover:text-brand-brown transition-colors">Home</Link>
          <ChevronRight size={10} strokeWidth={2.5} />
          <Link href="/shop" className="hover:text-brand-brown transition-colors">Shop</Link>
          {categoryPath.map((c) => (
            <span key={c._id} className="flex items-center gap-1.5">
              <ChevronRight size={10} strokeWidth={2.5} />
              <Link href={`/shop?category=${c.slug}`} className="hover:text-brand-brown transition-colors">
                {c.name}
              </Link>
            </span>
          ))}
          <ChevronRight size={10} strokeWidth={2.5} />
          <span className="text-brand-brown/60 truncate max-w-[180px] normal-case tracking-normal text-[11px]">
            {product.name}
          </span>
        </nav>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 lg:gap-14 lg:items-start">

          {/* Left — gallery */}
          {/* A new gallery per colour: it opens on the colour's first photo. */}
          <ImageGallery key={galleryColour || "all"} images={gallery} name={product.name} />

          {/* Right — info (sticky on desktop) */}
          <div className="lg:sticky lg:top-[165px] space-y-5">

            {/* Category + new badge */}
            <div className="flex items-center gap-2.5">
              {product.category && (
                <Link
                  href={`/shop?category=${product.category.slug}`}
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

            {/* Flash sale strip */}
            {flashSale && (
              <Link
                href={`/flash-sale/${flashSale.slug}`}
                className="flex items-center justify-between gap-3 bg-brand-terracotta text-white px-4 py-2.5 hover:bg-brand-terracotta-dark transition-colors"
              >
                <span className="flex items-center gap-2 text-[11px] uppercase tracking-[2px] font-semibold min-w-0">
                  <Zap size={14} fill="currentColor" className="flex-shrink-0" />
                  <span className="truncate">{flashSale.title}</span>
                </span>
                <span className="text-[11px] whitespace-nowrap">
                  {flashSale.endsAt ? (
                    <>Ends in <CountdownText key={flashSale._id} target={flashSale.endsAt} className="font-bold" /></>
                  ) : (
                    "Limited stock"
                  )}
                </span>
              </Link>
            )}

            {/* Price */}
            <div className="flex items-baseline gap-3 flex-wrap" data-testid="product-price">
              {selectedVariant ? (
                <>
                  <span className={`text-2xl font-semibold tracking-tight tabular-nums ${selectedVariant.compareAt ? "text-brand-terracotta" : "text-brand-brown"}`}>
                    {formatPrice(selectedVariant.price)}
                  </span>
                  <WasPrice amount={selectedVariant.compareAt} className="text-base" />
                  {selectedVariant.discount > 0 && (
                    <span className="text-[11px] font-bold text-white bg-brand-terracotta px-2 py-0.5">-{selectedVariant.discount}%</span>
                  )}
                </>
              ) : summary.maxDiscount > 0 ? (
                <>
                  <span className="text-2xl font-semibold text-brand-terracotta tracking-tight tabular-nums">
                    {hasPriceRange ? "From " : ""}
                    {formatPrice(minPrice)}
                  </span>
                  <WasPrice amount={summary.compareAt} className="text-base" />
                  <span className="text-[11px] font-bold text-white bg-brand-terracotta px-2 py-0.5">
                    {hasPriceRange || summary.maxDiscount !== summary.discount ? `Up to ${summary.maxDiscount}% off` : `-${summary.discount}%`}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-semibold text-brand-brown tracking-tight tabular-nums">
                    {hasPriceRange ? `${formatPrice(summary.min)} – ${formatPrice(summary.max)}` : formatPrice(minPrice)}
                  </span>
                  {hasPriceRange && (
                    <span className="text-[10px] text-brand-tan uppercase tracking-wider">varies by size</span>
                  )}
                </>
              )}
            </div>
            {deal && deal.remaining <= 10 && (
              <p className="text-[12px] text-brand-terracotta font-medium -mt-2">
                Only {deal.remaining} left at this price
              </p>
            )}
            {flash && selectedVariant && !deal && (
              <p className="text-[11px] text-brand-tan -mt-2">Size {labelOf(selectedVariant)} isn&apos;t part of the flash sale.</p>
            )}

            {selectedVariant?.sku && (
              <p className="text-[11px] text-brand-tan tracking-wide">
                SKU: <span className="text-brand-brown/70 font-medium">{selectedVariant.sku}</span>
              </p>
            )}

            <div className="h-px bg-brand-tan/15" />

            {/* Variants */}
            {pickColour && (
              <ColourSelector colours={colours} selected={colour} onChange={changeColour} variants={variants} />
            )}
            <VariantSelector
              variants={shownVariants}
              selectedSize={selectedSize}
              onSizeChange={setSelectedSize}
              hasSizeChart={!!product.sizeChart}
              onSizeGuideClick={() => setShowSizeChart(true)}
              labelOf={labelOf}
            />

            {/* Add to cart */}
            <AddToCartButton
              product={product}
              selectedSize={selectedSize}
              selectedVariant={selectedVariant}
              image={gallery[0]}
            />

            {/* WhatsApp enquiry */}
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}?text=${whatsappMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full border border-brand-tan/30 py-3 text-[10px] uppercase tracking-[2px] text-brand-tan hover:border-brand-brown hover:text-brand-brown transition-all duration-200"
              >
                <MessageCircle size={13} strokeWidth={1.5} />
                Enquire on WhatsApp
              </a>
            )}

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
