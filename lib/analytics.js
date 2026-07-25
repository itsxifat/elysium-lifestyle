// Sales analytics for the admin panel.
//
// Everything here reads the `orders` collection and reports in Bangladesh time
// (Asia/Dhaka), so a "day" is the store's day, not UTC's.
//
// ── What the money numbers mean ───────────────────────────────────────────────
// This is a COD-first store, so "revenue" has to be split by how sure it is:
//
//   grossSales      value of goods ordered, before discounts/shipping (subtotal)
//   netSales        what customers were actually invoiced (totalAmount)
//   collected       netSales of orders already DELIVERED — money genuinely earned
//   inFlight        netSales of pending/processing/shipped orders — not yet earned
//   cancelledValue  netSales of cancelled orders — lost
//   returnedAmount  value of items sent back (order totals are already net of it)
//
// Cancelled orders are excluded from grossSales / netSales / units / AOV: a
// cancelled COD parcel was never a sale. `orders` counts everything placed.
//
// NOTE: the store records no cost price per product, so true profit/margin
// cannot be computed. Everything below is revenue, not profit.
import Order from "@/models/Order";
import User from "@/models/User";
import "@/models/Product";
import "@/models/Category";
import { bucketKeys, pickGranularity } from "@/lib/order-date-range";

const TZ = "Asia/Dhaka";
const NOT_CANCELLED = { orderStatus: { $ne: "cancelled" } };

export const SOURCE_LABELS = {
  website: "Website",
  landing_page: "Landing page",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  phone: "Phone",
  offline: "Walk-in",
  other: "Manual",
};

export const ZONE_LABELS = {
  inside_dhaka: "Inside Dhaka",
  suburbs: "Dhaka Suburbs",
  outside_dhaka: "Outside Dhaka",
};

export const PAYMENT_LABELS = {
  cod: "Cash on delivery",
  sslcommerz: "Card / SSLCommerz",
  bkash: "bKash",
  nagad: "Nagad",
  bank: "Bank transfer",
  cash: "Cash",
};

// createdAt filter for a { start, end } window (either bound may be null).
function dateMatch(start, end) {
  const m = {};
  if (start) m.$gte = start;
  if (end) m.$lt = end;
  return Object.keys(m).length ? { createdAt: m } : {};
}

// Same window, as an aggregation *expression* (for $cond inside a $group).
function inWindowExpr(start, end, field = "$createdAt") {
  const parts = [];
  if (start) parts.push({ $gte: [field, start] });
  if (end) parts.push({ $lt: [field, end] });
  if (!parts.length) return true;
  return parts.length === 1 ? parts[0] : { $and: parts };
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Units on an order line, net of anything the customer sent back.
const NET_QTY = { $max: [0, { $subtract: ["$items.quantity", { $ifNull: ["$items.returnedQuantity", 0] }] }] };

// ── Headline KPIs ─────────────────────────────────────────────────────────────
// One pass over the window. Also used for the comparison period and by the
// dashboard's "today / this month" strip, which is why it's split out.
export async function getTotals(start, end) {
  const [row] = await Order.aggregate([
    { $match: dateMatch(start, end) },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        cancelledOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
        deliveredOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] } },
        grossSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$subtotal", 0] } },
        netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        shipping: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$shippingFee", 0] } },
        discounts: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$discount", 0] } },
        collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
        inFlight: {
          $sum: {
            $cond: [{ $in: ["$orderStatus", ["pending", "processing", "shipped"]] }, "$totalAmount", 0],
          },
        },
        cancelledValue: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        returnedAmount: { $sum: { $ifNull: ["$returnedAmount", 0] } },
        paidOrders: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
      },
    },
  ]);

  const [unitRow] = await Order.aggregate([
    { $match: { ...dateMatch(start, end), ...NOT_CANCELLED } },
    { $unwind: "$items" },
    { $group: { _id: null, units: { $sum: NET_QTY } } },
  ]);

  const t = row || {};
  const sellable = (t.orders || 0) - (t.cancelledOrders || 0);
  const settled = (t.deliveredOrders || 0) + (t.cancelledOrders || 0);

  return {
    orders: t.orders || 0,
    sellableOrders: sellable,
    cancelledOrders: t.cancelledOrders || 0,
    deliveredOrders: t.deliveredOrders || 0,
    paidOrders: t.paidOrders || 0,
    grossSales: round(t.grossSales),
    netSales: round(t.netSales),
    shipping: round(t.shipping),
    discounts: round(t.discounts),
    collected: round(t.collected),
    inFlight: round(t.inFlight),
    cancelledValue: round(t.cancelledValue),
    returnedAmount: round(t.returnedAmount),
    units: unitRow?.units || 0,
    aov: sellable ? round((t.netSales || 0) / sellable) : 0,
    unitsPerOrder: sellable ? round((unitRow?.units || 0) / sellable) : 0,
    // Of the orders that have reached an outcome, how many arrived.
    deliveryRate: settled ? round(((t.deliveredOrders || 0) / settled) * 100) : 0,
    cancelRate: t.orders ? round(((t.cancelledOrders || 0) / t.orders) * 100) : 0,
  };
}

// ── Revenue over time ─────────────────────────────────────────────────────────
async function getSeries(start, end, granularity) {
  const fmt = granularity === "month" ? "%Y-%m" : "%Y-%m-%d";
  const rows = await Order.aggregate([
    { $match: dateMatch(start, end) },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: "$createdAt", timezone: TZ } },
        orders: { $sum: 1 },
        netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byKey = Object.fromEntries(rows.map((r) => [r._id, r]));

  // Fill the gaps so quiet days read as zero rather than vanishing. Without a
  // start (all time) we can only show the buckets that exist.
  const keys = start
    ? bucketKeys(start, end || new Date(Date.now() + 1), granularity)
    : rows.map((r) => r._id);

  return keys.map((key) => ({
    key,
    orders: byKey[key]?.orders || 0,
    netSales: round(byKey[key]?.netSales),
    collected: round(byKey[key]?.collected),
    cancelled: byKey[key]?.cancelled || 0,
  }));
}

// ── Breakdowns: one row per channel / payment method / zone / status ──────────
// `fallback` names the bucket for documents predating the field — orders saved
// before `source` existed were storefront checkouts, not an unknown channel.
async function groupBy(field, start, end, { fallback = "unknown" } = {}) {
  const rows = await Order.aggregate([
    { $match: dateMatch(start, end) },
    {
      $group: {
        _id: { $ifNull: [`$${field}`, fallback] },
        orders: { $sum: 1 },
        netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
      },
    },
    { $sort: { netSales: -1 } },
  ]);
  return rows.map((r) => ({
    key: r._id,
    orders: r.orders,
    netSales: round(r.netSales),
    collected: round(r.collected),
    cancelled: r.cancelled,
  }));
}

// ── Products ──────────────────────────────────────────────────────────────────
async function getTopProducts(start, end, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...dateMatch(start, end), ...NOT_CANCELLED } },
    { $unwind: "$items" },
    {
      $group: {
        _id: { $ifNull: ["$items.product", "$items.name"] },
        name: { $first: "$items.name" },
        image: { $first: "$items.image" },
        sku: { $first: "$items.sku" },
        units: { $sum: NET_QTY },
        revenue: { $sum: { $multiply: ["$items.price", NET_QTY] } },
        orders: { $addToSet: "$_id" },
      },
    },
    { $project: { name: 1, image: 1, sku: 1, units: 1, revenue: 1, orders: { $size: "$orders" } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    id: String(r._id),
    name: r.name,
    image: r.image || "",
    sku: r.sku || "",
    units: r.units,
    orders: r.orders,
    revenue: round(r.revenue),
  }));
}

// Category needs a hop through products — order lines only snapshot the name.
// Collapse to one row per product FIRST so the $lookup runs over the handful of
// distinct products sold, not over every order line.
async function getTopCategories(start, end, limit = 8) {
  const rows = await Order.aggregate([
    { $match: { ...dateMatch(start, end), ...NOT_CANCELLED } },
    { $unwind: "$items" },
    { $match: { "items.product": { $ne: null } } },
    {
      $group: {
        _id: "$items.product",
        units: { $sum: NET_QTY },
        revenue: { $sum: { $multiply: ["$items.price", NET_QTY] } },
      },
    },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "p" } },
    { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$p.category",
        units: { $sum: "$units" },
        revenue: { $sum: "$revenue" },
        products: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "c" } },
    { $unwind: { path: "$c", preserveNullAndEmptyArrays: true } },
  ]);
  return rows.map((r) => ({
    key: String(r._id || "uncategorised"),
    name: r.c?.name || "Uncategorised",
    units: r.units,
    products: r.products,
    revenue: round(r.revenue),
  }));
}

// ── Customers ─────────────────────────────────────────────────────────────────
// New vs returning is decided by each buyer's FIRST EVER order, so it needs a
// pass over the whole collection. Buyers are keyed by account when the order is
// attached to one, and by phone otherwise (legacy/unlinked orders).
async function getCustomerSplit(start, end) {
  const [row] = await Order.aggregate([
    { $match: NOT_CANCELLED },
    { $addFields: { ck: { $ifNull: ["$user", "$shippingAddress.phone"] } } },
    { $match: { ck: { $ne: null } } },
    {
      $group: {
        _id: "$ck",
        firstAt: { $min: "$createdAt" },
        ordersInRange: { $sum: { $cond: [inWindowExpr(start, end), 1, 0] } },
        spentInRange: { $sum: { $cond: [inWindowExpr(start, end), "$totalAmount", 0] } },
      },
    },
    { $match: { ordersInRange: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        buyers: { $sum: 1 },
        newBuyers: { $sum: { $cond: [inWindowExpr(start, end, "$firstAt"), 1, 0] } },
        newRevenue: { $sum: { $cond: [inWindowExpr(start, end, "$firstAt"), "$spentInRange", 0] } },
        revenue: { $sum: "$spentInRange" },
        repeatBuyers: { $sum: { $cond: [{ $gt: ["$ordersInRange", 1] }, 1, 0] } },
      },
    },
  ]);

  const r = row || {};
  const buyers = r.buyers || 0;
  const newBuyers = r.newBuyers || 0;
  return {
    buyers,
    newBuyers,
    returningBuyers: buyers - newBuyers,
    repeatBuyers: r.repeatBuyers || 0, // ordered more than once *within* the range
    newRevenue: round(r.newRevenue),
    returningRevenue: round((r.revenue || 0) - (r.newRevenue || 0)),
    revenuePerBuyer: buyers ? round((r.revenue || 0) / buyers) : 0,
    returningShare: buyers ? round(((buyers - newBuyers) / buyers) * 100) : 0,
  };
}

async function getTopCustomers(start, end, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...dateMatch(start, end), ...NOT_CANCELLED } },
    { $addFields: { ck: { $ifNull: ["$user", "$shippingAddress.phone"] } } },
    { $match: { ck: { $ne: null } } },
    {
      $group: {
        _id: "$ck",
        userId: { $first: "$user" },
        name: { $last: "$shippingAddress.name" },
        phone: { $last: "$shippingAddress.phone" },
        city: { $last: "$shippingAddress.city" },
        orders: { $sum: 1 },
        spent: { $sum: "$totalAmount" },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
    { $sort: { spent: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    key: String(r._id),
    userId: r.userId ? String(r.userId) : null,
    name: r.name || "Guest",
    phone: r.phone || "",
    city: r.city || "",
    orders: r.orders,
    spent: round(r.spent),
    lastOrderAt: r.lastOrderAt,
  }));
}

// ── When do people buy? ───────────────────────────────────────────────────────
// Useful for scheduling ad spend and staffing the phone line.
async function getWhenTheyBuy(start, end) {
  const [dow, hour] = await Promise.all([
    Order.aggregate([
      { $match: { ...dateMatch(start, end), ...NOT_CANCELLED } },
      {
        $group: {
          _id: { $dayOfWeek: { date: "$createdAt", timezone: TZ } }, // 1 = Sunday
          orders: { $sum: 1 },
          netSales: { $sum: "$totalAmount" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...dateMatch(start, end), ...NOT_CANCELLED } },
      {
        $group: {
          _id: { $hour: { date: "$createdAt", timezone: TZ } },
          orders: { $sum: 1 },
          netSales: { $sum: "$totalAmount" },
        },
      },
    ]),
  ]);

  const dowMap = Object.fromEntries(dow.map((r) => [r._id, r]));
  const hourMap = Object.fromEntries(hour.map((r) => [r._id, r]));
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    byWeekday: DAYS.map((label, i) => ({
      key: label,
      orders: dowMap[i + 1]?.orders || 0,
      netSales: round(dowMap[i + 1]?.netSales),
    })),
    byHour: Array.from({ length: 24 }, (_, h) => ({
      key: String(h).padStart(2, "0"),
      orders: hourMap[h]?.orders || 0,
      netSales: round(hourMap[h]?.netSales),
    })),
  };
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
async function getLandingPagePerformance(start, end, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...dateMatch(start, end), source: "landing_page" } },
    {
      $group: {
        _id: { $ifNull: ["$landingPage.code", "unknown"] },
        name: { $first: "$landingPage.name" },
        orders: { $sum: 1 },
        netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
      },
    },
    { $sort: { netSales: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    code: r._id,
    name: r.name || "",
    orders: r.orders,
    netSales: round(r.netSales),
    collected: round(r.collected),
    cancelled: r.cancelled,
  }));
}

async function getDiscountUsage(start, end, limit = 8) {
  const rows = await Order.aggregate([
    { $match: { ...dateMatch(start, end), ...NOT_CANCELLED, "appliedDiscounts.0": { $exists: true } } },
    { $unwind: "$appliedDiscounts" },
    {
      $group: {
        _id: { $ifNull: ["$appliedDiscounts.code", "$appliedDiscounts.title"] },
        title: { $first: "$appliedDiscounts.title" },
        uses: { $sum: 1 },
        amount: { $sum: { $ifNull: ["$appliedDiscounts.amount", 0] } },
        revenue: { $sum: "$totalAmount" },
      },
    },
    { $sort: { amount: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    code: r._id || "—",
    title: r.title || "",
    uses: r.uses,
    amount: round(r.amount),
    revenue: round(r.revenue),
  }));
}

// Registrations are counted off the users collection — a customer can sign up
// without ordering, which the order-derived numbers above would never see.
async function getSignups(start, end) {
  const match = { role: "customer", ...dateMatch(start, end) };
  const [total, guests] = await Promise.all([
    User.countDocuments(match),
    User.countDocuments({ ...match, isGuest: true }),
  ]);
  return { total, guests, registered: total - guests };
}

// ── Public entry point ────────────────────────────────────────────────────────
// Returns every dataset the Analytics page renders. `prev` is the same headline
// KPIs for the preceding window, or null when there's nothing to compare to.
export async function getAnalytics({ start, end, prev }) {
  const granularity = pickGranularity(start, end);

  const [
    totals,
    prevTotals,
    series,
    byStatus,
    bySource,
    byPayment,
    byZone,
    topProducts,
    topCategories,
    customers,
    topCustomers,
    whenTheyBuy,
    landingPages,
    discounts,
    signups,
  ] = await Promise.all([
    getTotals(start, end),
    prev ? getTotals(prev.start, prev.end) : Promise.resolve(null),
    getSeries(start, end, granularity),
    groupBy("orderStatus", start, end, { fallback: "pending" }),
    groupBy("source", start, end, { fallback: "website" }),
    groupBy("paymentMethod", start, end, { fallback: "cod" }),
    groupBy("shippingZone", start, end, { fallback: "inside_dhaka" }),
    getTopProducts(start, end),
    getTopCategories(start, end),
    getCustomerSplit(start, end),
    getTopCustomers(start, end),
    getWhenTheyBuy(start, end),
    getLandingPagePerformance(start, end),
    getDiscountUsage(start, end),
    getSignups(start, end),
  ]);

  return {
    granularity,
    totals,
    prevTotals,
    series,
    byStatus,
    bySource,
    byPayment,
    byZone,
    topProducts,
    topCategories,
    customers,
    topCustomers,
    whenTheyBuy,
    landingPages,
    discounts,
    signups,
  };
}

// Percentage change between two periods. null when the baseline is zero — "up
// from nothing" is not a percentage, and rendering ∞% helps nobody.
export function pctChange(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (!p) return c ? null : 0;
  return round(((c - p) / p) * 100);
}

// The daily/monthly series as CSV, for the export button.
export function seriesToCsv(series, granularity) {
  const head = [granularity === "month" ? "Month" : "Date", "Orders", "Net sales", "Collected (delivered)", "Cancelled orders"];
  const lines = series.map((r) => [r.key, r.orders, r.netSales, r.collected, r.cancelled].join(","));
  return [head.join(","), ...lines].join("\n");
}
