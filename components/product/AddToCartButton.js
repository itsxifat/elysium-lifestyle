"use client";

import { useState, useEffect } from "react";
import { ShoppingBag, Minus, Plus } from "lucide-react";
import { useCart } from "@/context/CartContext";
import toast from "react-hot-toast";

// `selectedVariant.flash` is the size's live flash offer ({ sale, remaining }),
// if any; `image` is the photo the gallery shows (the chosen colour's).
export default function AddToCartButton({ product, selectedSize, selectedVariant, image = null }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const deal = selectedVariant?.flash || null;
  const isAvailable = selectedVariant && selectedVariant.stock > 0;
  // A flash line can only hold what the deal has left — past that the whole
  // line would be charged the normal price at checkout.
  const lineCap = selectedVariant ? Math.min(selectedVariant.stock, deal ? deal.remaining : Infinity) : 1;
  const maxQty = Math.max(1, lineCap);

  // A new size (or deal) can have less room than the quantity already chosen.
  useEffect(() => {
    setQuantity((q) => Math.min(q, maxQty));
  }, [maxQty]);

  const handleAdd = () => {
    if (!selectedSize) {
      toast.error("Please select a size");
      return;
    }
    if (!isAvailable) {
      toast.error("This size is out of stock");
      return;
    }
    addItem(
      {
        id: product._id,
        skuId: selectedVariant.skuId,
        slug: product.slug,
        name: product.name,
        image: image || product.images?.[0],
        // What the shop charges now and, struck through, the ERP's regular price.
        price: selectedVariant.price,
        regularPrice: selectedVariant.compareAt ?? undefined,
        sku: selectedVariant.sku || "",
      },
      selectedSize,
      quantity,
      // The stepper above caps a single add; this caps the LINE. Without it,
      // adding 10 twice put 20 in the bag against a stock of 5.
      lineCap
    );
    toast.success(`${product.name} added to cart!`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-[11px] uppercase tracking-widest text-brand-tan font-medium">Qty</span>
        <div className="flex items-center border border-brand-tan/40">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            className="w-10 h-10 flex items-center justify-center text-brand-brown hover:text-brand-terracotta transition-colors"
          >
            <Minus size={13} />
          </button>
          <span className="w-10 text-center text-sm font-medium text-brand-brown">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            aria-label="Increase quantity"
            className="w-10 h-10 flex items-center justify-center text-brand-brown hover:text-brand-terracotta transition-colors"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      <button
        onClick={handleAdd}
        disabled={!isAvailable && !!selectedSize}
        className="w-full bg-brand-brown text-brand-cream py-4 text-[11px] uppercase font-medium tracking-[3px] hover:bg-brand-terracotta disabled:bg-brand-tan/50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-3"
      >
        <ShoppingBag size={15} strokeWidth={1.5} />
        {!selectedSize ? "Select a Size" : isAvailable ? (deal ? "Add to Bag · Flash Price" : "Add to Bag") : "Out of Stock"}
      </button>
    </div>
  );
}
