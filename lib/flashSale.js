// Flash-sale data access, shared by the storefront, the public API, the cart,
// checkout and order cancellation. Pricing and stock are authoritative here —
// never trust client prices. The arithmetic itself lives in
// lib/flash-pricing.js so the admin editor can run exactly the same code.
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongoose";
import FlashSale from "@/models/FlashSale";
import Product from "@/models/Product";
import {
  saleStatus, describeItem, itemOffers, planFlashLines, productFlash,
} from "@/lib/flash-pricing";

const oid = (v) => new mongoose.Types.ObjectId(String(v?._id || v));
const endTime = (d) => (d ? new Date(d).getTime() : Infinity);

/** Mongo filter: switched on, started (or no start), not ended (or no end). */
export function liveFilter(now = new Date()) {
  return {
    enabled: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
}

// Highest priority first, then the one ending soonest (an open end last), then
// the newest.
function byListingOrder(a, b) {
  const p = (Number(b.priority) || 0) - (Number(a.priority) || 0);
  if (p) return p;
  const ea = endTime(a.endsAt);
  const eb = endTime(b.endsAt);
  if (ea !== eb) return ea < eb ? -1 : 1;
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

/** Every campaign live right now, in listing order. */
export async function getLiveFlashSales() {
  await connectDB();
  const sales = await FlashSale.find(liveFilter()).lean();
  return sales.sort(byListingOrder);
}

/**
 * Live sales indexed for pricing: which offers exist on a product's size, and
 * which sale items carry a product.
 */
export async function getFlashSaleIndex() {
  const sales = await getLiveFlashSales();
  const offers = new Map();
  const entries = new Map();

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const pid = String(item.product);
      if (!entries.has(pid)) entries.set(pid, []);
      entries.get(pid).push({ sale, item });
      for (const offer of itemOffers(sale, item)) {
        const key = `${pid}|${offer.size}`;
        if (!offers.has(key)) offers.set(key, []);
        offers.get(key).push(offer);
      }
    }
  }

  return {
    sales,
    // A legacy item's offer is filed under "*" and applies to every size.
    offersFor: (productId, size) => [
      ...(offers.get(`${productId}|${size}`) || []),
      ...(offers.get(`${productId}|*`) || []),
    ],
    entriesFor: (productId) => entries.get(String(productId)) || [],
  };
}

/**
 * Price basket lines against the live sales without claiming anything — the
 * cart and the discount preview use this so they show what checkout charges.
 * `lines`: [{ productId, size, quantity, regularPrice }]
 */
export async function previewFlashPrices(lines, index = null) {
  const idx = index || (await getFlashSaleIndex());
  return planFlashLines(lines, idx.offersFor);
}

/**
 * Attach `flash` (lib/flash-pricing.js → productFlash) to every product that is
 * on a live sale, so product cards and product pages show the sale price.
 * `products` are plain objects with `variants`; mutated and returned.
 */
export async function withFlashPricing(products, index = null) {
  const list = Array.isArray(products) ? products : [products];
  if (!list.length || !list[0]) return products;
  const idx = index || (await getFlashSaleIndex());
  if (!idx.sales.length) return products;
  for (const p of list) {
    if (!p?._id) continue;
    const flash = productFlash(idx.entriesFor(p._id), p.variants || []);
    if (flash) p.flash = flash;
  }
  return products;
}

// ── Storefront payloads ──────────────────────────────────────────────────────

async function productsFor(sales) {
  const ids = new Set();
  for (const s of sales) for (const it of s.items || []) if (it.product) ids.add(String(it.product));
  if (!ids.size) return new Map();
  const products = await Product.find({ _id: { $in: [...ids] }, isPublished: true })
    .select("name slug images variants isNewArrival")
    .lean();
  return new Map(products.map((p) => [String(p._id), p]));
}

// Every live sale's items, by product: what productFlash prices across.
function entriesByProduct(sales) {
  const entries = new Map();
  for (const sale of sales) {
    for (const item of sale.items || []) {
      const pid = String(item.product);
      if (!entries.has(pid)) entries.set(pid, []);
      entries.get(pid).push({ sale, item });
    }
  }
  return entries;
}

// A sale as the storefront renders it: products loaded, priced per size against
// live stock, anything with no size on sale dropped. A size another live sale
// (`entries`) sells for less shows that price — the one checkout charges and
// the product page shows — never this sale's dearer one.
function toPublicSale(sale, productsById, now, entries = new Map()) {
  const status = saleStatus(sale, now);
  const items = [];
  for (const it of sale.items || []) {
    const product = productsById.get(String(it.product));
    if (!product) continue;
    const variants = product.variants || [];
    const best = status === "live" ? productFlash(entries.get(String(product._id)) || [], variants) : null;
    const d = describeItem(it, variants, best);
    if (!d.onSaleCount) continue;
    items.push({
      product: {
        _id: String(product._id),
        name: product.name,
        slug: product.slug,
        images: (product.images || []).slice(0, 2),
        isNewArrival: !!product.isNewArrival,
        variants: (product.variants || []).map((v) => ({ size: v.size, price: v.price, stock: v.stock, sku: v.sku || "" })),
      },
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
    });
  }

  return {
    _id: String(sale._id),
    slug: sale.slug || String(sale._id),
    title: sale.title || "Flash Sale",
    subtitle: sale.subtitle || "",
    description: sale.description || "",
    bannerImage: sale.bannerImage || "",
    startsAt: sale.startsAt || null,
    endsAt: sale.endsAt || null,
    status,
    items,
    stats: {
      count: items.length,
      maxDiscount: items.reduce((m, i) => Math.max(m, i.maxDiscount), 0),
      remaining: items.reduce((n, i) => n + i.remaining, 0),
      sold: items.reduce((n, i) => n + i.sold, 0),
    },
  };
}

// `live`: every live sale, so a live sale's sizes are priced as checkout prices them.
async function publish(sales, live = []) {
  const now = new Date();
  const productsById = await productsFor(sales);
  const entries = entriesByProduct(live);
  return sales.map((s) => toPublicSale(s, productsById, now, entries)).filter((s) => s.items.length > 0);
}

/**
 * Live campaigns for the storefront, in listing order, each with at least one
 * product on sale. `homepage` keeps only those flagged for the homepage.
 * `live` reuses sales already loaded (an index's `sales`) instead of querying.
 */
export async function getPublicFlashSales({ homepage = false, live = null } = {}) {
  const sales = live || (await getLiveFlashSales());
  return publish(homepage ? sales.filter((s) => s.showOnHomepage !== false) : sales, sales);
}

/** Switched-on campaigns that have not started yet, soonest first. */
export async function getUpcomingFlashSales({ limit = 6 } = {}) {
  await connectDB();
  const sales = await FlashSale.find({ enabled: true, startsAt: { $gt: new Date() } })
    .sort({ startsAt: 1 })
    .limit(limit)
    .lean();
  return publish(sales);
}

/**
 * One campaign by slug (or, for sales saved before slugs, by id) — live,
 * upcoming or ended. Drafts only when `includeDrafts` (a staff preview).
 * Returns null when there is no such campaign.
 */
export async function getPublicFlashSale(slugOrId, { includeDrafts = false } = {}) {
  await connectDB();
  const key = String(slugOrId || "").toLowerCase();
  if (!key) return null;
  const or = [{ slug: key }];
  if (mongoose.isValidObjectId(key)) or.push({ _id: key });
  const sale = await FlashSale.findOne({ $or: or }).lean();
  if (!sale || (!sale.enabled && !includeDrafts)) return null;
  const live = saleStatus(sale) === "live" ? await getLiveFlashSales() : [];
  const [published] = await publish([sale], live);
  // A campaign whose products were all withdrawn still has a page — it just
  // has nothing on it, and says so.
  return published || toPublicSale(sale, new Map(), new Date());
}

// ── Claims ───────────────────────────────────────────────────────────────────

/**
 * Claim `qty` units of one offer (lib/flash-pricing.js → itemOffers), atomically.
 *
 * The filter re-checks, inside the same single-document write, that the sale is
 * still live and that the allocation — the size's own and the product-wide cap
 * — still covers the WHOLE quantity. Concurrent buyers therefore cannot claim
 * the same units, and one unit left never sells fifty at the sale price.
 * Returns true when the units were claimed.
 */
export async function claimFlashOffer(offer, productId, size, qty) {
  if (!offer || !(qty > 0)) return false;
  await connectDB();
  const pid = oid(productId);

  const item = { product: pid };
  if (offer.itemLimit > 0) item.soldCount = { $lte: offer.itemLimit - qty };
  const inc = { "items.$[it].soldCount": qty };
  const arrayFilters = [{ "it.product": pid }];

  if (offer.legacy) {
    // Claim against the old shape only while the item still has it — if the
    // sale was converted in the meantime, this offer no longer describes it.
    item.sizes = { $exists: false };
  } else {
    const rule = { size, enabled: { $ne: false } };
    if (!offer.allStock) rule.sold = { $lte: offer.sizeLimit - qty };
    item.sizes = { $elemMatch: rule };
    inc["items.$[it].sizes.$[sz].sold"] = qty;
    arrayFilters.push({ "sz.size": size });
  }

  const res = await FlashSale.updateOne(
    { _id: oid(offer.saleId), ...liveFilter(), items: { $elemMatch: item } },
    { $inc: inc },
    { arrayFilters }
  );
  return res.modifiedCount === 1;
}

// Move `qty` units of one line's claim in either direction. The item counter
// and the size counter are separate writes, each clamped at zero on the way
// down, so no sequence of edits and cancellations can drive either negative.
async function moveFlashUnits(line, delta) {
  const qty = Math.abs(delta);
  if (!line?.flashSale || !line.product || !(qty > 0)) return;
  const saleId = oid(line.flashSale);
  const pid = oid(line.product);
  const floor = delta < 0 ? { $gte: qty } : undefined;

  await FlashSale.updateOne(
    { _id: saleId },
    { $inc: { "items.$[it].soldCount": delta } },
    { arrayFilters: [floor ? { "it.product": pid, "it.soldCount": floor } : { "it.product": pid }] }
  );

  // Legacy items have no size counters; the elemMatch skips them (and any size
  // since dropped from the sale) rather than erroring on a missing array.
  const rule = floor ? { size: line.size, sold: floor } : { size: line.size };
  await FlashSale.updateOne(
    { _id: saleId, items: { $elemMatch: { product: pid, sizes: { $elemMatch: rule } } } },
    { $inc: { "items.$[it].sizes.$[sz].sold": delta } },
    { arrayFilters: [{ "it.product": pid }, { "sz.size": line.size }] }
  );
}

/**
 * Hand flash units back to the sales they were claimed from — the order was
 * cancelled, or never got written. `lines` carry `{ flashSale, product, size,
 * quantity }`; lines with no `flashSale` are ignored.
 */
export async function releaseFlashUnits(lines) {
  const claimed = (lines || []).filter((l) => l?.flashSale && l.quantity > 0);
  if (!claimed.length) return;
  await connectDB();
  for (const l of claimed) await moveFlashUnits(l, -Number(l.quantity));
}

/**
 * Take flash units again for an order coming back to life (a cancellation
 * reversed). Deliberately unconditional: the sale was already made at the
 * flash price, so it counts against the allocation even if that means the
 * allocation now reads as over-sold.
 */
export async function reclaimFlashUnits(lines) {
  const claimed = (lines || []).filter((l) => l?.flashSale && l.quantity > 0);
  if (!claimed.length) return;
  await connectDB();
  for (const l of claimed) await moveFlashUnits(l, Number(l.quantity));
}
