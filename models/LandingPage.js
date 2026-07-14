import mongoose from "mongoose";

// A standalone marketing LANDING PAGE served at /lp/<code>.
//
// Everything a customer sees is composed of reorderable BLOCKS (hero, gallery,
// features, FAQ, order form…) — see lib/landing-blocks.js for the catalog and
// each type's `data` shape. Blocks are stored as opaque `data` objects so a new
// block type only needs a renderer + a default, never a schema migration.
//
// What the page SELLS is a list of OFFERS. An offer is one or more products
// (quantity each) sold together at a landing-page-specific price — so the same
// model covers "just this one product" and "3-piece bundle at ৳1990". The
// customer picks exactly one offer, chooses a size per line, and checks out with
// cash on delivery without ever leaving the page.
//
// Pricing is NEVER trusted from the client: lib/landing.js recomputes an offer's
// total from the live product variants at order time. See priceOffer().

const blockSchema = new mongoose.Schema(
  {
    // Stable client-generated id so React keys survive reordering.
    key: { type: String, required: true },
    type: { type: String, required: true }, // see LANDING_BLOCKS
    enabled: { type: Boolean, default: true },
    data: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const offerItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, default: 1, min: 1 },
    // Pin a size, or leave "" to let the customer choose one on the page.
    size: { type: String, default: "" },
  },
  { _id: false }
);

// One rung of a collection offer's manual price ladder: "buy this many total,
// pay exactly this". Non-linear by design — 3 pieces is whatever the admin typed,
// not 3× the single price. (No field named `type` here, so the inline shape is
// safe — see [[mongoose-type-key-gotcha]].)
const tierSchema = new mongoose.Schema(
  {
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const offerSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true }, // "Buy 1", "Family bundle"
    description: { type: String, default: "" },
    badge: { type: String, default: "" }, // "Most popular", "Save 25%"
    image: { type: String, default: "" }, // optional override thumbnail

    // Three shapes of offer:
    //   fixed      → `items` is the exact set sold together; price via pricingMode.
    //   collection → `items` is a POOL the customer mixes & matches from; they
    //                pick any total quantity and pay `tiers[thatQuantity]`.
    //   alacarte   → `items` is a POOL the customer freely picks from, each at its
    //                OWN price; the cart total is the sum (then pricingMode may
    //                apply a flat discount, and page promotions on top).
    kind: { type: String, enum: ["fixed", "collection", "alacarte"], default: "fixed" },

    items: { type: [offerItemSchema], default: [] },

    // ── fixed / à la carte pricing ───────────────────────────────────────────
    // How the offer's total is derived from the live variant prices ("regular"):
    //   auto    → regular total, no discount
    //   fixed   → `priceValue` is the total for the whole offer (fixed kind only)
    //   percent → regular total minus `priceValue`%
    //   amount  → regular total minus ৳`priceValue`
    pricingMode: { type: String, enum: ["auto", "fixed", "percent", "amount"], default: "auto" },
    priceValue: { type: Number, default: 0, min: 0 },

    // ── collection pricing ───────────────────────────────────────────────────
    // The manual quantity→price ladder. Sorted ascending by quantity when saved.
    tiers: { type: [tierSchema], default: [] },

    // Optional order-quantity limits for collection / à la carte (0 = no limit).
    minQty: { type: Number, default: 0, min: 0 },
    maxQty: { type: Number, default: 0, min: 0 },

    // Strike-through price. 0 → fall back to the computed regular total.
    compareAtPrice: { type: Number, default: 0, min: 0 },

    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

// Delivery charge for this landing page specifically. Storefront shipping rules
// (free-shipping thresholds, cart totals) do not apply to LP funnels.
const shippingSchema = new mongoose.Schema(
  {
    // settings → inherit the store's zone rates; free → ৳0; flat → one rate for
    // everyone; zones → the three rates configured right here.
    mode: { type: String, enum: ["settings", "free", "flat", "zones"], default: "settings" },
    flat: { type: Number, default: 0, min: 0 },
    insideDhaka: { type: Number, default: 60, min: 0 },
    suburbs: { type: Number, default: 100, min: 0 },
    outsideDhaka: { type: Number, default: 130, min: 0 },
    // Show the inside/outside-Dhaka picker. Off → everyone billed insideDhaka.
    askZone: { type: Boolean, default: true },
  },
  { _id: false }
);

// A single "spend/buy this much → get this off" rule. Applies to the whole page
// (every offer). See lib/landing-promotions.js for evaluation. No field named
// `type` — safe as an inline shape.
const discountRuleSchema = new mongoose.Schema(
  {
    basis: { type: String, enum: ["amount", "quantity"], default: "amount" }, // threshold on ৳ or pieces
    threshold: { type: Number, default: 0, min: 0 },
    rewardType: { type: String, enum: ["amount", "percent"], default: "amount" },
    value: { type: Number, default: 0, min: 0 }, // ৳ off, or % off
    maxDiscount: { type: Number, default: 0, min: 0 }, // cap for percent (0 = uncapped)
    label: { type: String, default: "" }, // optional customer-facing name
  },
  { _id: false }
);

// Page-wide promotions layered on top of whatever offer the customer chose.
const promotionsSchema = new mongoose.Schema(
  {
    // Delivery becomes free once an amount OR quantity threshold is met.
    freeShipping: {
      enabled: { type: Boolean, default: false },
      minSubtotal: { type: Number, default: 0, min: 0 }, // 0 = ignore this condition
      minQuantity: { type: Number, default: 0, min: 0 }, // 0 = ignore this condition
    },
    // Spend-and-save ladder; the single best-for-customer matching rule applies.
    discountRules: { type: [discountRuleSchema], default: [] },
  },
  { _id: false }
);

const formSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Order now — cash on delivery" },
    subtitle: { type: String, default: "" },
    submitText: { type: String, default: "Confirm order" },
    // Name, phone and address are always required — they're what the courier
    // needs. These toggle the optional extras.
    askEmail: { type: Boolean, default: true },
    askNote: { type: Boolean, default: false },
    noteLabel: { type: String, default: "Notes (optional)" },
    successTitle: { type: String, default: "Thank you! Your order is confirmed." },
    successMessage: {
      type: String,
      default: "We'll call you shortly to confirm delivery. Please keep your phone nearby.",
    },
    // Optional post-order redirect (e.g. a thank-you page with a Meta pixel).
    redirectUrl: { type: String, default: "" },
  },
  { _id: false }
);

const landingPageSchema = new mongoose.Schema(
  {
    // The URL is /lp/<code>. Short by design; auto-generated but editable.
    code: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Internal name, never shown to customers.
    name: { type: String, required: true, trim: true },

    // <title> / OG tags for the public page.
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    ogImage: { type: String, default: "" },

    theme: {
      accent: { type: String, default: "#B85C3A" }, // brand terracotta
      background: { type: String, default: "#FDFBF7" },
      text: { type: String, default: "#2C1810" },
      // Optional page-wide background image, layered under `background` (which
      // then acts as the fallback / overlay tint).
      backgroundImage: { type: String, default: "" },
      // A key from lib/landing-fonts.js — the typeface for the whole page. All
      // options carry Bengali + Latin so বাংলা and English render consistently.
      font: { type: String, default: "hind_siliguri" },
    },

    blocks: { type: [blockSchema], default: [] },
    offers: { type: [offerSchema], default: [] },
    shipping: { type: shippingSchema, default: () => ({}) },
    promotions: { type: promotionsSchema, default: () => ({}) },
    form: { type: formSchema, default: () => ({}) },

    isActive: { type: Boolean, default: false }, // start as a draft
    views: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }, // sum of confirmed order totals

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

const LandingPage = mongoose.models.LandingPage || mongoose.model("LandingPage", landingPageSchema);
export default LandingPage;
