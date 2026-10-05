"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSettings } from "@/context/SettingsContext";
import { formatPrice, shouldUnoptimizeImage, PLACEHOLDER_IMAGE } from "@/lib/utils";

export default function CartPage() {
  const { items, removeItem, updateQuantity, subtotal, syncWithServer, mounted } = useCart();

  // Check the basket against the shop the moment it is opened. A cart can sit
  // in localStorage for weeks, so this is where sold-out sizes get clamped and
  // withdrawn products drop out — rather than at checkout, where the customer
  // could only watch it fail.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    syncWithServer().then(({ changed }) => {
      if (cancelled || !changed.length) return;
      const gone = changed.filter((c) => c.status === "gone" || c.available === 0);
      const trimmed = changed.filter((c) => c.status === "limited" || c.status === "repriced");
      if (gone.length) toast(`${gone.length === 1 ? gone[0].name || "An item" : `${gone.length} items`} sold out and left your bag.`);
      for (const t of trimmed) if (t.reason) toast(t.reason);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
  const { settings } = useSettings();

  // The ERP prices the bag (items and any automatic discount); delivery needs
  // an address, so it is worked out at checkout.
  const [quote, setQuote] = useState(null);
  const lines = useMemo(() => items.map((i) => ({ skuId: i.skuId, qty: i.quantity })), [items]);
  useEffect(() => {
    if (!lines.length) { setQuote(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setQuote(d.quote); })
        .catch(() => {});
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [lines]);

  const itemsTotal = quote ? Number(quote.items.taka) : subtotal;
  const discount = quote ? Number(quote.discount.taka) : 0;
  const total = quote ? Number(quote.total.taka) : subtotal;
  const shippingRule = settings?.shipping || {};
  const freeShippingThreshold = shippingRule.freeShippingEnabled ? shippingRule.freeShippingThreshold : null;
  const freeShipping = shippingRule.freeShippingEnabled && (!freeShippingThreshold || itemsTotal >= freeShippingThreshold);
  const remaining = freeShippingThreshold ? Math.max(0, freeShippingThreshold - itemsTotal) : 0;

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
              {freeShippingThreshold > 0 && remaining > 0 && (
                <div className="bg-white border border-brand-tan/10 p-4">
                  <p className="text-[12px] text-brand-brown mb-2">
                    Add <strong className="text-brand-terracotta">{formatPrice(remaining)}</strong> more for free shipping
                  </p>
                  <div className="w-full bg-brand-cream-dark h-0.5">
                    <div className="bg-brand-terracotta h-0.5 transition-all duration-500" style={{ width: `${Math.min(100, (itemsTotal / freeShippingThreshold) * 100)}%` }} />
                  </div>
                </div>
              )}
              {freeShipping && (
                <div className="bg-emerald-50 border border-emerald-100 p-3 text-[12px] text-emerald-700 uppercase tracking-widest">
                  Free shipping unlocked
                </div>
              )}

              {items.map((item) => (
                <div key={`${item.productId}-${item.size}`} className="bg-white border border-brand-tan/10 p-5 flex gap-5">
                  <div className="relative w-20 h-28 flex-shrink-0 overflow-hidden bg-brand-cream-dark">
                    <Image
                      src={item.image || PLACEHOLDER_IMAGE}
                      alt={item.name}
                      fill
                      unoptimized={shouldUnoptimizeImage(item.image || PLACEHOLDER_IMAGE)}
                      sizes="80px"
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
                        <button className="w-8 h-8 flex items-center justify-center text-brand-brown hover:text-brand-terracotta disabled:opacity-40 disabled:hover:text-brand-brown" disabled={typeof item.maxStock === "number" && item.quantity >= item.maxStock} onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}>
                          <Plus size={11} />
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="flex items-baseline gap-2">
                          {item.regularPrice > item.price && (
                            <span className="text-[12px] text-brand-tan line-through">{formatPrice(item.regularPrice * item.quantity)}</span>
                          )}
                          <span className={`font-medium text-[14px] ${item.regularPrice > item.price ? "text-brand-terracotta" : "text-brand-brown"}`}>{formatPrice(item.price * item.quantity)}</span>
                        </span>
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
                    <span className="text-brand-brown" data-testid="cart-subtotal">{formatPrice(itemsTotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-brand-tan">Discount</span>
                      <span className="text-green-600">− {formatPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-brand-tan">Shipping</span>
                    <span className={freeShipping ? "text-emerald-600 font-medium" : "text-brand-tan"}>
                      {freeShipping ? "Free" : "At checkout"}
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
