"use client";

import { createContext, useContext, useState } from "react";

// The site's public settings (name, contact details, social links, menu,
// announcement, shipping rule and payment methods). They come from the brand
// ERP's `GET /storefront/v1/site`, read on the server by the root layout
// (lib/storefront.js → getSite) and handed down here, so no client component
// fetches them and no page waits on a second round trip.

const SettingsContext = createContext(null);

const defaultSettings = {
  siteInfo: { siteName: "Elysium Lifestyle", whatsappNumber: "", phone: "", email: "", address: "" },
  socialLinks: {},
  announcement: { enabled: false, text: "", link: "" },
  navItems: [],
  shipping: { freeShippingEnabled: false, freeShippingThreshold: null, zones: {} },
  paymentGateways: { cod: { enabled: true }, sslcommerz: { enabled: false } },
};

export function SettingsProvider({ children, initial }) {
  const [settings, setSettings] = useState(initial || defaultSettings);
  return (
    <SettingsContext.Provider value={{ settings, loading: false, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
