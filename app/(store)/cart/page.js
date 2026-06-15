"use client";

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";

export default function CartPage() {
  const { items, removeItem, updateQuantity, subtotal } = useCart();
  const { settings } = useSettings();

  const freeShippingThreshold = settings?.siteInfo?.freeShippingThreshold || 1500;
  const shippingFee = settings?.siteInfo?.shippingFee || 80;
  const shipping = subtotal >= freeShippingThreshold ? 0 : shippingFee;
  const total = subtotal + shipping;
  const remaining = Math.max(0, freeShippingThreshold - subtotal);

  return (
    <div className="bg-brand-cream min-h-screen py-12">
      <div className="container-custom">
        <h1 className="font-display text-3xl md:text-4xl font-medium text-brand-brown mb-10">Shopping Bag</h1>

        {items.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag size={48} strokeWidth={1} className="text-brand-tan opacity-30 mx-auto mb-6" />
            <p className="font-display text-2xl font-medium text-brand-brown mb-2">Your bag is empty</p>
            <p className="text-[13px] text-brand-tan mb-8">Explore our collections and add pieces you love</p>
            <Link href="/shop" className="btn-primary">Continue Shopping</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-4">
              {remaining > 0 && (
                <div className="bg-white border border-brand-tan/10 p-4">
                  <p className="text-[12px] text-brand-brown mb-2">
                    Add <strong className="text-brand-terracotta">{formatPrice(remaining)}</strong> more for free shipping
                  </p>
                  <div className="w-full bg-brand-cream-dark h-0.5">
                    <div className="bg-brand-terracotta h-0.5 transition-all duration-500" style={{ width: `${Math.min(100, (subtotal / freeShippingThreshold) * 100)}%` }} />
                  </div>
                </div>
              )}
              {remaining === 0 && (
                <div className="bg-emerald-50 border border-emerald-100 p-3 text-[12px] text-emerald-700 uppercase tracking-widest">
                  Free shipping unlocked
                </div>
              )}

              {items.map((item) => (
                <div key={`${item.productId}-${item.size}`} className="bg-white border border-brand-tan/10 p-5 flex gap-5">
                  <div className="relative w-20 h-28 flex-shrink-0 overflow-hidden bg-brand-cream-dark">
                    <Image
                      src={item.image || "/placeholder.jpg"}
                      alt={item.name}
                      fill
                      unoptimized={shouldUnoptimizeImage(item.image)}
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/shop/${item.slug}`} className="font-medium text-[14px] text-brand-brown hover:text-brand-terracotta transition-colors line-clamp-2">
                      {item.name}
                    </Link>
                    <p className="text-[11px] text-brand-tan uppercase tracking-widest mt-1">Size: {item.size}</p>
                    {item.sku && <p className="text-[10px] text-brand-tan/80 mt-0.5">SKU: {item.sku}</p>}
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center border border-brand-tan/40">
                        <button className="w-8 h-8 flex items-center justify-center text-brand-brown hover:text-brand-terracotta" onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}>
                          <Minus size={11} />
                        </button>
                        <span className="w-8 text-center text-[12px]">{item.quantity}</span>
                        <button className="w-8 h-8 flex items-center justify-center text-brand-brown hover:text-brand-terracotta" onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}>
                          <Plus size={11} />
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-brand-brown text-[14px]">{formatPrice(item.price * item.quantity)}</span>
                        <button className="text-brand-tan/50 hover:text-red-500 transition-colors" onClick={() => removeItem(item.productId, item.size)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white border border-brand-tan/10 p-6 sticky top-36">
                <p className="text-[11px] uppercase tracking-widest text-brand-tan mb-5">Order Summary</p>
                <div className="space-y-3 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-brand-tan">Subtotal</span>
                    <span className="text-brand-brown">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-tan">Shipping</span>
                    <span className={shipping === 0 ? "text-emerald-600 font-medium" : "text-brand-brown"}>
                      {shipping === 0 ? "Free" : formatPrice(shipping)}
                    </span>
                  </div>
                  <div className="h-px bg-brand-tan/10" />
                  <div className="flex justify-between font-medium text-[15px]">
                    <span className="text-brand-brown">Total</span>
                    <span className="text-brand-brown">{formatPrice(total)}</span>
                  </div>
                </div>
                <Link href="/checkout" className="btn-primary w-full text-center mt-6 py-4 flex items-center justify-center gap-2 text-[11px] tracking-[3px]">
                  Checkout <ArrowRight size={14} />
                </Link>
                <Link href="/shop" className="block text-center mt-4 text-[11px] uppercase tracking-widest text-brand-tan hover:text-brand-brown transition-colors">
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
