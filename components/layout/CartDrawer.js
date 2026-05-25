"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, ShoppingBag, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";

export default function CartDrawer() {
  const { items, isDrawerOpen, closeDrawer, removeItem, updateQuantity, subtotal } = useCart();

  useEffect(() => {
    document.body.style.overflow = isDrawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isDrawerOpen]);

  return (
    <>
      {isDrawerOpen && (
        <div className="fixed inset-0 bg-brand-brown/40 backdrop-blur-sm z-50" onClick={closeDrawer} />
      )}
      <div className={`fixed top-0 right-0 h-full w-full max-w-[420px] bg-white z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isDrawerOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-brand-tan/10">
          <div className="flex items-center gap-2.5">
            <ShoppingBag size={18} strokeWidth={1.5} className="text-brand-brown" />
            <span className="text-[13px] font-medium text-brand-brown uppercase tracking-widest">
              Your Bag ({items.length})
            </span>
          </div>
          <button onClick={closeDrawer} className="text-brand-tan hover:text-brand-brown transition-colors">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-6">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <ShoppingBag size={40} strokeWidth={1} className="text-brand-tan opacity-40" />
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Your bag is empty</p>
                <p className="text-[12px] text-brand-tan mt-1">Add some pieces to get started</p>
              </div>
              <Link href="/shop" onClick={closeDrawer} className="btn-primary mt-2 text-[11px] py-3 px-8">
                Shop Now
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-brand-tan/10">
              {items.map((item) => (
                <div key={`${item.productId}-${item.size}`} className="flex gap-4 py-5">
                  <div className="relative w-18 h-24 flex-shrink-0 bg-brand-cream-dark overflow-hidden" style={{width: 72}}>
                    <Image
                      src={item.image || "/placeholder.jpg"}
                      alt={item.name}
                      fill
                      unoptimized={shouldUnoptimizeImage(item.image)}
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/shop/${item.slug}`} onClick={closeDrawer} className="text-[13px] font-medium text-brand-brown hover:text-brand-terracotta line-clamp-2 leading-snug">
                      {item.name}
                    </Link>
                    <p className="text-[11px] text-brand-tan mt-1 uppercase tracking-wider">Size: {item.size}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[13px] font-medium text-brand-brown">{formatPrice(item.price * item.quantity)}</span>
                      <div className="flex items-center gap-1">
                        <button className="w-6 h-6 border border-brand-tan/40 flex items-center justify-center text-brand-brown hover:border-brand-terracotta transition-colors" onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}>
                          <Minus size={9} />
                        </button>
                        <span className="w-7 text-center text-[12px] font-medium text-brand-brown">{item.quantity}</span>
                        <button className="w-6 h-6 border border-brand-tan/40 flex items-center justify-center text-brand-brown hover:border-brand-terracotta transition-colors" onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}>
                          <Plus size={9} />
                        </button>
                        <button className="ml-1 text-brand-tan/50 hover:text-red-500 transition-colors" onClick={() => removeItem(item.productId, item.size)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-brand-tan/10 px-6 py-5 space-y-4 bg-brand-cream/40">
            <div className="flex items-center justify-between">
              <span className="text-[12px] uppercase tracking-widest text-brand-tan">Subtotal</span>
              <span className="text-base font-medium text-brand-brown">{formatPrice(subtotal)}</span>
            </div>
            <p className="text-[11px] text-brand-tan">Shipping calculated at checkout</p>
            <Link href="/checkout" onClick={closeDrawer} className="btn-primary w-full text-center block py-4 text-[11px] tracking-[3px]">
              Checkout
            </Link>
            <Link href="/cart" onClick={closeDrawer} className="block text-center text-[11px] uppercase tracking-widest text-brand-tan hover:text-brand-brown transition-colors">
              View Cart
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
