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
