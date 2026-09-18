// Editor state for /admin/flash-sales/<id>: turning a stored sale into
// editable rows, the bulk pricing tools, and the live summary and warnings.
// All prices and "units left" are computed with lib/flash-pricing.js — the
// same code checkout charges with — so what the editor previews is what the
// shop will do.
import {
  describeItem, discountPercent, isLegacyItem, schedulesOverlap, saleStatus,
} from "@/lib/flash-pricing";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export const blankSale = () => ({
  title: "",
  subtitle: "",
  description: "",
  slug: "",
  bannerImage: "",
  enabled: false,
  showOnHomepage: true,
  priority: 0,
  startsAt: "",
  endsAt: "",
  items: [],
});

// The product details an item row displays. Accepts a populated product
// (GET /api/admin/flash-sales/<id>) or a picker result.
export function productInfo(p) {
  return {
    _id: String(p._id),
    name: p.name || "Product",
    slug: p.slug || "",
    image: p.images?.[0] || p.image || "",
    sku: p.skuBase || p.sku || "",
    isPublished: p.isPublished !== false,
    variants: (p.variants || []).map((v) => ({
      size: v.size,
      price: Number(v.price) || 0,
      stock: Math.max(0, Number(v.stock) || 0),
    })),
  };
}

// One editable row per size the product has NOW, carrying over whatever the
// sale already says about that size. A size the sale doesn't mention yet starts
// switched off.
function sizeRows(info, stored) {
  const bySize = new Map((stored || []).map((s) => [s.size, s]));
  return info.variants.map((v) => {
    const s = bySize.get(v.size);
    if (!s) return { size: v.size, enabled: false, salePrice: "", allStock: true, limit: "", sold: 0 };
    return {
      size: v.size,
      enabled: s.enabled !== false,
      salePrice: s.salePrice ?? "",
      allStock: !!s.allStock,
      limit: s.allStock ? "" : s.limit ?? "",
      sold: Number(s.sold) || 0,
    };
  });
}

/** A freshly picked product: every size in stock on sale, all of its stock. */
export function newItem(product) {
  const info = productInfo(product);
  return {
    product: info._id,
    info,
    salePrice: "",
    stockLimit: "",
    soldCount: 0,
    sizes: info.variants.map((v) => ({ size: v.size, enabled: v.stock > 0, salePrice: "", allStock: true, limit: "", sold: 0 })),
    open: true,
  };
}

/** A stored sale (products populated) → editor state. */
export function hydrateSale(sale) {
  const items = (sale.items || [])
    .filter((it) => it.product && typeof it.product === "object")
    .map((it) => {
      const info = productInfo(it.product);
      // A pre-size item puts every size on sale at its one price, sharing one
      // pool — which is exactly "all sizes, all stock, product-wide cap".
      const sizes = isLegacyItem(it)
        ? info.variants.map((v) => ({ size: v.size, enabled: true, salePrice: "", allStock: true, limit: "", sold: 0 }))
        : sizeRows(info, it.sizes);
      return {
        product: info._id,
        info,
        salePrice: it.salePrice || "",
        stockLimit: it.stockLimit || "",
        soldCount: Number(it.soldCount) || 0,
        sizes,
        legacy: isLegacyItem(it),
        open: false,
      };
    });

  return {
    title: sale.title || "",
    subtitle: sale.subtitle || "",
    description: sale.description || "",
    slug: sale.slug || "",
    bannerImage: sale.bannerImage || "",
    enabled: !!sale.enabled,
    showOnHomepage: sale.showOnHomepage !== false,
    priority: sale.priority || 0,
    startsAt: sale.startsAt || "",
    endsAt: sale.endsAt || "",
    items,
  };
}

/** Re-read live stock into the rows without touching anything the admin set. */
export function refreshInventory(item, product) {
  const info = productInfo(product);
  const bySize = new Map(item.sizes.map((s) => [s.size, s]));
  return {
    ...item,
    info,
    sizes: info.variants.map(
      (v) => bySize.get(v.size) || { size: v.size, enabled: false, salePrice: "", allStock: true, limit: "", sold: 0 }
    ),
  };
}

/** Editor item → the stored-item shape lib/flash-pricing.js works on. */
export function asStoredItem(item) {
  return {
    product: item.product,
    salePrice: Number(item.salePrice) || 0,
    stockLimit: Number(item.stockLimit) || 0,
    soldCount: item.soldCount || 0,
    sizes: item.sizes.map((s) => ({
      size: s.size,
      enabled: !!s.enabled,
      salePrice: num(s.salePrice),
      allStock: !!s.allStock,
      limit: Number(s.limit) || 0,
      sold: s.sold || 0,
    })),
  };
}

/** How one item prices out right now, size by size. */
export function previewItem(item) {
  return describeItem(asStoredItem(item), item.info.variants);
}

/** An editor item in the shape the storefront's deal cards render. */
export function toPublicItem(item) {
  const d = previewItem(item);
  return {
    product: { _id: item.product, name: item.info.name, slug: item.info.slug, images: item.info.image ? [item.info.image] : [], variants: item.info.variants },
    price: d.price,
    regularPrice: d.regularPrice,
    minPrice: d.minPrice,
    maxPrice: d.maxPrice,
    maxDiscount: d.maxDiscount,
    remaining: d.remaining,
    sold: d.sold,
    total: d.total,
    soldPct: d.soldPct,
    soldOut: d.soldOut,
    sizes: d.sizes
      .filter((s) => s.onSale)
      .map((s) => ({ size: s.size, price: s.salePrice, regularPrice: s.regularPrice, discount: s.discount, remaining: s.remaining })),
  };
}

/** Editor state → the body PUT/POST /api/admin/flash-sales expects. */
export function toPayload(form) {
  return {
    title: form.title,
    subtitle: form.subtitle,
    description: form.description,
    slug: form.slug,
    bannerImage: form.bannerImage,
    enabled: form.enabled,
    showOnHomepage: form.showOnHomepage,
    priority: Number(form.priority) || 0,
    startsAt: form.startsAt || null,
    endsAt: form.endsAt || null,
    items: form.items.map((it) => ({
      product: it.product,
      salePrice: Number(it.salePrice) || 0,
      stockLimit: Number(it.stockLimit) || 0,
      sizes: it.sizes.map((s) => ({
        size: s.size,
        enabled: !!s.enabled,
        salePrice: num(s.salePrice),
        allStock: !!s.allStock,
        limit: s.allStock ? 0 : Number(s.limit) || 0,
      })),
    })),
  };
}

// ── Bulk pricing ─────────────────────────────────────────────────────────────

const offPrice = (regular, pct) => Math.max(1, Math.round(regular * (1 - pct / 100)));

/**
 * `pct`% off every size, against each size's own regular price. Where all the
 * sizes cost the same the result is one product price; where they differ, the
 * product price follows the cheapest size and the others get their own.
 */
export function applyPercent(item, pct) {
  const p = Math.min(95, Math.max(1, Number(pct) || 0));
  const variants = item.info.variants;
  if (!variants.length) return item;
  const cheapest = variants.reduce((m, v) => (v.price < m.price ? v : m), variants[0]);
  const base = offPrice(cheapest.price, p);
  const bySize = new Map(variants.map((v) => [v.size, v]));
  return {
    ...item,
    salePrice: base,
    sizes: item.sizes.map((s) => {
      const v = bySize.get(s.size);
      const own = v ? offPrice(v.price, p) : base;
      return { ...s, salePrice: own === base ? "" : own };
    }),
  };
}

/** Put every size that is in stock on sale — or take them all off. */
export function setAllSizes(item, on) {
  const stock = new Map(item.info.variants.map((v) => [v.size, v.stock]));
  return { ...item, sizes: item.sizes.map((s) => ({ ...s, enabled: on ? (stock.get(s.size) || 0) > 0 : false })) };
}

/** Every size on sale sells all its stock. */
export function sellAllStock(item) {
  return { ...item, sizes: item.sizes.map((s) => (s.enabled ? { ...s, allStock: true, limit: "" } : s)) };
}

/** Every size on sale sells a fixed number (never less than it already sold). */
export function setUnits(item, units) {
  const n = Math.max(0, Math.floor(Number(units) || 0));
  return {
    ...item,
    sizes: item.sizes.map((s) => (s.enabled ? { ...s, allStock: false, limit: Math.max(n, s.sold || 0) } : s)),
  };
}

// ── Summary, warnings, overlaps ──────────────────────────────────────────────

/** Headline numbers for the sidebar, from live stock. */
export function saleSummary(form) {
  let sizesOnSale = 0;
  let units = 0;
  let regularValue = 0;
  let saleValue = 0;
  let maxDiscount = 0;
  let sold = 0;
  for (const it of form.items) {
    const d = previewItem(it);
    sizesOnSale += d.onSaleCount;
    units += d.remaining;
    sold += it.soldCount || 0;
    maxDiscount = Math.max(maxDiscount, d.maxDiscount);
    for (const s of d.sizes) {
      if (!s.onSale) continue;
      regularValue += s.remaining * s.regularPrice;
      saleValue += s.remaining * s.salePrice;
    }
  }
  return {
    products: form.items.length,
    sizesOnSale,
    units,
    regularValue,
    saleValue,
    avgDiscount: regularValue > 0 ? Math.round((1 - saleValue / regularValue) * 100) : 0,
    maxDiscount,
    sold,
  };
}

/**
 * Everything worth flagging on one item, each with a `severity`:
 *   "live"  the server refuses to switch a sale on with this (lib/flash-admin.js
 *           → buildSaleDoc) — a draft may still be saved
 *   "warn"  advice; nothing is refused
 */
export function itemIssues(item, overlaps = []) {
  const out = [];
  const productPrice = Number(item.salePrice) || 0;
  const variants = new Map(item.info.variants.map((v) => [v.size, v]));
  const enabled = item.sizes.filter((s) => s.enabled);

  if (!item.info.isPublished) out.push({ severity: "warn", text: "This product isn't published, so shoppers can't see or buy it." });
  if (!enabled.length) out.push({ severity: "warn", text: "No sizes are on sale yet — tick the sizes to include." });

  const noPrice = [];
  const noUnits = [];
  const noDiscount = [];
  const overStock = [];
  const empty = [];
  for (const s of enabled) {
    const v = variants.get(s.size);
    const price = s.salePrice !== "" && s.salePrice !== null ? Number(s.salePrice) : productPrice;
    if (!(price > 0)) noPrice.push(s.size);
    else if (v && price >= v.price) noDiscount.push(s.size);
    if (!s.allStock && !(Number(s.limit) > 0)) noUnits.push(s.size);
    if (v && v.stock === 0) empty.push(s.size);
    else if (v && !s.allStock && Number(s.limit) - (s.sold || 0) > v.stock) overStock.push(`${s.size} (${v.stock})`);
  }

  const list = (sizes) => sizes.join(", ");
  if (noPrice.length) out.push({ severity: "live", text: `Set a sale price for ${list(noPrice)}.` });
  if (noUnits.length) out.push({ severity: "live", text: `Set how many to sell for ${list(noUnits)}, or sell all stock.` });
  if (noDiscount.length) out.push({ severity: "warn", text: `The sale price for ${list(noDiscount)} isn't below the regular price, so it won't apply.` });
  if (empty.length) out.push({ severity: "warn", text: `${list(empty)} ${empty.length === 1 ? "is" : "are"} out of stock right now.` });
  if (overStock.length) out.push({ severity: "warn", text: `More units than in stock for ${list(overStock)} — the sale stops when stock runs out.` });
  for (const o of overlaps) {
    out.push({ severity: "warn", text: `Also on sale in “${o.title}” at the same time — shoppers get whichever price is lower.` });
  }
  return out;
}

/**
 * Sizes the server counts as sellable when switching a sale on: ticked, with a
 * price above zero and something to sell (lib/flash-admin.js → buildSaleDoc).
 */
export function sellableSizes(form) {
  let n = 0;
  for (const it of form.items) {
    const productPrice = Number(it.salePrice) || 0;
    for (const s of it.sizes) {
      if (!s.enabled) continue;
      const price = s.salePrice !== "" && s.salePrice !== null ? Number(s.salePrice) : productPrice;
      if (price > 0 && (s.allStock || Number(s.limit) > 0)) n++;
    }
  }
  return n;
}

/**
 * Other campaigns that run at the same time as this one and share a product
 * size with it: productId → [{ _id, title }]. `others` come from the list
 * endpoint (lib/flash-admin.js → summariseSale).
 */
export function findOverlaps(form, others = [], currentId = null) {
  const map = new Map();
  for (const o of others) {
    if (String(o._id) === String(currentId) || !o.enabled || saleStatus(o) === "ended") continue;
    if (!schedulesOverlap(form, o)) continue;
    const theirs = new Map(o.items.map((i) => [String(i.product), i.sizes]));
    for (const it of form.items) {
      const sizes = theirs.get(String(it.product));
      if (!sizes) continue;
      const mine = it.sizes.filter((s) => s.enabled).map((s) => s.size);
      if (!mine.length || !(sizes.includes("*") || sizes.some((s) => mine.includes(s)))) continue;
      if (!map.has(it.product)) map.set(it.product, []);
      map.get(it.product).push({ _id: o._id, title: o.title });
    }
  }
  return map;
}

export { discountPercent };
