// Shared tracking constants and small pure helpers (no DB / no node-only deps,
// so this file is safe to import from both server and client bundles).

export const DEFAULT_META_API_VERSION = "v21.0";

// The standard events we expose first-class toggles for.
export const STANDARD_EVENTS = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Search",
  "Lead",
  "CompleteRegistration",
];

// Meta event name -> GA4 recommended event name.
export const GA4_EVENT_MAP = {
  PageView: "page_view",
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Search: "search",
  Lead: "generate_lead",
  CompleteRegistration: "sign_up",
};

// Map a Meta-style event name to a GA4 event name. Custom events are converted
// to snake_case and sanitized to GA4's allowed character set.
export function toGa4EventName(name) {
  if (GA4_EVENT_MAP[name]) return GA4_EVENT_MAP[name];
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

// Default per-event routing used when seeding config or for unknown/custom events.
export function defaultEventSetting(name) {
  return { name, enabled: true, client: true, server: true, meta: true, ga4: true };
}
