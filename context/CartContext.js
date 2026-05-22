"use client";

import { createContext, useContext, useReducer, useEffect, useState } from "react";

const CartContext = createContext(null);

function cartReducer(state, action) {
  switch (action.type) {
    case "ADD_ITEM": {
      const { product, size, quantity = 1 } = action.payload;
      const key = `${product.id}-${size}`;
      const existing = state.items.find((i) => `${i.productId}-${i.size}` === key);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            `${i.productId}-${i.size}` === key ? { ...i, quantity: i.quantity + quantity } : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          { productId: product.id, slug: product.slug, name: product.name, image: product.image, price: product.price, size, quantity },
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
      return { ...state, items: state.items.map((i) => i.productId === productId && i.size === size ? { ...i, quantity } : i) };
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

  const addItem = (product, size, quantity = 1) => {
    dispatch({ type: "ADD_ITEM", payload: { product, size, quantity } });
    dispatch({ type: "OPEN_DRAWER" });
  };
  const removeItem = (productId, size) => dispatch({ type: "REMOVE_ITEM", payload: { productId, size } });
  const updateQuantity = (productId, size, quantity) => dispatch({ type: "UPDATE_QUANTITY", payload: { productId, size, quantity } });
  const clearCart = () => dispatch({ type: "CLEAR_CART" });
  const openDrawer = () => dispatch({ type: "OPEN_DRAWER" });
  const closeDrawer = () => dispatch({ type: "CLOSE_DRAWER" });

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items: mounted ? state.items : [], isDrawerOpen: state.isDrawerOpen, itemCount: mounted ? itemCount : 0, subtotal: mounted ? subtotal : 0, mounted, addItem, removeItem, updateQuantity, clearCart, openDrawer, closeDrawer }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
