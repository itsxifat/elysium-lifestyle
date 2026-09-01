"use client";

import { createContext, useContext, useReducer, useEffect, useState, useRef } from "react";
import { track } from "@/lib/tracking/client";

const CartContext = createContext(null);

// A line may never carry more units than the shop actually has. `maxStock` is
// what the server last told us about this variant; undefined means we have not
// been told yet, and the line is left alone rather than guessed at. The server
// re-checks everything at checkout regardless — this only stops the customer
// building a basket that is guaranteed to be rejected.
const capped = (quantity, maxStock) => {
  const q = Math.max(1, Math.floor(Number(quantity) || 1));
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
        return {
          ...state,
          items: state.items.map((i) =>
            `${i.productId}-${i.size}` === key
              ? { ...i, quantity: capped(i.quantity + quantity, limit), maxStock: limit }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          { productId: product.id, slug: product.slug, name: product.name, image: product.image, price: product.price, sku: product.sku || "", size, quantity: capped(quantity, maxStock), maxStock },
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

    // Replace the cart with what the server says is still buyable: dead lines
    // dropped, over-ordered lines clamped, prices refreshed.
    case "RECONCILE": {
      const byKey = new Map(action.payload.map((l) => [`${l.productId}-${l.size}`, l]));
      const items = [];
      for (const i of state.items) {
        const line = byKey.get(`${i.productId}-${i.size}`);
        if (!line) { items.push(i); continue; }          // not reported on, leave as is
        if (line.status === "gone" || line.available === 0) continue;  // unbuyable, drop
        items.push({
          ...i,
          name: line.name ?? i.name,
          image: line.image || i.image,
          sku: line.sku ?? i.sku,
          price: typeof line.price === "number" ? line.price : i.price,
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
      const stored = localStorage.getItem("elysium-cart");
      if (stored) dispatch({ type: "HYDRATE", payload: JSON.parse(stored) });
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem("elysium-cart", JSON.stringify(state.items));
  }, [state.items, mounted]);

  // Ask the server what this cart is still worth and heal it. Returns the
  // lines it had to change so the caller can tell the customer why their
  // basket just moved under them.
  const syncWithServer = async () => {
    const current = stateRef.current.items;
    if (!current.length) return { changed: [] };
    try {
      const res = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: current.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })) }),
      });
      if (!res.ok) return { changed: [] };
      const { lines = [] } = await res.json();
      dispatch({ type: "RECONCILE", payload: lines });
      return { changed: lines.filter((l) => l.status && l.status !== "ok") };
    } catch {
      return { changed: [] };   // offline or server down: leave the cart alone
    }
  };

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
  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items: mounted ? state.items : [], isDrawerOpen: state.isDrawerOpen, itemCount: mounted ? itemCount : 0, subtotal: mounted ? subtotal : 0, mounted, addItem, removeItem, updateQuantity, clearCart, openDrawer, closeDrawer, syncWithServer }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
