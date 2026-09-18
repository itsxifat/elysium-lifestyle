// Server-side half of the flash-sale admin: turning an editor payload into a
// stored sale, and summarising sales for the list. Kept out of the route files
// so the create, update, toggle and duplicate routes all normalise the same way.
import mongoose from "mongoose";
import FlashSale from "@/models/FlashSale";
import Product from "@/models/Product";
import { slugify } from "@/lib/utils";
import { isLegacyItem, describeItem, saleStatus } from "@/lib/flash-pricing";

const int = (v) => Math.max(0, Math.floor(Number(v) || 0));
const money = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
const ownPrice = (v) => (v === null || v === undefined || v === "" ? null : money(v));

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A slug no other sale uses: "eid-deals", then "eid-deals-2", … */
export async function uniqueSaleSlug(wanted, excludeId = null) {
  const base = slugify(String(wanted || "")).slice(0, 60) || "flash-sale";
  for (let n = 1; n < 500; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const clash = await FlashSale.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!clash) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * An editor payload → the stored sale document, plus anything that stops it
 * going live. Counters are never taken from the payload: `soldCount` and each
 * size's `sold` are carried from `existing`, so no edit can reset what sold.
 *
 * Sizes are checked against the product's real variants — a size the product
 * no longer has is dropped. A pre-size (legacy) item arriving in the payload is
 * converted: every size on sale at the product price, with its old shared
 * allocation kept as the product-wide cap.
 */
export async function buildSaleDoc(data, existing = null) {
  const errors = [];
  const title = String(data?.title ?? "").trim().slice(0, 120);
  if (!title) errors.push("Give the sale a title.");

  const startsAt = parseDate(data?.startsAt);
  const endsAt = parseDate(data?.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) errors.push("The sale has to end after it starts.");

  // One entry per product, first one wins.
  const seen = new Set();
  const wanted = [];
  for (const it of Array.isArray(data?.items) ? data.items : []) {
    const pid = String(it?.product?._id || it?.product || "");
    if (!mongoose.isValidObjectId(pid) || seen.has(pid)) continue;
    seen.add(pid);
    wanted.push({ pid, it });
  }

  const products = wanted.length
    ? await Product.find({ _id: { $in: wanted.map((w) => w.pid) } }).select("name variants").lean()
    : [];
  const productsById = new Map(products.map((p) => [String(p._id), p]));
  const previous = new Map((existing?.items || []).map((it) => [String(it.product), it]));

  const items = [];
  for (const { pid, it } of wanted) {
    const product = productsById.get(pid);
    if (!product) continue; // deleted since it was added
    const prev = previous.get(pid);
    const prevSold = new Map((prev?.sizes || []).map((s) => [s.size, int(s.sold)]));
    const variantSizes = new Set((product.variants || []).map((v) => v.size));

    const incoming = isLegacyItem(it)
      ? (product.variants || []).map((v) => ({ size: v.size, enabled: true, salePrice: null, allStock: true, limit: 0 }))
      : it.sizes;

    const sizes = [];
    const seenSizes = new Set();
    for (const s of incoming) {
      const size = String(s?.size ?? "");
      if (!variantSizes.has(size) || seenSizes.has(size)) continue;
      seenSizes.add(size);
      sizes.push({
        size,
        enabled: s.enabled !== false,
        salePrice: ownPrice(s.salePrice),
        limit: int(s.limit),
        allStock: !!s.allStock,
        sold: prevSold.get(size) || 0,
      });
    }
    // A size that sold units keeps its record even if it has left the
    // payload, so the item's history still adds up.
    for (const [size, sold] of prevSold) {
      if (sold > 0 && !seenSizes.has(size)) {
        const was = prev.sizes.find((s) => s.size === size);
        sizes.push({ ...was, enabled: false, sold });
      }
    }

    items.push({
      product: pid,
      salePrice: money(it.salePrice),
      sizes,
      stockLimit: int(it.stockLimit),
      soldCount: int(prev?.soldCount),
    });
  }

  const enabled = !!data?.enabled;
  // Only a sale that is switched on has to be complete — a draft may be saved
  // half-configured and finished later.
  if (enabled) {
    let sellable = 0;
    for (const item of items) {
      const name = productsById.get(String(item.product))?.name || "a product";
      for (const s of item.sizes) {
        if (!s.enabled) continue;
        const price = s.salePrice ?? item.salePrice;
        if (!(price > 0)) errors.push(`Set a sale price for ${name} (${s.size}).`);
        else if (!s.allStock && !(s.limit > 0)) errors.push(`Set how many of ${name} (${s.size}) to sell, or sell all stock.`);
        else sellable++;
      }
    }
    if (!sellable) errors.push("Put at least one product size on sale before switching the sale on.");
  }

  const doc = {
    title,
    subtitle: String(data?.subtitle ?? "").trim().slice(0, 160),
    description: String(data?.description ?? "").trim().slice(0, 1000),
    bannerImage: String(data?.bannerImage ?? "").trim().slice(0, 500),
    slug: await uniqueSaleSlug(data?.slug || title, existing?._id),
    enabled,
    showOnHomepage: data?.showOnHomepage !== false,
    priority: Math.max(-100, Math.min(100, Math.round(Number(data?.priority) || 0))),
    startsAt,
    endsAt,
    items,
  };

  // De-duplicate identical messages (the same missing price on many sizes).
  return { doc, errors: [...new Set(errors)] };
}

/**
 * A sale as the admin list shows it: status, headline numbers and a few
 * product thumbnails. `sale.items[].product` must be populated with variants.
 * `items` is also returned in a compact form — product id and the sizes on
 * sale — so the editor can warn about campaigns that overlap.
 */
export function summariseSale(sale, now = Date.now()) {
  let sizesOnSale = 0;
  let remaining = 0;
  let sold = 0;
  let maxDiscount = 0;
  const thumbs = [];
  const compact = [];

  for (const it of sale.items || []) {
    const p = it.product && typeof it.product === "object" ? it.product : null;
    const pid = String(p?._id || it.product);
    const d = describeItem(it, p?.variants || []);
    sizesOnSale += d.onSaleCount;
    remaining += d.remaining;
    sold += Number(it.soldCount) || 0;
    maxDiscount = Math.max(maxDiscount, d.maxDiscount);
    if (p?.images?.[0] && thumbs.length < 4) thumbs.push(p.images[0]);
    compact.push({
      product: pid,
      sizes: isLegacyItem(it) ? ["*"] : it.sizes.filter((s) => s.enabled !== false).map((s) => s.size),
    });
  }

  return {
    _id: String(sale._id),
    title: sale.title,
    subtitle: sale.subtitle || "",
    slug: sale.slug || String(sale._id),
    bannerImage: sale.bannerImage || "",
    enabled: !!sale.enabled,
    showOnHomepage: sale.showOnHomepage !== false,
    priority: sale.priority || 0,
    startsAt: sale.startsAt || null,
    endsAt: sale.endsAt || null,
    status: saleStatus(sale, now),
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    stats: { products: (sale.items || []).length, sizesOnSale, remaining, sold, total: sold + remaining, maxDiscount },
    thumbs,
    items: compact,
  };
}
