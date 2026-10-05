"use client";

import { createContext, useContext, useReducer, useEffect, useState, useRef } from "react";
import { track } from "@/lib/tracking/client";

const CartContext = createContext(null);

// The cart lives in the browser. Each line names the ERP SKU it buys (`skuId`);
// prices shown here are what the shop last told us, and the ERP's quote and
// checkout have the final word.
//
// Stored under a new key: a cart saved by the old site names products and sizes
// the ERP does not know, so it is left behind rather than sent.
const STORAGE_KEY = "elysium-cart-v2";

// A line may never carry more units than the shop actually has. `maxStock` is
// what the server last told us about this size; undefined means we have not
// been told yet, and the line is left alone rather than guessed at. The ERP
// re-checks everything at checkout regardless — this only stops the customer
// building a basket that is guaranteed to be rejected.
const MAX_LINE_QTY = 20;
const capped = (quantity, maxStock) => {
  const q = Math.min(MAX_LINE_QTY, Math.max(1, Math.floor(Number(quantity) || 1)));
  return typeof maxStock === "number" ? Math.max(0, Math.min(q, maxStock)) : q;
};

function cartReducer(state, action) {
  switch (action.type) {
    case "ADD_ITEM": {
      const { product, size, quantity = 1, maxStock } = action.payload;
      const key = `${product.id}-${size}`;
      const existing = state.items.find((i) => `${i.productId}-${i.size}` === key);
      if (existing) {
        const limit = typeof maxStock === "number" ? maxStock : existing.maxStock;
        // The newest add knows the current price (a flash deal may have started
        // or ended since the line was created); the server has the final word.
        const price = typeof product.price === "number" ? product.price : existing.price;
        return {
          ...state,
          items: state.items.map((i) =>
            `${i.productId}-${i.size}` === key
              ? {
                  ...i,
                  skuId: product.skuId || i.skuId,
                  price,
                  regularPrice: product.regularPrice > price ? product.regularPrice : undefined,
                  quantity: capped(i.quantity + quantity, limit),
                  maxStock: limit,
                }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            productId: product.id, skuId: product.skuId, slug: product.slug, name: product.name, image: product.image,
            price: product.price,
            // The shelf price, when `price` is a flash price below it — shown struck through.
            regularPrice: product.regularPrice > product.price ? product.regularPrice : undefined,
            sku: product.sku || "", size, quantity: capped(quantity, maxStock), maxStock,
          },
        ],
      };
    }
    case "REMOVE_ITEM": {
      return { ...state, items: state.items.filter((i) => !(i.productId === action.payload.productId && i.size === action.payload.size)) };
    }
    case "UPDATE_QUANTITY": {
      const { productId, size, quantity } = action.payload;
      if (quantity < 1) {
        return { ...state, items: state.items.filter((i) => !(i.productId === productId && i.size === size)) };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.productId === productId && i.size === size
            ? { ...i, quantity: capped(quantity, i.maxStock) }
            : i
        ),
      };
    }

    // Replace the cart with what the ERP says is still buyable: dead lines
    // dropped, over-ordered lines clamped, prices refreshed.
    case "RECONCILE": {
      const bySku = new Map(action.payload.map((l) => [l.skuId, l]));
      const items = [];
      for (const i of state.items) {
        const line = bySku.get(i.skuId);
        if (!line) { items.push(i); continue; }          // not reported on, leave as is
        if (line.status === "gone" || line.available === 0) continue;  // unbuyable, drop
        const price = typeof line.price === "number" ? line.price : i.price;
        items.push({
          ...i,
          name: line.name ?? i.name,
          sku: line.sku ?? i.sku,
          price,
          regularPrice: typeof line.regularPrice === "number" && line.regularPrice > price ? line.regularPrice : undefined,
          maxStock: line.available,
          quantity: capped(i.quantity, line.available),
        });
      }
      return { ...state, items };
    }
    case "CLEAR_CART":
      return { ...state, items: [] };
    case "OPEN_DRAWER":
      return { ...state, isDrawerOpen: true };
    case "CLOSE_DRAWER":
      return { ...state, isDrawerOpen: false };
    case "HYDRATE":
      return { ...state, items: action.payload };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isDrawerOpen: false });
  const [mounted, setMounted] = useState(false);
  // syncWithServer reads the cart at call time, not at render time, so it never
  // posts a stale basket back to the server.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored);
        if (Array.isArray(items)) dispatch({ type: "HYDRATE", payload: items.filter((i) => i && i.skuId) });
      }
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {}
  }, [state.items, mounted]);

  // Ask the ERP what this cart is still worth and heal it. Returns the lines it
  // had to change so the caller can tell the customer why their basket just
  // moved under them.
  const syncWithServer = async () => {
    const current = stateRef.current.items;
    if (!current.length) return { changed: [] };
    try {
      const res = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `price` is what the customer is being shown, so the server can say
        // when it has moved (a flash deal ending, say) instead of silently
        // changing the total under them.
        body: JSON.stringify({
          items: current.map((i) => ({ skuId: i.skuId, name: i.name, size: i.size, quantity: i.quantity, price: i.price })),
        }),
      });
      if (!res.ok) return { changed: [] };
      const { lines = [] } = await res.json();
      dispatch({ type: "RECONCILE", payload: lines });
      return { changed: lines.filter((l) => l.status && l.status !== "ok") };
    } catch {
      return { changed: [] };   // offline or server down: leave the cart alone
    }
  };

  // Apply what the ERP said at checkout (409 OUT_OF_STOCK lines, or a fresh quote).
  const reconcile = (lines) => dispatch({ type: "RECONCILE", payload: lines });

  const addItem = (product, size, quantity = 1, maxStock) => {
    dispatch({ type: "ADD_ITEM", payload: { product, size, quantity, maxStock } });
    dispatch({ type: "OPEN_DRAWER" });
    // Single choke point for add-to-cart (button + quick-add modal both call this).
    track.addToCart({
      customData: {
        value: (product.price || 0) * quantity,
        currency: "BDT",
        content_type: "product",
        content_ids: [product.id],
        content_name: product.name,
        contents: [{ id: product.id, quantity, item_price: product.price }],
        num_items: quantity,
      },
    });
  };
  const removeItem = (productId, size) => dispatch({ type: "REMOVE_ITEM", payload: { productId, size } });
  const updateQuantity = (productId, size, quantity) => dispatch({ type: "UPDATE_QUANTITY", payload: { productId, size, quantity } });
  const clearCart = () => dispatch({ type: "CLEAR_CART" });
  const openDrawer = () => dispatch({ type: "OPEN_DRAWER" });
  const closeDrawer = () => dispatch({ type: "CLOSE_DRAWER" });

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  // A display estimate only; the ERP's quote is what is charged.
  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items: mounted ? state.items : [], isDrawerOpen: state.isDrawerOpen, itemCount: mounted ? itemCount : 0, subtotal: mounted ? subtotal : 0, mounted, addItem, removeItem, updateQuantity, clearCart, openDrawer, closeDrawer, syncWithServer, reconcile }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
