"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { CartProvider } from "@/context/CartContext";
import { SettingsProvider } from "@/context/SettingsContext";

export default function Providers({ children, session }) {
  return (
    <SessionProvider session={session}>
      <CartProvider>
        <SettingsProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: "#2C1810",
                color: "#F5F0E8",
                borderRadius: "0",
                fontSize: "14px",
              },
              success: {
                iconTheme: {
                  primary: "#B85C3A",
                  secondary: "#F5F0E8",
                },
              },
            }}
          />
        </SettingsProvider>
      </CartProvider>
    </SessionProvider>
  );
}
