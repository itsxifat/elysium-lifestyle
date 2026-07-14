import crypto from "crypto";
import LandingPage from "@/models/LandingPage";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import { applyOfferPricing, tierPriceFor, maxTierQuantity, minTierQuantity } from "@/lib/landing-pricing";

export { applyOfferPricing, tierPriceFor, maxTierQuantity, minTierQuantity };

// Server-side landing-page helpers: short-code generation, and the pricing rules
// that turn an offer + the customer's size choices into concrete order lines.
//
// Nothing here trusts a price sent by the browser. Every total is recomputed
// from the live Product.variants and the offer's stored pricing rule, so a
// tampered request can only ever produce the price the admin configured.

// Ambiguous characters (0/o, 1/l/i) are excluded so a code can be read aloud
// and typed from a printed flyer without mistakes.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 6;

// Paths under /lp/ that must never be taken by a landing page.
const RESERVED_CODES = new Set(["new", "edit", "api", "admin", "preview"]);

export function randomCode(length = CODE_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// An unused /lp/<code>. Retries on the (vanishingly rare) collision.
export async function generateUniqueCode() {
  for (let i = 0; i < 12; i++) {
    const code = randomCode();
    if (RESERVED_CODES.has(code)) continue;
    if (!(await LandingPage.exists({ code }))) return code;
  }
  // Fall back to a longer code rather than loop forever.
  return randomCode(CODE_LENGTH + 3);
}

// Admins may hand-write a code. Keep it URL-safe and short.
export function normalizeCode(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function isReservedCode(code) {
  return RESERVED_CODES.has(code);
}

export function makeKey() {
  return crypto.randomBytes(6).toString("hex");
}

// ── Pricing ─────────────────────────────────────────────────────────────────

// Resolve one offer against the live catalog.
//
// `sizeChoices` maps an offer line's index → the size the customer picked; a
// line with a pinned `size` ignores it. Returns { ok, error, items, regularTotal,
// offerTotal, discount } where `items` are ready-to-store order lines priced at
// their REGULAR variant price — the landing-page saving is carried separately as
// an order-level discount so the order record shows honest product prices.
export async function priceOffer(offer, sizeChoices = {}, { requireStock = true } = {}) {
  if (!offer || offer.isActive === false) return { ok: false, error: "This offer is no longer available." };
  if (!offer.items?.length) return { ok: false, error: "This offer has no products." };

  const ids = offer.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  let regularTotal = 0;

  for (let idx = 0; idx < offer.items.length; idx++) {
    const line = offer.items[idx];
    const product = byId.get(String(line.product));
    if (!product) return { ok: false, error: "A product in this offer is unavailable." };
    if (product.isPublished === false) return { ok: false, error: `${product.name} is no longer available.` };

    // A pinned size wins; otherwise honour the customer's pick. Single-variant
    // products need no choice at all.
    const chosen = line.size || sizeChoices[idx] || (product.variants?.length === 1 ? product.variants[0].size : "");
    if (!chosen) return { ok: false, error: `Please choose a size for ${product.name}.` };

    const variant = product.variants?.find((v) => v.size === chosen);
    if (!variant) return { ok: false, error: `Size ${chosen} is unavailable for ${product.name}.` };

    const quantity = Math.max(1, Number(line.quantity) || 1);
    if (requireStock && variant.stock < quantity) {
      return { ok: false, error: `${product.name} (${chosen}) is out of stock.` };
    }

    regularTotal += variant.price * quantity;
    items.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0] || "",
      sku: variant.sku || "",
      size: chosen,
      price: variant.price,
      quantity,
    });
  }

  const offerTotal = applyOfferPricing(offer, regularTotal);
  return { ok: true, items, regularTotal, offerTotal, discount: regularTotal - offerTotal };
}

// Resolve a COLLECTION offer against the live catalog.
//
// The customer mixes & matches from the offer's product pool: `selections` is
// [{ productId, size, quantity }]. The total quantity picks a rung of the manual
// price ladder (tierPriceFor) — that rung's price is what they pay, regardless of
// which items they chose. As with priceOffer, order lines are stored at their
// real variant price and the ladder saving is carried as an order-level discount.
export async function priceCollection(offer, selections = [], { requireStock = true } = {}) {
  if (!offer || offer.isActive === false) return { ok: false, error: "This offer is no longer available." };
  if (!offer.items?.length) return { ok: false, error: "This collection has no products." };
  if (!offer.tiers?.length) return { ok: false, error: "This collection has no pricing set." };

  // The pool: only products actually attached to the offer may be ordered, at a
  // size the offer allows (a pinned size, or any real variant).
  const poolIds = new Set(offer.items.map((i) => String(i.product)));
  const pinnedByProduct = new Map(offer.items.map((i) => [String(i.product), i.size || ""]));

  const products = await Product.find({ _id: { $in: [...poolIds] } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const clean = (Array.isArray(selections) ? selections : [])
    .map((s) => ({ productId: String(s.productId || ""), size: String(s.size || ""), quantity: Math.max(1, Number(s.quantity) || 1) }))
    .filter((s) => s.quantity > 0);
  if (!clean.length) return { ok: false, error: "Please choose at least one item." };

  // Cap the order at the largest quantity the ladder prices; require at least the
  // smallest. Both are enforced here, never trusted from the client.
  const totalQty = clean.reduce((n, s) => n + s.quantity, 0);
  const max = maxTierQuantity(offer.tiers);
  const min = minTierQuantity(offer.tiers);
  if (totalQty < min) return { ok: false, error: `Please choose at least ${min} item${min === 1 ? "" : "s"}.` };
  if (totalQty > max) return { ok: false, error: `You can order up to ${max} item${max === 1 ? "" : "s"} from this collection.` };

  // Fold duplicate (product,size) picks so stock is checked against the true total.
  const merged = new Map();
  for (const s of clean) {
    if (!poolIds.has(s.productId)) return { ok: false, error: "One of the chosen items isn't part of this offer." };
    const key = `${s.productId}::${s.size}`;
    merged.set(key, (merged.get(key) || 0) + s.quantity);
  }

  const items = [];
  let regularTotal = 0;
  for (const [key, quantity] of merged) {
    const [productId, rawSize] = key.split("::");
    const product = byId.get(productId);
    if (!product || product.isPublished === false) return { ok: false, error: "One of the chosen items is no longer available." };

    const pinned = pinnedByProduct.get(productId);
    const chosen = pinned || rawSize || (product.variants?.length === 1 ? product.variants[0].size : "");
    if (!chosen) return { ok: false, error: `Please choose a size for ${product.name}.` };

    const variant = product.variants?.find((v) => v.size === chosen);
    if (!variant) return { ok: false, error: `Size ${chosen} is unavailable for ${product.name}.` };
    if (requireStock && variant.stock < quantity) {
      return { ok: false, error: `${product.name} (${chosen}) is out of stock.` };
    }

    regularTotal += variant.price * quantity;
    items.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0] || "",
      sku: variant.sku || "",
      size: chosen,
      price: variant.price,
      quantity,
    });
  }

  const offerTotal = tierPriceFor(offer.tiers, totalQty);
  if (offerTotal == null) return { ok: false, error: "No price is set for that quantity." };

  return { ok: true, items, regularTotal, offerTotal, discount: regularTotal - offerTotal, totalQty };
}

// Resolve an À LA CARTE offer: a pool the customer freely picks from, each item
// at its own price. `selections` is [{ productId, size, quantity }]; the cart
// total is the sum of the picks, then pricingMode may apply a flat discount
// (auto = none). Optional offer.minQty / offer.maxQty bound the piece count.
export async function priceAlacarte(offer, selections = [], { requireStock = true } = {}) {
  if (!offer || offer.isActive === false) return { ok: false, error: "This offer is no longer available." };
  if (!offer.items?.length) return { ok: false, error: "This offer has no products." };

  const poolIds = new Set(offer.items.map((i) => String(i.product)));
  const pinnedByProduct = new Map(offer.items.map((i) => [String(i.product), i.size || ""]));
  const products = await Product.find({ _id: { $in: [...poolIds] } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const clean = (Array.isArray(selections) ? selections : [])
    .map((s) => ({ productId: String(s.productId || ""), size: String(s.size || ""), quantity: Math.max(1, Number(s.quantity) || 1) }))
    .filter((s) => s.quantity > 0);
  if (!clean.length) return { ok: false, error: "Please choose at least one item." };

  const totalQty = clean.reduce((n, s) => n + s.quantity, 0);
  const min = Math.max(1, Number(offer.minQty) || 1);
  const max = Number(offer.maxQty) || 0; // 0 = unlimited
  if (totalQty < min) return { ok: false, error: `Please choose at least ${min} item${min === 1 ? "" : "s"}.` };
  if (max && totalQty > max) return { ok: false, error: `You can order up to ${max} item${max === 1 ? "" : "s"}.` };

  const merged = new Map();
  for (const s of clean) {
    if (!poolIds.has(s.productId)) return { ok: false, error: "One of the chosen items isn't part of this offer." };
    const key = `${s.productId}::${s.size}`;
    merged.set(key, (merged.get(key) || 0) + s.quantity);
  }

  const items = [];
  let regularTotal = 0;
  for (const [key, quantity] of merged) {
    const [productId, rawSize] = key.split("::");
    const product = byId.get(productId);
    if (!product || product.isPublished === false) return { ok: false, error: "One of the chosen items is no longer available." };

    const pinned = pinnedByProduct.get(productId);
    const chosen = pinned || rawSize || (product.variants?.length === 1 ? product.variants[0].size : "");
    if (!chosen) return { ok: false, error: `Please choose a size for ${product.name}.` };

    const variant = product.variants?.find((v) => v.size === chosen);
    if (!variant) return { ok: false, error: `Size ${chosen} is unavailable for ${product.name}.` };
    if (requireStock && variant.stock < quantity) return { ok: false, error: `${product.name} (${chosen}) is out of stock.` };

    regularTotal += variant.price * quantity;
    items.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0] || "",
      sku: variant.sku || "",
      size: chosen,
      price: variant.price,
      quantity,
    });
  }

  const offerTotal = applyOfferPricing(offer, regularTotal);
  return { ok: true, items, regularTotal, offerTotal, discount: regularTotal - offerTotal, totalQty };
}

// What a customer is charged for delivery on this page. `zone` is only consulted
// when the page's shipping mode uses zones (its own or the store's).
export async function landingShippingFee(page, zone = "inside_dhaka") {
  const sh = page?.shipping || {};
  const z = ["inside_dhaka", "suburbs", "outside_dhaka"].includes(zone) ? zone : "inside_dhaka";

  switch (sh.mode) {
    case "free":
      return 0;
    case "flat":
      return Math.max(0, Number(sh.flat) || 0);
    case "zones":
      if (!sh.askZone) return Math.max(0, Number(sh.insideDhaka) || 0);
      if (z === "outside_dhaka") return Math.max(0, Number(sh.outsideDhaka) || 0);
      if (z === "suburbs") return Math.max(0, Number(sh.suburbs) || 0);
      return Math.max(0, Number(sh.insideDhaka) || 0);
    default: {
      // "settings" — inherit the store's zone rates. Free-shipping thresholds are
      // deliberately ignored: an LP price is already the negotiated price.
      const settings = await Settings.findOne({}, "shipping").lean();
      const s = settings?.shipping || {};
      if (s.freeShippingEnabled) return 0;
      if (!sh.askZone) return s.insideDhaka ?? 60;
      if (z === "outside_dhaka") return s.outsideDhaka ?? 130;
      if (z === "suburbs") return s.suburbs ?? 100;
      return s.insideDhaka ?? 60;
    }
  }
}

// The delivery charges the public page should display. Same numbers the server
// will charge (landingShippingFee is still the authority).
export async function publicShipping(page) {
  const askZone = page?.shipping?.askZone !== false && page?.shipping?.mode !== "free" && page?.shipping?.mode !== "flat";
  const zones = ["inside_dhaka", "suburbs", "outside_dhaka"];
  const rates = {};
  for (const z of zones) rates[z] = await landingShippingFee(page, z);
  return { askZone, rates };
}

// In-stock sizes for one product, honouring an optional pinned size.
function sizesFor(product, minQty, pinned) {
  const inStock = (product.variants || []).filter((v) => v.stock >= minQty);
  return (pinned ? inStock.filter((v) => v.size === pinned) : inStock).map((v) => ({ size: v.size, price: v.price }));
}

// Shape an offer for the public page: enough to render prices, size pickers and
// (for a collection) the mix-and-match pool + price ladder. Pricing rules stay
// server-side; the client only re-derives previews with the same shared helpers.
export async function publicOffers(page) {
  const active = (page.offers || []).filter((o) => o.isActive !== false && o.items?.length);
  if (!active.length) return [];

  const ids = active.flatMap((o) => o.items.map((i) => i.product));
  const products = await Product.find({ _id: { $in: ids } }, "name images variants isPublished slug").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const out = [];
  for (const offer of active) {
    let built = null;
    if (offer.kind === "collection") built = buildCollectionOffer(offer, byId);
    else if (offer.kind === "alacarte") built = buildAlacarteOffer(offer, byId);
    else built = buildFixedOffer(offer, byId);
    if (built) out.push(built);
  }

  return out;
}

// The pool the customer freely picks from, each at its own price.
function buildAlacarteOffer(offer, byId) {
  const pool = [];
  for (const line of offer.items) {
    const p = byId.get(String(line.product));
    if (!p || p.isPublished === false || !p.variants?.length) continue;
    const pinned = line.size || (p.variants.length === 1 ? p.variants[0].size : "");
    const sizes = sizesFor(p, 1, pinned);
    if (!sizes.length) continue;
    pool.push({ productId: String(p._id), name: p.name, image: p.images?.[0] || "", pinnedSize: pinned, sizes });
  }
  if (!pool.length) return null;

  // "from" price = the cheapest single item after any flat offer discount.
  const cheapest = Math.min(...pool.map((p) => Math.min(...p.sizes.map((s) => s.price))));
  return {
    key: offer.key,
    kind: "alacarte",
    label: offer.label,
    description: offer.description || "",
    badge: offer.badge || "",
    image: offer.image || pool[0]?.image || "",
    isDefault: !!offer.isDefault,
    pool,
    minQty: Math.max(1, Number(offer.minQty) || 1),
    maxQty: Number(offer.maxQty) || 0,
    // The flat discount rule, so the page can preview the cart total live.
    pricing: { mode: offer.pricingMode || "auto", value: Number(offer.priceValue) || 0 },
    manualCompareAt: Number(offer.compareAtPrice) > 0 ? Number(offer.compareAtPrice) : 0,
    price: applyOfferPricing(offer, cheapest),
  };
}

function buildFixedOffer(offer, byId) {
  const lines = [];
  let regularTotal = 0;

  for (const line of offer.items) {
    const p = byId.get(String(line.product));
    if (!p || p.isPublished === false || !p.variants?.length) return null;

    const quantity = Math.max(1, Number(line.quantity) || 1);
    const pinned = line.size || (p.variants.length === 1 ? p.variants[0].size : "");
    const sizes = sizesFor(p, quantity, pinned);
    if (!sizes.length) return null; // pinned size sold out, or nothing left

    // Pre-select the first in-stock size for the preview; the client re-derives
    // the total on a size change (same rule, lib/landing-pricing).
    regularTotal += sizes[0].price * quantity;
    lines.push({ productId: String(p._id), name: p.name, image: p.images?.[0] || "", quantity, pinnedSize: pinned, sizes });
  }

  const offerTotal = applyOfferPricing(offer, regularTotal);
  return {
    key: offer.key,
    kind: "fixed",
    label: offer.label,
    description: offer.description || "",
    badge: offer.badge || "",
    image: offer.image || lines[0]?.image || "",
    isDefault: !!offer.isDefault,
    items: lines,
    pricing: { mode: offer.pricingMode || "auto", value: Number(offer.priceValue) || 0 },
    manualCompareAt: Number(offer.compareAtPrice) > 0 ? Number(offer.compareAtPrice) : 0,
    price: offerTotal,
    compareAtPrice: Number(offer.compareAtPrice) > 0 ? Number(offer.compareAtPrice) : regularTotal,
    savings: Math.max(0, regularTotal - offerTotal),
  };
}

function buildCollectionOffer(offer, byId) {
  const tiers = (offer.tiers || [])
    .map((t) => ({ quantity: Number(t.quantity) || 0, price: Math.max(0, Number(t.price) || 0) }))
    .filter((t) => t.quantity >= 1)
    .sort((a, b) => a.quantity - b.quantity);
  if (!tiers.length) return null;

  // Each pool product that still has an orderable size (min qty of 1 per unit).
  const pool = [];
  for (const line of offer.items) {
    const p = byId.get(String(line.product));
    if (!p || p.isPublished === false || !p.variants?.length) continue;
    const pinned = line.size || (p.variants.length === 1 ? p.variants[0].size : "");
    const sizes = sizesFor(p, 1, pinned);
    if (!sizes.length) continue; // this product is sold out — drop it from the pool
    pool.push({ productId: String(p._id), name: p.name, image: p.images?.[0] || "", pinnedSize: pinned, sizes });
  }
  if (!pool.length) return null; // whole collection sold out → hide it

  const min = tiers[0].quantity;
  const max = tiers[tiers.length - 1].quantity;
  return {
    key: offer.key,
    kind: "collection",
    label: offer.label,
    description: offer.description || "",
    badge: offer.badge || "",
    image: offer.image || pool[0]?.image || "",
    isDefault: !!offer.isDefault,
    pool,
    tiers,
    minQty: min,
    maxQty: max,
    manualCompareAt: Number(offer.compareAtPrice) > 0 ? Number(offer.compareAtPrice) : 0,
    // Headline price = the cheapest rung, so cards can show "from ৳X".
    price: tiers[0].price,
  };
}
