"use client";

import { useState } from "react";
import { ShoppingBag, Minus, Plus } from "lucide-react";
import { useCart } from "@/context/CartContext";
import toast from "react-hot-toast";

export default function AddToCartButton({ product, selectedSize, selectedVariant }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const isAvailable = selectedVariant && selectedVariant.stock > 0;
  const maxQty = selectedVariant?.stock || 1;

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
        slug: product.slug,
        name: product.name,
        image: product.images?.[0],
        price: selectedVariant.price,
        sku: selectedVariant.sku || "",
      },
      selectedSize,
      quantity,
      // The stepper above caps a single add; this caps the LINE. Without it,
      // adding 10 twice put 20 in the bag against a stock of 5.
      selectedVariant.stock
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
            className="w-10 h-10 flex items-center justify-center text-brand-brown hover:text-brand-terracotta transition-colors"
          >
            <Minus size={13} />
          </button>
          <span className="w-10 text-center text-sm font-medium text-brand-brown">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
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
        {!selectedSize ? "Select a Size" : isAvailable ? "Add to Bag" : "Out of Stock"}
      </button>
    </div>
  );
}
