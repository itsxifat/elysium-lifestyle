// Flash-sale helpers, shared by the homepage, the public API and the orders
// route. Pricing/stock are authoritative here — never trust client prices.
import { connectDB } from "@/lib/mongoose";
import FlashSale from "@/models/FlashSale";
import Product from "@/models/Product";

/** The single flash sale that is enabled and within its (optional) schedule. */
export async function getActiveFlashSale() {
  await connectDB();
  const now = new Date();
  return FlashSale.findOne({
    enabled: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .sort({ startsAt: -1, createdAt: -1 })
    .lean();
}

/** productId → { salePrice, remaining, stockLimit, soldCount } from a sale doc. */
export function getFlashPriceMap(sale) {
  const map = new Map();
  if (!sale) return map;
  for (const it of sale.items || []) {
    if (!it.product) continue;
    map.set(String(it.product), {
      salePrice: it.salePrice,
      stockLimit: it.stockLimit || 0,
      soldCount: it.soldCount || 0,
      remaining: Math.max(0, (it.stockLimit || 0) - (it.soldCount || 0)),
    });
  }
  return map;
}

/**
 * Active flash sale with each item's product fully loaded for display
 * (price, images, sizes…). Returns null when there's no live sale or no
 * published products left in it.
 */
export async function getActiveFlashSalePublic() {
  const sale = await getActiveFlashSale();
  if (!sale || !sale.items?.length) return null;

  const ids = sale.items.map((i) => i.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids }, isPublished: true })
    .select("name slug images variants isNewArrival")
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = sale.items
    .map((it) => {
      const product = byId.get(String(it.product));
      if (!product) return null;
      return {
        product,
        salePrice: it.salePrice,
        stockLimit: it.stockLimit || 0,
        soldCount: it.soldCount || 0,
        remaining: Math.max(0, (it.stockLimit || 0) - (it.soldCount || 0)),
      };
    })
    .filter(Boolean);

  if (!items.length) return null;

  return {
    _id: sale._id,
    title: sale.title,
    subtitle: sale.subtitle,
    startsAt: sale.startsAt,
    endsAt: sale.endsAt,
    items,
  };
}

/**
 * Increment soldCount for the units claimed in an order.
 * `soldByProduct` is a plain object { productId: qty }.
 */
export async function recordFlashSold(saleId, soldByProduct) {
  const entries = Object.entries(soldByProduct || {}).filter(([, q]) => q > 0);
  if (!saleId || !entries.length) return;
  await Promise.all(
    entries.map(([pid, qty]) =>
      FlashSale.updateOne(
        { _id: saleId, "items.product": pid },
        { $inc: { "items.$.soldCount": qty } }
      )
    )
  );
}
