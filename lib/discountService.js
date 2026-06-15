import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Discount from "@/models/Discount";
import Order from "@/models/Order";
import { getAncestors } from "@/lib/categories";
import { computeDiscounts } from "@/lib/discounts";

// Server-side bridge between the pure discount engine and the database. Prices
// and category scope always come from the DB — never the client.

// Turn raw cart lines [{ productId, size, quantity }] into priced items with
// category ancestry, so the engine can evaluate product/category scoped rules.
export async function priceCartItems(rawItems = []) {
  await connectDB();
  const ids = rawItems.map((i) => i.productId).filter(Boolean);
  const [products, allCats] = await Promise.all([
    Product.find({ _id: { $in: ids } }).select("name images variants category").lean(),
    Category.find({}).select("_id slug parent").lean(),
  ]);
  const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));

  const items = [];
  for (const raw of rawItems) {
    const p = byId[String(raw.productId)];
    if (!p) continue;
    const variant = p.variants?.find((v) => v.size === raw.size) || p.variants?.[0];
    if (!variant) continue;
    const catId = p.category ? String(p.category) : null;
    const categoryIds = catId
      ? getAncestors(allCats, catId).map((a) => String(a._id))
      : [];
    items.push({
      productId: String(p._id),
      name: p.name,
      image: p.images?.[0] || "",
      size: raw.size,
      price: variant.price,
      quantity: Math.max(1, parseInt(raw.quantity, 10) || 1),
      categoryId: catId,
      categoryIds: catId ? Array.from(new Set([catId, ...categoryIds])) : [],
    });
  }
  return items;
}

// Was this the customer's first order? (no prior orders for the user / phone)
async function isFirstOrder({ userId, phone }) {
  const or = [];
  if (userId) or.push({ user: userId });
  if (phone) or.push({ "shippingAddress.phone": phone });
  if (or.length === 0) return true;
  const count = await Order.countDocuments({ $or: or });
  return count === 0;
}

// How many times has this customer already used a given coupon code?
async function customerCodeUsage(code, { userId, phone }) {
  const or = [];
  if (userId) or.push({ user: userId });
  if (phone) or.push({ "shippingAddress.phone": phone });
  if (or.length === 0) return 0;
  return Order.countDocuments({ discountCodes: code, $or: or });
}

/**
 * Resolve all discounts for a cart. Loads active + code-matched discounts,
 * enforces customer-specific limits, runs the engine, and returns the breakdown.
 *
 * @returns {{applied, rejected, discountTotal, freeShipping, subtotal}}
 */
export async function applyDiscounts({ items, codes = [], shippingFee = 0, userId = null, phone = null }) {
  await connectDB();
  const upperCodes = (codes || []).map((c) => String(c).toUpperCase().trim()).filter(Boolean);

  // Candidate set: all active automatic discounts + any active discount whose
  // code was entered.
  const query = {
    active: true,
    $or: [{ method: "automatic" }, { code: { $in: upperCodes } }],
  };
  const discounts = await Discount.find(query).lean();

  const rejected = [];
  // Flag entered codes that match nothing.
  const knownCodes = new Set(discounts.filter((d) => d.code).map((d) => String(d.code).toUpperCase()));
  for (const c of upperCodes) {
    if (!knownCodes.has(c)) rejected.push({ code: c, reason: "Invalid code" });
  }

  const firstOrder = await isFirstOrder({ userId, phone });

  // Pre-filter per-customer usage for code discounts (needs DB).
  const usable = [];
  for (const d of discounts) {
    if (d.method === "code" && d.perCustomerLimit > 0 && upperCodes.includes(String(d.code).toUpperCase())) {
      const used = await customerCodeUsage(String(d.code).toUpperCase(), { userId, phone });
      if (used >= d.perCustomerLimit) {
        rejected.push({ code: d.code, reason: "You've already used this code" });
        continue;
      }
    }
    usable.push(d);
  }

  const result = computeDiscounts({
    discounts: usable,
    items,
    shippingFee,
    codes: upperCodes,
    isFirstOrder: firstOrder,
  });

  // Merge engine rejections (eligibility) with ours (invalid/used), de-duped.
  const seen = new Set(rejected.map((r) => `${r.code}:${r.reason}`));
  for (const r of result.rejected) {
    const k = `${r.code}:${r.reason}`;
    if (!seen.has(k)) { rejected.push(r); seen.add(k); }
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return { ...result, rejected, subtotal };
}

// Increment usedCount for the discounts applied to a placed order.
export async function recordDiscountUsage(appliedDiscounts = []) {
  const ids = appliedDiscounts.map((d) => d.discount || d.discountId).filter(Boolean);
  if (ids.length === 0) return;
  await connectDB();
  await Discount.updateMany({ _id: { $in: ids } }, { $inc: { usedCount: 1 } });
}
