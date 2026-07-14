// The landing-page offer pricing rule, in a pure module so the browser can
// preview a price as the customer switches sizes while the server stays the only
// authority on what is actually charged (see lib/landing.js → priceOffer).
//
// Exposing the rule to the client leaks nothing: it's the same discount the page
// already displays. A tampered request still gets repriced from the DB.

// Apply an offer's pricing rule to the undiscounted ("regular") total.
// Always ≥ 0 and never above the regular total — a rule that would raise the
// price is a config error, so clamp rather than overcharge.
export function applyOfferPricing(pricing, regularTotal) {
  const v = Math.max(0, Number(pricing?.priceValue ?? pricing?.value) || 0);
  let total;
  switch (pricing?.pricingMode ?? pricing?.mode) {
    case "fixed":
      total = v;
      break;
    case "percent":
      total = regularTotal * (1 - Math.min(v, 100) / 100);
      break;
    case "amount":
      total = regularTotal - v;
      break;
    default:
      total = regularTotal;
  }
  return Math.max(0, Math.min(Math.round(total), Math.round(regularTotal)));
}

export const PRICING_MODES = [
  { value: "auto", label: "No discount (sum of product prices)" },
  { value: "fixed", label: "Fixed bundle price" },
  { value: "percent", label: "Percentage off" },
  { value: "amount", label: "Amount off (৳)" },
];

// A collection offer's price ladder → the price for a given total quantity.
// Non-linear and fully manual: we return the price of the highest tier whose
// quantity is ≤ `qty` (so a gap in the ladder floors to the tier below), and
// null when `qty` is below the smallest tier (nothing valid to charge yet).
// Shared by the client preview and the server (the authority) so they agree.
export function tierPriceFor(tiers, qty) {
  if (!Array.isArray(tiers) || !tiers.length || qty <= 0) return null;
  const sorted = [...tiers]
    .map((t) => ({ quantity: Number(t.quantity) || 0, price: Math.max(0, Number(t.price) || 0) }))
    .filter((t) => t.quantity >= 1)
    .sort((a, b) => a.quantity - b.quantity);
  let match = null;
  for (const t of sorted) {
    if (t.quantity <= qty) match = t;
    else break;
  }
  return match ? match.price : null;
}

// The largest quantity the ladder prices — the cap on how many a customer may
// add to a collection order.
export function maxTierQuantity(tiers) {
  if (!Array.isArray(tiers) || !tiers.length) return 0;
  return Math.max(0, ...tiers.map((t) => Number(t.quantity) || 0));
}

// The smallest quantity the ladder prices — the minimum a customer must add.
export function minTierQuantity(tiers) {
  const qs = (tiers || []).map((t) => Number(t.quantity) || 0).filter((q) => q >= 1);
  return qs.length ? Math.min(...qs) : 0;
}
