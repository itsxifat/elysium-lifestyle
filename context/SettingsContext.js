"use client";

import { createContext, useContext, useState, useEffect } from "react";

const SettingsContext = createContext(null);

const defaultSettings = {
  siteInfo: {
    siteName: "Elysium Lifestyle",
    whatsappNumber: "8801700000000",
    freeShippingThreshold: 1500,
    shippingFee: 80,
  },
  paymentGateways: {
    sslcommerz: { enabled: false },
    cod: { enabled: true },
  },
  socialLinks: {},
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setSettings(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
