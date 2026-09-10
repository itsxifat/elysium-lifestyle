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
// ── Scoping ───────────────────────────────────────────────────────────────────
// Every dataset takes the same `filters` object ({ source, staff }) so the whole
// page can be narrowed to one channel or one staff member and keep agreeing with
// itself. See scopeMatch().
//
// NOTE: the store records no cost price per product, so true profit/margin
// cannot be computed. Everything below is revenue, not profit.
import mongoose from "mongoose";
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
  ncom: "ncom.bd",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  phone: "Phone",
  offline: "Walk-in",
  other: "Manual",
};

// ── Channel families ──────────────────────────────────────────────────────────
// Nine raw sources is too many to read at a glance and too many to chart, so
// they roll up into five families that answer different business questions:
// what the shop sells on its own, what paid funnels bring in, what the team
// closes by hand, and what a partner sends us.
//
// `sources` is also what the channel filter expands a family key into, so the
// grouping here is the single definition of "Social selling" everywhere.
export const CHANNEL_GROUPS = [
  {
    key: "storefront",
    label: "Own storefront",
    hint: "Customers checking themselves out",
    sources: ["website"],
    staffKeyed: false,
  },
  {
    key: "campaign",
    label: "Campaign funnels",
    hint: "/lp landing pages",
    sources: ["landing_page"],
    staffKeyed: false,
  },
  {
    key: "social",
    label: "Social selling",
    hint: "Closed in DMs, keyed in by the team",
    sources: ["facebook", "instagram", "whatsapp"],
    staffKeyed: true,
  },
  {
    key: "direct",
    label: "Direct & walk-in",
    hint: "Phone, counter and other manual sales",
    sources: ["phone", "offline", "other"],
    staffKeyed: true,
  },
  {
    key: "partner",
    label: "Partner feed",
    hint: "Sold on ncom.bd pages, shipped by us",
    sources: ["ncom"],
    staffKeyed: false,
  },
];

// source → family key. Anything unrecognised is treated as a direct sale rather
// than dropped, so a channel added to the model later still shows up somewhere.
export const CHANNEL_GROUP_OF = Object.fromEntries(
  CHANNEL_GROUPS.flatMap((g) => g.sources.map((s) => [s, g.key]))
);
export const groupOfSource = (source) => CHANNEL_GROUP_OF[source] || "direct";

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

// How an order got into the system at all — the split the team's own numbers
// have to be read against, since only "staff" orders have anyone to credit.
export const ORIGIN_LABELS = {
  staff: "Keyed in by the team",
  self: "Customer self-serve",
  partner: "Partner feed",
};

// createdAt filter for a { start, end } window (either bound may be null).
function dateMatch(start, end, field = "createdAt") {
  const m = {};
  if (start) m.$gte = start;
  if (end) m.$lt = end;
  return Object.keys(m).length ? { [field]: m } : {};
}

// ── Page-wide scope ───────────────────────────────────────────────────────────
// `source` accepts a raw source ("facebook"), a family key ("social") or "" for
// everything. `staff` accepts a user id, "self" (nobody keyed it in) or "any"
// (anything a person keyed in).
//
// Orders saved before `source` existed have no field at all and were storefront
// checkouts, so a "website" filter has to match a missing value too — likewise
// createdBy, which is absent rather than null on old documents.
export function scopeMatch(filters = {}) {
  const m = {};

  const src = filters.source;
  if (src) {
    const group = CHANNEL_GROUPS.find((g) => g.key === src);
    const list = group ? group.sources : [src];
    const withLegacy = list.includes("website") ? [...list, null] : list;
    m.source = withLegacy.length === 1 ? withLegacy[0] : { $in: withLegacy };
  }

  const staff = filters.staff;
  if (staff === "self") m.createdBy = null;
  else if (staff === "any") m.createdBy = { $ne: null };
  else if (staff && mongoose.Types.ObjectId.isValid(staff)) m.createdBy = new mongoose.Types.ObjectId(staff);

  return m;
}

function baseMatch(start, end, filters) {
  return { ...dateMatch(start, end), ...scopeMatch(filters) };
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
const pct = (part, whole) => (whole ? round((part / whole) * 100) : 0);

// Units on an order line, net of anything the customer sent back. Used AFTER an
// $unwind of items.
const NET_QTY = { $max: [0, { $subtract: ["$items.quantity", { $ifNull: ["$items.returnedQuantity", 0] }] }] };

// The same measure for a whole order document, without unwinding — so units can
// be summed in the same pass as the money instead of costing a second query.
const ORDER_NET_UNITS = {
  $sum: {
    $map: {
      input: { $ifNull: ["$items", []] },
      as: "i",
      in: { $max: [0, { $subtract: ["$$i.quantity", { $ifNull: ["$$i.returnedQuantity", 0] }] }] },
    },
  },
};

// Who the buyer is: the account when the order is attached to one, the phone
// otherwise (legacy and guest orders).
const BUYER_KEY = { $ifNull: ["$user", "$shippingAddress.phone"] };

// ── The standard measure set ──────────────────────────────────────────────────
// Every breakdown on this page reports the same columns, so they are defined
// once and spread into each $group. Anything that differs (a channel's buyer
// count, a staff member's active days) is added on top at the call site.
const MEASURES = {
  orders: { $sum: 1 },
  cancelledOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
  deliveredOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] } },
  pendingOrders: { $sum: { $cond: [{ $in: ["$orderStatus", ["pending", "processing", "shipped"]] }, 1, 0] } },
  grossSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$subtotal", 0] } },
  netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
  shipping: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$shippingFee", 0] } },
  discounts: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$discount", 0] } },
  collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
  inFlight: {
    $sum: { $cond: [{ $in: ["$orderStatus", ["pending", "processing", "shipped"]] }, "$totalAmount", 0] },
  },
  cancelledValue: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
  returnedAmount: { $sum: { $ifNull: ["$returnedAmount", 0] } },
  paidOrders: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] } },
  units: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, ORDER_NET_UNITS, 0] } },
};

// Raw MEASURES row → the rounded, derived shape every table and card reads.
// Rates are computed here rather than in the template so "delivery rate" means
// exactly one thing on every panel of the page.
function derive(row) {
  const r = row || {};
  const orders = r.orders || 0;
  const cancelled = r.cancelledOrders || 0;
  const delivered = r.deliveredOrders || 0;
  const sellable = orders - cancelled;
  const settled = delivered + cancelled; // orders that have reached an outcome
  const units = r.units || 0;
  const netSales = r.netSales || 0;

  return {
    orders,
    sellableOrders: sellable,
    cancelledOrders: cancelled,
    deliveredOrders: delivered,
    pendingOrders: r.pendingOrders || 0,
    paidOrders: r.paidOrders || 0,
    grossSales: round(r.grossSales),
    netSales: round(netSales),
    shipping: round(r.shipping),
    discounts: round(r.discounts),
    collected: round(r.collected),
    inFlight: round(r.inFlight),
    cancelledValue: round(r.cancelledValue),
    returnedAmount: round(r.returnedAmount),
    units,
    aov: sellable ? round(netSales / sellable) : 0,
    unitsPerOrder: sellable ? round(units / sellable) : 0,
    // Of the orders that have reached an outcome, how many arrived.
    deliveryRate: pct(delivered, settled),
    cancelRate: pct(cancelled, orders),
    discountRate: pct(r.discounts || 0, r.grossSales || 0),
  };
}

// ── Headline KPIs ─────────────────────────────────────────────────────────────
// One pass over the window. Also used for the comparison period and by the
// dashboard's "today / this month" strip, which is why it's split out.
export async function getTotals(start, end, filters = {}) {
  const [row] = await Order.aggregate([
    { $match: baseMatch(start, end, filters) },
    { $group: { _id: null, ...MEASURES } },
  ]);
  return derive(row);
}

// ── Revenue over time ─────────────────────────────────────────────────────────
async function getSeries(start, end, granularity, filters) {
  const fmt = granularity === "month" ? "%Y-%m" : "%Y-%m-%d";
  const rows = await Order.aggregate([
    { $match: baseMatch(start, end, filters) },
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

// ── Breakdowns: one row per payment method / zone / status ────────────────────
// `fallback` names the bucket for documents predating the field.
async function groupBy(field, start, end, filters, { fallback = "unknown" } = {}) {
  const rows = await Order.aggregate([
    { $match: baseMatch(start, end, filters) },
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

// ── Channels ──────────────────────────────────────────────────────────────────
// The full measure set per sales channel, rolled up into families, with the same
// window a period earlier alongside it so every channel carries its own trend
// rather than only the store total doing so.
//
// Answers, in one table: which channel brings the orders, which brings the
// money, which one's parcels actually arrive, and which one is quietly being
// discounted to death.
async function channelRows(start, end, filters) {
  const rows = await Order.aggregate([
    { $match: baseMatch(start, end, filters) },
    {
      $group: {
        _id: { $ifNull: ["$source", "website"] },
        ...MEASURES,
        buyers: { $addToSet: BUYER_KEY },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
    { $project: { measures: "$$ROOT", buyers: { $size: "$buyers" }, lastOrderAt: 1 } },
  ]);

  return rows.map((r) => ({
    key: r._id,
    buyers: r.buyers,
    lastOrderAt: r.lastOrderAt,
    ...derive(r.measures),
  }));
}

async function getChannels(start, end, filters, prev) {
  const [current, previous] = await Promise.all([
    channelRows(start, end, filters),
    prev ? channelRows(prev.start, prev.end, filters) : Promise.resolve([]),
  ]);

  const prevByKey = Object.fromEntries(previous.map((r) => [r.key, r]));
  const totalNet = current.reduce((s, r) => s + r.netSales, 0);
  const totalOrders = current.reduce((s, r) => s + r.orders, 0);

  const channels = current
    .map((r) => ({
      ...r,
      label: SOURCE_LABELS[r.key] || r.key,
      group: groupOfSource(r.key),
      shareOfSales: pct(r.netSales, totalNet),
      shareOfOrders: pct(r.orders, totalOrders),
      prev: prevByKey[r.key]
        ? { orders: prevByKey[r.key].orders, netSales: prevByKey[r.key].netSales, units: prevByKey[r.key].units }
        : null,
      // null = there was nothing to compare against, which is not "no growth".
      netSalesChange: prev ? pctChange(r.netSales, prevByKey[r.key]?.netSales ?? 0) : undefined,
      ordersChange: prev ? pctChange(r.orders, prevByKey[r.key]?.orders ?? 0) : undefined,
    }))
    .sort((a, b) => b.netSales - a.netSales || b.orders - a.orders);

  // Family roll-up. Summing the derived rates would be wrong (an average of
  // rates is not the rate of the sum), so every family re-derives from its own
  // members' raw counts.
  const groups = CHANNEL_GROUPS.map((g) => {
    const members = channels.filter((c) => c.group === g.key);
    const sum = (f) => members.reduce((s, m) => s + (m[f] || 0), 0);
    const orders = sum("orders");
    const cancelled = sum("cancelledOrders");
    const delivered = sum("deliveredOrders");
    const sellable = orders - cancelled;
    const settled = delivered + cancelled;
    const netSales = round(sum("netSales"));
    const units = sum("units");
    const prevNet = members.reduce((s, m) => s + (m.prev?.netSales || 0), 0);

    return {
      key: g.key,
      label: g.label,
      hint: g.hint,
      staffKeyed: g.staffKeyed,
      channels: members,
      orders,
      sellableOrders: sellable,
      cancelledOrders: cancelled,
      deliveredOrders: delivered,
      units,
      netSales,
      collected: round(sum("collected")),
      inFlight: round(sum("inFlight")),
      cancelledValue: round(sum("cancelledValue")),
      discounts: round(sum("discounts")),
      buyers: sum("buyers"),
      aov: sellable ? round(netSales / sellable) : 0,
      unitsPerOrder: sellable ? round(units / sellable) : 0,
      deliveryRate: pct(delivered, settled),
      cancelRate: pct(cancelled, orders),
      shareOfSales: pct(netSales, totalNet),
      shareOfOrders: pct(orders, totalOrders),
      netSalesChange: prev ? pctChange(netSales, prevNet) : undefined,
    };
  }).filter((g) => g.orders > 0);

  return {
    channels,
    groups: groups.sort((a, b) => b.netSales - a.netSales),
    totalNet: round(totalNet),
    totalOrders,
  };
}

// Channel mix over time — the one view that shows a shift rather than a state.
// Bucketed by family, not by raw source: five stacked bands are readable, nine
// are not.
async function getChannelSeries(start, end, granularity, filters) {
  const fmt = granularity === "month" ? "%Y-%m" : "%Y-%m-%d";
  const rows = await Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), ...NOT_CANCELLED } },
    {
      $group: {
        _id: {
          bucket: { $dateToString: { format: fmt, date: "$createdAt", timezone: TZ } },
          source: { $ifNull: ["$source", "website"] },
        },
        orders: { $sum: 1 },
        netSales: { $sum: "$totalAmount" },
      },
    },
  ]);

  const byBucket = {};
  for (const r of rows) {
    const g = groupOfSource(r._id.source);
    const b = (byBucket[r._id.bucket] ||= {});
    b[g] = b[g] || { orders: 0, netSales: 0 };
    b[g].orders += r.orders;
    b[g].netSales += r.netSales;
  }

  const keys = start
    ? bucketKeys(start, end || new Date(Date.now() + 1), granularity)
    : Object.keys(byBucket).sort();

  return keys.map((key) => {
    const b = byBucket[key] || {};
    const parts = Object.fromEntries(
      CHANNEL_GROUPS.map((g) => [g.key, { orders: b[g.key]?.orders || 0, netSales: round(b[g.key]?.netSales) }])
    );
    return {
      key,
      parts,
      orders: CHANNEL_GROUPS.reduce((s, g) => s + parts[g.key].orders, 0),
      netSales: round(CHANNEL_GROUPS.reduce((s, g) => s + parts[g.key].netSales, 0)),
    };
  });
}

// How orders reach the system at all. The denominator the team leaderboard has
// to be read against: only the "staff" slice has anybody to credit.
async function getOriginSplit(start, end, filters) {
  const rows = await Order.aggregate([
    { $match: baseMatch(start, end, filters) },
    {
      $group: {
        _id: {
          $cond: [
            { $ne: [{ $ifNull: ["$createdBy", null] }, null] },
            "staff",
            { $cond: [{ $eq: ["$source", "ncom"] }, "partner", "self"] },
          ],
        },
        ...MEASURES,
      },
    },
  ]);

  const byKey = Object.fromEntries(rows.map((r) => [r._id, derive(r)]));
  const totalNet = rows.reduce((s, r) => s + (r.netSales || 0), 0);
  const totalOrders = rows.reduce((s, r) => s + (r.orders || 0), 0);

  return ["staff", "self", "partner"].map((key) => {
    const r = byKey[key] || derive(null);
    return {
      key,
      label: ORIGIN_LABELS[key],
      ...r,
      shareOfSales: pct(r.netSales, totalNet),
      shareOfOrders: pct(r.orders, totalOrders),
    };
  });
}

// ── The team ──────────────────────────────────────────────────────────────────
// Everything below is about ORDERS A PERSON KEYED IN (`createdBy`). Storefront,
// landing-page and ncom orders have no author and are deliberately absent — a
// leaderboard that credited the website to whoever happened to be on shift
// would be worse than no leaderboard.
//
// Names come off the order's own `createdByName` snapshot so a departed staff
// member's record still reads correctly; role/email are looked up when the
// account still exists.
async function staffRows(start, end, filters) {
  return Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), createdBy: { $ne: null } } },
    {
      $group: {
        _id: "$createdBy",
        name: { $last: "$createdByName" },
        ...MEASURES,
        buyers: { $addToSet: BUYER_KEY },
        activeDays: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } } },
        firstOrderAt: { $min: "$createdAt" },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
    {
      $project: {
        measures: "$$ROOT",
        name: 1,
        buyers: { $size: "$buyers" },
        activeDays: { $size: "$activeDays" },
        firstOrderAt: 1,
        lastOrderAt: 1,
      },
    },
  ]);
}

// Which channels each person sells through — the difference between a Facebook
// closer and a counter salesperson, which the totals alone hide.
async function staffChannelRows(start, end, filters) {
  return Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), createdBy: { $ne: null } } },
    {
      $group: {
        _id: { staff: "$createdBy", source: { $ifNull: ["$source", "other"] } },
        orders: { $sum: 1 },
        netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        units: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, ORDER_NET_UNITS, 0] } },
      },
    },
    { $sort: { netSales: -1 } },
  ]);
}

// What the team DID to orders, as opposed to what it created.
//
// Read off the audit trail, and windowed on when the action happened rather than
// on when the order was placed — "who worked this week" is a different question
// from "whose orders were placed this week", and a moderator who processes and
// never creates is invisible to every other number on this page.
async function staffActivityRows(start, end) {
  // The first $match is on the ARRAY field, so it keeps only orders with at
  // least one entry in the window and can be served by the multikey index on
  // editHistory.at. The post-$unwind match then drops the sibling entries of a
  // matched order that fall outside it — both are needed, and dropping the
  // first turns this into a scan of every order ever edited.
  const [row] = await Order.aggregate([
    { $match: { "editHistory.0": { $exists: true }, ...dateMatch(start, end, "editHistory.at") } },
    { $unwind: "$editHistory" },
    { $match: { ...dateMatch(start, end, "editHistory.at"), "editHistory.by": { $ne: null } } },
    {
      $facet: {
        // Per person per action type — "12 status changes, 3 returns".
        byAction: [
          {
            $group: {
              _id: { by: "$editHistory.by", action: { $ifNull: ["$editHistory.action", "other"] } },
              n: { $sum: 1 },
              name: { $last: "$editHistory.byName" },
              lastAt: { $max: "$editHistory.at" },
            },
          },
        ],
        // Distinct orders touched, counted without shipping every id to Node.
        byPerson: [
          { $group: { _id: { by: "$editHistory.by", order: "$_id" } } },
          { $group: { _id: "$_id.by", ordersTouched: { $sum: 1 } } },
        ],
      },
    },
  ]);
  return row || { byAction: [], byPerson: [] };
}

export const ACTION_LABELS = {
  edit: "Order edits",
  status_change: "Status changes",
  payment_update: "Payment updates",
  payment_change: "Payment changes",
  return: "Returns recorded",
  return_edit: "Return edits",
  other: "Other actions",
};

async function getTeam(start, end, filters, prev) {
  const [rows, prevRows, channelSplit, activity] = await Promise.all([
    staffRows(start, end, filters),
    prev ? staffRows(prev.start, prev.end, filters) : Promise.resolve([]),
    staffChannelRows(start, end, filters),
    staffActivityRows(start, end),
  ]);

  // One lookup for every person who appears anywhere below — as an author, or
  // only in the audit trail.
  const ids = new Set([
    ...rows.map((r) => String(r._id)),
    ...activity.byAction.map((a) => String(a._id.by)),
  ]);
  const accounts = ids.size
    ? await User.find({ _id: { $in: [...ids] } }).select("name email role image").lean()
    : [];
  const accountById = Object.fromEntries(accounts.map((u) => [String(u._id), u]));

  const prevById = Object.fromEntries(prevRows.map((r) => [String(r._id), derive(r.measures)]));

  const channelsByStaff = {};
  for (const r of channelSplit) {
    (channelsByStaff[String(r._id.staff)] ||= []).push({
      key: r._id.source,
      label: SOURCE_LABELS[r._id.source] || r._id.source,
      group: groupOfSource(r._id.source),
      orders: r.orders,
      units: r.units,
      netSales: round(r.netSales),
    });
  }

  const actionsByStaff = {};
  for (const a of activity.byAction) {
    const id = String(a._id.by);
    const e = (actionsByStaff[id] ||= { total: 0, lastAt: null, name: a.name, byAction: [] });
    e.total += a.n;
    e.byAction.push({ key: a._id.action, label: ACTION_LABELS[a._id.action] || a._id.action, n: a.n });
    if (!e.lastAt || a.lastAt > e.lastAt) e.lastAt = a.lastAt;
    if (a.name) e.name = a.name;
  }
  for (const e of Object.values(actionsByStaff)) e.byAction.sort((x, y) => y.n - x.n);
  const touchedByStaff = Object.fromEntries(activity.byPerson.map((r) => [String(r._id), r.ordersTouched]));

  const totalNet = rows.reduce((s, r) => s + (r.measures.netSales || 0), 0);
  const totalOrders = rows.reduce((s, r) => s + (r.measures.orders || 0), 0);
  const totalUnits = rows.reduce((s, r) => s + (r.measures.units || 0), 0);
  // Rolling presets ("last 30 days") carry no end bound — the window runs to
  // now, so that is what the pace is measured against.
  const days = start ? Math.max(1, Math.round(((end || new Date()) - start) / 86400000)) : null;

  const members = rows
    .map((r) => {
      const id = String(r._id);
      const acct = accountById[id];
      const m = derive(r.measures);
      const act = actionsByStaff[id];
      return {
        id,
        name: acct?.name || r.name || "Removed staff",
        email: acct?.email || "",
        role: acct?.role || null, // null = the account is gone; the record isn't
        active: !!acct,
        ...m,
        buyers: r.buyers,
        activeDays: r.activeDays,
        firstOrderAt: r.firstOrderAt,
        lastOrderAt: r.lastOrderAt,
        ordersPerActiveDay: r.activeDays ? round(m.orders / r.activeDays) : 0,
        shareOfSales: pct(m.netSales, totalNet),
        shareOfOrders: pct(m.orders, totalOrders),
        channels: channelsByStaff[id] || [],
        ordersTouched: touchedByStaff[id] || 0,
        actions: act?.total || 0,
        actionBreakdown: act?.byAction || [],
        lastActionAt: act?.lastAt || null,
        netSalesChange: prev ? pctChange(m.netSales, prevById[id]?.netSales ?? 0) : undefined,
        ordersChange: prev ? pctChange(m.orders, prevById[id]?.orders ?? 0) : undefined,
      };
    })
    .sort((a, b) => b.netSales - a.netSales || b.orders - a.orders);

  // People who only ever processed orders — no sale to their name, but real
  // work done. Listed separately so the sales leaderboard stays a sales
  // leaderboard.
  const sellerIds = new Set(members.map((m) => m.id));
  const processors = Object.entries(actionsByStaff)
    .filter(([id]) => !sellerIds.has(id))
    .map(([id, e]) => ({
      id,
      name: accountById[id]?.name || e.name || "Removed staff",
      role: accountById[id]?.role || null,
      active: !!accountById[id],
      ordersTouched: touchedByStaff[id] || 0,
      actions: e.total,
      actionBreakdown: e.byAction,
      lastActionAt: e.lastAt,
    }))
    .sort((a, b) => b.actions - a.actions);

  return {
    members,
    processors,
    totals: {
      people: members.length,
      orders: totalOrders,
      units: totalUnits,
      netSales: round(totalNet),
      collected: round(rows.reduce((s, r) => s + (r.measures.collected || 0), 0)),
      aovPerOrder: totalOrders ? round(totalNet / totalOrders) : 0,
      ordersPerDay: days ? round(totalOrders / days) : null,
      actions: Object.values(actionsByStaff).reduce((s, e) => s + e.total, 0),
    },
  };
}

// ── Products ──────────────────────────────────────────────────────────────────
async function getTopProducts(start, end, filters, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), ...NOT_CANCELLED } },
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
async function getTopCategories(start, end, filters, limit = 8) {
  const rows = await Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), ...NOT_CANCELLED } },
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
//
// The channel/staff scope is applied to that whole-history pass too, so with a
// filter on, "first-time" means first time THROUGH THAT CHANNEL — which is the
// question someone looking at a single channel is actually asking. Unfiltered,
// it is exactly the store-wide figure.
async function getCustomerSplit(start, end, filters) {
  const [row] = await Order.aggregate([
    { $match: { ...NOT_CANCELLED, ...scopeMatch(filters) } },
    { $addFields: { ck: BUYER_KEY } },
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
    returningShare: pct(buyers - newBuyers, buyers),
  };
}

async function getTopCustomers(start, end, filters, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), ...NOT_CANCELLED } },
    { $addFields: { ck: BUYER_KEY } },
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
async function getWhenTheyBuy(start, end, filters) {
  const match = { ...baseMatch(start, end, filters), ...NOT_CANCELLED };
  const [dow, hour] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dayOfWeek: { date: "$createdAt", timezone: TZ } }, // 1 = Sunday
          orders: { $sum: 1 },
          netSales: { $sum: "$totalAmount" },
        },
      },
    ]),
    Order.aggregate([
      { $match: match },
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
async function getLandingPagePerformance(start, end, filters, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), source: "landing_page" } },
    {
      $group: {
        _id: { $ifNull: ["$landingPage.code", "unknown"] },
        name: { $first: "$landingPage.name" },
        orders: { $sum: 1 },
        netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
        units: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, ORDER_NET_UNITS, 0] } },
      },
    },
    { $sort: { netSales: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    code: r._id,
    name: r.name || "",
    orders: r.orders,
    units: r.units,
    netSales: round(r.netSales),
    collected: round(r.collected),
    cancelled: r.cancelled,
  }));
}

// Partner (ncom.bd) orders, broken out by the storefront and page that sold
// them. The partner equivalent of the landing-page table: an ncom order is
// packed by us but sold on somebody else's page, so "which of their sites and
// which offer" is the only campaign detail that exists for it.
async function getPartnerPerformance(start, end, filters, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...baseMatch(start, end, filters), source: "ncom" } },
    {
      $group: {
        _id: {
          store: { $ifNull: ["$ncom.storeName", "ncom.bd"] },
          offer: { $ifNull: ["$ncom.offerLabel", ""] },
        },
        pageTitle: { $last: "$ncom.pageTitle" },
        orders: { $sum: 1 },
        netSales: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, "$totalAmount", 0] } },
        collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
        units: { $sum: { $cond: [{ $ne: ["$orderStatus", "cancelled"] }, ORDER_NET_UNITS, 0] } },
      },
    },
    { $sort: { netSales: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    key: `${r._id.store}::${r._id.offer}`,
    store: r._id.store || "ncom.bd",
    offer: r._id.offer || "",
    pageTitle: r.pageTitle || "",
    orders: r.orders,
    units: r.units,
    netSales: round(r.netSales),
    collected: round(r.collected),
    cancelled: r.cancelled,
  }));
}

async function getDiscountUsage(start, end, filters, limit = 8) {
  const rows = await Order.aggregate([
    {
      $match: {
        ...baseMatch(start, end, filters),
        ...NOT_CANCELLED,
        "appliedDiscounts.0": { $exists: true },
      },
    },
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
// Deliberately NOT scoped by the channel/staff filter: a signup has no sales
// channel to filter on, so narrowing it would just silently zero the tile.
async function getSignups(start, end) {
  const match = { role: "customer", ...dateMatch(start, end) };
  const [total, guests] = await Promise.all([
    User.countDocuments(match),
    User.countDocuments({ ...match, isGuest: true }),
  ]);
  return { total, guests, registered: total - guests };
}

// The staff accounts the "Created by" filter offers. Everyone who may enter the
// panel, not only those with sales in the current window — a dropdown whose
// options appear and vanish as you change the date range is unusable.
export async function getStaffDirectory() {
  const rows = await User.find({ role: { $in: ["superadmin", "admin", "moderator", "staff"] } })
    .select("name email role")
    .sort({ name: 1 })
    .lean();
  return rows.map((u) => ({ id: String(u._id), name: u.name || u.email || "Staff", role: u.role }));
}

// ── Public entry point ────────────────────────────────────────────────────────
// Returns every dataset the Analytics page renders. `prev` is the same window a
// period earlier (or null when there's nothing to compare to); `filters` scopes
// every dataset at once — see scopeMatch().
export async function getAnalytics({ start, end, prev, filters = {} }) {
  const granularity = pickGranularity(start, end);

  const [
    totals,
    prevTotals,
    series,
    byStatus,
    byPayment,
    byZone,
    channels,
    channelSeries,
    origins,
    team,
    topProducts,
    topCategories,
    customers,
    topCustomers,
    whenTheyBuy,
    landingPages,
    partnerPages,
    discounts,
    signups,
  ] = await Promise.all([
    getTotals(start, end, filters),
    prev ? getTotals(prev.start, prev.end, filters) : Promise.resolve(null),
    getSeries(start, end, granularity, filters),
    groupBy("orderStatus", start, end, filters, { fallback: "pending" }),
    groupBy("paymentMethod", start, end, filters, { fallback: "cod" }),
    groupBy("shippingZone", start, end, filters, { fallback: "inside_dhaka" }),
    getChannels(start, end, filters, prev),
    getChannelSeries(start, end, granularity, filters),
    getOriginSplit(start, end, filters),
    getTeam(start, end, filters, prev),
    getTopProducts(start, end, filters),
    getTopCategories(start, end, filters),
    getCustomerSplit(start, end, filters),
    getTopCustomers(start, end, filters),
    getWhenTheyBuy(start, end, filters),
    getLandingPagePerformance(start, end, filters),
    getPartnerPerformance(start, end, filters),
    getDiscountUsage(start, end, filters),
    getSignups(start, end),
  ]);

  return {
    granularity,
    totals,
    prevTotals,
    series,
    byStatus,
    byPayment,
    byZone,
    bySource: channels.channels, // kept for the simple channel bar list
    channels,
    channelSeries,
    origins,
    team,
    topProducts,
    topCategories,
    customers,
    topCustomers,
    whenTheyBuy,
    landingPages,
    partnerPages,
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

// ── CSV exports ───────────────────────────────────────────────────────────────
// One function per dataset the export button offers. Values are quoted through
// `cell` because names, offers and page titles routinely contain commas.
const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (head, rows) => [head.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");

// The daily/monthly series, for the export button.
export function seriesToCsv(series, granularity) {
  return toCsv(
    [granularity === "month" ? "Month" : "Date", "Orders", "Net sales", "Collected (delivered)", "Cancelled orders"],
    series.map((r) => [r.key, r.orders, r.netSales, r.collected, r.cancelled])
  );
}

export function channelsToCsv(channels) {
  return toCsv(
    [
      "Channel", "Family", "Orders", "Live orders", "Cancelled", "Cancel rate %", "Units",
      "Units / order", "Net sales", "Collected", "In flight", "Lost to cancellations",
      "Discounts", "AOV", "Delivery rate %", "Buyers", "Share of sales %",
    ],
    channels.map((c) => [
      c.label, c.group, c.orders, c.sellableOrders, c.cancelledOrders, c.cancelRate, c.units,
      c.unitsPerOrder, c.netSales, c.collected, c.inFlight, c.cancelledValue,
      c.discounts, c.aov, c.deliveryRate, c.buyers, c.shareOfSales,
    ])
  );
}

export function teamToCsv(team) {
  const rows = team.members.map((m) => [
    m.name, m.role || "removed", m.orders, m.sellableOrders, m.cancelledOrders, m.cancelRate,
    m.units, m.unitsPerOrder, m.netSales, m.collected, m.inFlight, m.discounts, m.aov,
    m.deliveryRate, m.buyers, m.activeDays, m.ordersPerActiveDay, m.shareOfSales,
    m.ordersTouched, m.actions,
    m.channels.map((c) => `${c.label}: ${c.orders}`).join(" | "),
  ]);
  // Processors sell nothing, so every sales column is blank rather than 0 —
  // a zero here would read as "sold nothing this period", not "does not sell".
  const processorRows = team.processors.map((p) => [
    p.name, p.role || "removed", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
    p.ordersTouched, p.actions, "",
  ]);
  return toCsv(
    [
      "Staff", "Role", "Orders", "Live orders", "Cancelled", "Cancel rate %", "Units",
      "Units / order", "Net sales", "Collected", "In flight", "Discounts", "AOV",
      "Delivery rate %", "Customers", "Active days", "Orders / active day", "Share of sales %",
      "Orders processed", "Audit actions", "Channels",
    ],
    [...rows, ...processorRows]
  );
}
