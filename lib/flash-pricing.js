// Flash-sale arithmetic, shared by checkout, the storefront and the admin
// editor. Pure — no database, no React — so the price an admin previews, the
// price a shopper sees and the price checkout charges all come from here.
//
// Vocabulary (see models/FlashSale.js):
//   item      one product's entry in a sale
//   rule      one size's entry in item.sizes
//   variants  the product's live sizes: [{ size, price, stock }]
//   offer     what one sale offers on one size of one product — its price and
//             how many units it still has at that price

const finiteOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Infinity-safe ascending comparison (Infinity - Infinity is NaN, which sorts
// unpredictably).
const cmp = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const endTime = (d) => (d ? new Date(d).getTime() : Infinity);

// ── Schedule ─────────────────────────────────────────────────────────────────

/** draft (switched off) · scheduled · live · ended */
export function saleStatus(sale, now = Date.now()) {
  if (!sale?.enabled) return "draft";
  const t = now instanceof Date ? now.getTime() : now;
  if (sale.endsAt && new Date(sale.endsAt).getTime() < t) return "ended";
  if (sale.startsAt && new Date(sale.startsAt).getTime() > t) return "scheduled";
  return "live";
}

/** Do two sales' schedules overlap? An open end runs for ever. */
export function schedulesOverlap(a, b) {
  const aStart = a.startsAt ? new Date(a.startsAt).getTime() : -Infinity;
  const bStart = b.startsAt ? new Date(b.startsAt).getTime() : -Infinity;
  return aStart <= endTime(b.endsAt) && bStart <= endTime(a.endsAt);
}

// ── One item ─────────────────────────────────────────────────────────────────

/** Saved before per-size pricing: one price and one pool for every size. */
export function isLegacyItem(item) {
  return !Array.isArray(item?.sizes);
}

/**
 * The size rules an item applies, keyed by size. A legacy item puts every size
 * of the product on sale at its one price, with only the product-wide cap.
 */
export function sizeRulesOf(item, variants = []) {
  const rules = new Map();
  if (isLegacyItem(item)) {
    for (const v of variants) {
      rules.set(v.size, { size: v.size, enabled: true, salePrice: null, limit: 0, allStock: true, sold: 0 });
    }
    return rules;
  }
  for (const rule of item.sizes) if (rule?.size) rules.set(rule.size, rule);
  return rules;
}

/** The price a size sells at: its own when set, otherwise the product's. */
export function salePriceOf(item, rule) {
  const own = finiteOrNull(rule?.salePrice);
  return own !== null ? own : Number(item?.salePrice) || 0;
}

/** Units of a size still claimable at the flash price, before live stock. */
export function sizeAllocationLeft(rule) {
  if (rule?.allStock) return Infinity;
  return Math.max(0, (Number(rule?.limit) || 0) - (Number(rule?.sold) || 0));
}

/** Units the product-wide cap still allows — Infinity when there is no cap. */
export function itemCapLeft(item) {
  const cap = Number(item?.stockLimit) || 0;
  if (cap <= 0) return Infinity;
  return Math.max(0, cap - (Number(item?.soldCount) || 0));
}

export function discountPercent(regular, sale) {
  const r = Number(regular) || 0;
  const s = Number(sale) || 0;
  if (r <= 0 || s <= 0 || s >= r) return 0;
  return Math.round(((r - s) / r) * 100);
}

/**
 * One item priced, size by size, against the product's live variants.
 *
 * A size is `onSale` when its rule is switched on and its price genuinely
 * undercuts the shelf price. Checkout applies nothing else, so neither does
 * anything that displays a price.
 *
 * `remaining` is what can still be bought at the flash price: the size's
 * allocation, the product-wide cap and the stock on the shelf, whichever runs
 * out first.
 *
 * `best` (productFlash across every live sale) is for a sale page: a size that
 * another live sale sells for less is shown at that price and what is left at
 * it, as product pages show it and checkout charges it.
 */
export function describeItem(item, variants = [], best = null) {
  const rules = sizeRulesOf(item, variants);
  const capLeft = itemCapLeft(item);

  const sizes = variants.map((v) => {
    const regularPrice = Number(v.price) || 0;
    const stock = Math.max(0, Number(v.stock) || 0);
    const base = { size: v.size, regularPrice, stock, onSale: false };
    const rule = rules.get(v.size);
    if (!rule || rule.enabled === false) return base;

    const salePrice = salePriceOf(item, rule);
    if (!(salePrice > 0 && salePrice < regularPrice)) return base;

    const cheaper = best?.sizes?.[v.size];
    if (cheaper && cheaper.price < salePrice) {
      return {
        ...base,
        onSale: true,
        salePrice: cheaper.price,
        discount: cheaper.discount,
        remaining: cheaper.remaining,
        sold: Number(rule.sold) || 0,
        elsewhere: true,
      };
    }

    return {
      ...base,
      onSale: true,
      salePrice,
      discount: discountPercent(regularPrice, salePrice),
      remaining: Math.max(0, Math.min(sizeAllocationLeft(rule), capLeft, stock)),
      sold: Number(rule.sold) || 0,
    };
  });

  const onSale = sizes.filter((s) => s.onSale);
  // A size priced by another sale is not this item's to cap.
  const left = (list) => list.reduce((sum, s) => sum + s.remaining, 0);
  const remaining =
    Math.min(capLeft, left(onSale.filter((s) => !s.elsewhere))) + left(onSale.filter((s) => s.elsewhere));
  const sold = Number(item?.soldCount) || 0;
  const total = sold + remaining;

  // The headline price is the cheapest size still to be had at the flash
  // price — or, once everything is claimed, the cheapest there was.
  const pool = onSale.filter((s) => s.remaining > 0);
  const headline = (pool.length ? pool : onSale).reduce(
    (best, s) => (!best || s.salePrice < best.salePrice ? s : best),
    null
  );
  const prices = onSale.map((s) => s.salePrice);

  return {
    sizes,
    onSaleCount: onSale.length,
    price: headline?.salePrice ?? null,
    regularPrice: headline?.regularPrice ?? null,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    maxDiscount: onSale.reduce((m, s) => Math.max(m, s.discount), 0),
    remaining,
    sold,
    total,
    soldPct: total > 0 ? Math.round((sold / total) * 100) : 0,
    soldOut: onSale.length > 0 && remaining <= 0,
  };
}

// ── Offers & checkout planning ───────────────────────────────────────────────

/**
 * What one sale offers on one product, one entry per size on sale. A legacy
 * item offers every size, keyed "*".
 */
export function itemOffers(sale, item) {
  const base = {
    saleId: String(sale._id),
    slug: sale.slug || String(sale._id),
    title: sale.title || "Flash Sale",
    endsAt: sale.endsAt || null,
    productId: String(item.product?._id || item.product),
    itemLeft: itemCapLeft(item),
    itemLimit: Number(item.stockLimit) || 0,
  };

  if (isLegacyItem(item)) {
    return [{ ...base, size: "*", legacy: true, allStock: true, sizeLimit: 0, sizeLeft: Infinity, price: Number(item.salePrice) || 0 }];
  }

  return item.sizes
    .filter((rule) => rule?.size && rule.enabled !== false)
    .map((rule) => ({
      ...base,
      size: rule.size,
      legacy: false,
      allStock: !!rule.allStock,
      sizeLimit: Number(rule.limit) || 0,
      sizeLeft: sizeAllocationLeft(rule),
      price: salePriceOf(item, rule),
    }));
}

/**
 * The offers that can price a line, best first: only those that genuinely
 * undercut the shelf price, cheapest first, and between equal prices the sale
 * ending soonest — so its allocation is used before it expires.
 */
export function rankOffers(offers, regularPrice) {
  return (offers || [])
    .filter((o) => o.price > 0 && o.price < regularPrice)
    .sort((a, b) => cmp(a.price, b.price) || cmp(endTime(a.endsAt), endTime(b.endsAt)));
}

/**
 * Price a basket against flash offers exactly the way checkout claims them:
 * line by line, whole lines only, the best offer that still covers the line's
 * full quantity, each line using up allocation the next one sees.
 *
 * Checkout makes the same choices with atomic claims (lib/flashSale.js), so the
 * cart shows what the order will charge unless someone else takes the units in
 * between — and then the order route refuses and says so, rather than charging
 * more than the customer was shown.
 *
 * `lines`: [{ productId, size, quantity, regularPrice }]
 * `offersFor(productId, size)`: every live offer on that size
 *
 * Returns one entry per line: `offer` (null → shelf price), `left` (what the
 * chosen offer had for this line), and `best` — the best offer the line could
 * have had with a smaller quantity, so the cart can say "only 2 left at this
 * price".
 */
export function planFlashLines(lines, offersFor) {
  const used = new Map();
  const taken = (k) => used.get(k) || 0;

  return lines.map((line) => {
    const qty = Number(line.quantity) || 0;
    const candidates = rankOffers(offersFor(line.productId, line.size), Number(line.regularPrice) || 0);
    let best = null;

    for (const o of candidates) {
      const itemKey = `${o.saleId}|${o.productId}`;
      const sizeKey = `${itemKey}|${line.size}`;
      const left = Math.max(0, Math.min(o.sizeLeft - taken(sizeKey), o.itemLeft - taken(itemKey)));
      if (!best && left > 0) best = { offer: o, left };
      if (qty > 0 && left >= qty) {
        used.set(sizeKey, taken(sizeKey) + qty);
        used.set(itemKey, taken(itemKey) + qty);
        return { offer: o, left, best: { offer: o, left }, candidates };
      }
    }
    return { offer: null, left: 0, best, candidates };
  });
}

/**
 * A product's best flash price per size across every live sale — what product
 * pages and product cards show. `entries` are the `{ sale, item }` pairs that
 * carry this product. Returns null when nothing is on sale.
 */
export function productFlash(entries, variants = []) {
  const sizes = {};
  for (const { sale, item } of entries || []) {
    const described = describeItem(item, variants);
    for (const s of described.sizes) {
      if (!s.onSale || s.remaining <= 0) continue;
      const current = sizes[s.size];
      if (current && current.price <= s.salePrice) continue;
      sizes[s.size] = {
        price: s.salePrice,
        regularPrice: s.regularPrice,
        discount: s.discount,
        remaining: s.remaining,
        sale: { _id: String(sale._id), slug: sale.slug || String(sale._id), title: sale.title || "Flash Sale", endsAt: sale.endsAt || null },
      };
    }
  }

  const all = Object.values(sizes);
  if (!all.length) return null;
  const headline = all.reduce((best, s) => (!best || s.price < best.price ? s : best), null);
  return {
    price: headline.price,
    regularPrice: headline.regularPrice,
    discount: all.reduce((m, s) => Math.max(m, s.discount), 0),
    sale: headline.sale,
    sizes,
  };
}
