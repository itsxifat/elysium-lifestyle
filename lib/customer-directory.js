import { escapeRegExp, normalizeBdPhone } from "@/lib/utils";
import { ROLES } from "@/lib/permissions";

// The one definition of how the customer directory is filtered, ranked and
// rolled up. The list endpoint and the CSV export both read from here so an
// export can never disagree with the table it was taken from.

export const SEGMENTS = ["all", "guests", "registered", "team", "repeat", "inactive"];

export const SORTS = {
  recent: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { name: 1 },
  orders: { orderCount: -1, totalSpent: -1 },
  spent: { totalSpent: -1, orderCount: -1 },
  collected: { collected: -1, orderCount: -1 },
  last_order: { lastOrderAt: -1 },
};

// Sorts that read a stored field can paginate BEFORE the per-customer order
// rollup, so a page costs `limit` lookups instead of one per matching customer.
export const STORED_SORTS = new Set(["recent", "oldest", "name"]);

// One customer's order rollup, in the COD vocabulary /admin/analytics uses:
//
//   totalSpent — what this person was invoiced for and did not send back.
//   collected  — what they actually paid us. On COD that is delivered orders
//                and nothing else, so it is the only number that is money.
//
// One deliberate difference from the analytics page: a RETURNED order is
// excluded from totalSpent here. Analytics reports shop revenue, where a return
// is a separate line; a customer record answers "what is this person worth",
// and goods that came back are not worth anything.
export const ORDER_ROLLUP = {
  $lookup: {
    from: "orders",
    let: { uid: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$user", "$$uid"] } } },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalSpent: {
            $sum: {
              $cond: [{ $in: ["$orderStatus", ["cancelled", "returned"]] }, 0, "$totalAmount"],
            },
          },
          returnedCount: { $sum: { $cond: [{ $in: ["$orderStatus", ["returned", "partial_returned"]] }, 1, 0] } },
          collected: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] } },
          deliveredCount: { $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, 1, 0] } },
          cancelledCount: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
          lastOrderAt: { $max: "$createdAt" },
          firstOrderAt: { $min: "$createdAt" },
          channels: { $addToSet: "$source" },
        },
      },
    ],
    as: "_rollup",
  },
};

export const FLATTEN_ROLLUP = [
  { $addFields: { _r: { $ifNull: [{ $arrayElemAt: ["$_rollup", 0] }, {}] } } },
  {
    $addFields: {
      orderCount: { $ifNull: ["$_r.orderCount", 0] },
      totalSpent: { $ifNull: ["$_r.totalSpent", 0] },
      collected: { $ifNull: ["$_r.collected", 0] },
      deliveredCount: { $ifNull: ["$_r.deliveredCount", 0] },
      cancelledCount: { $ifNull: ["$_r.cancelledCount", 0] },
      returnedCount: { $ifNull: ["$_r.returnedCount", 0] },
      lastOrderAt: "$_r.lastOrderAt",
      firstOrderAt: "$_r.firstOrderAt",
      channels: { $ifNull: ["$_r.channels", []] },
    },
  },
  {
    $project: {
      _rollup: 0, _r: 0, password: 0, adminPin: 0,
      verificationOTP: 0, resetToken: 0, pinFailedAttempts: 0,
    },
  },
];

// Segments defined by the rollup rather than by a stored field — they can only
// be applied after the $lookup.
export function postMatchFor(segment) {
  if (segment === "repeat") return { orderCount: { $gte: 2 } };
  if (segment === "inactive") return { orderCount: 0 };
  return null;
}

export function buildFilter({ segment, role, q }) {
  const filter = {};

  if (segment === "team") {
    filter.role = role || { $ne: ROLES.CUSTOMER };
  } else {
    filter.role = ROLES.CUSTOMER;
    if (segment === "guests") filter.isGuest = true;
    if (segment === "registered") filter.isGuest = { $ne: true };
  }

  const safeQ = escapeRegExp(q);
  if (safeQ) {
    const or = [
      { name: { $regex: safeQ, $options: "i" } },
      { email: { $regex: safeQ, $options: "i" } },
      { phone: { $regex: safeQ, $options: "i" } },
    ];
    // A pasted "+880 17…" or "88017…" must find the stored "017…" form.
    const normalized = normalizeBdPhone(q);
    if (normalized && normalized !== q) {
      or.push({ phone: { $regex: escapeRegExp(normalized), $options: "i" } });
    }
    filter.$or = or;
  }
  return filter;
}

// Assemble the full pipeline for a directory query.
export function buildPipeline({ segment, role, q, sortKey, skip = 0, limit = 25 }) {
  const filter = buildFilter({ segment, role, q });
  const sortSpec = SORTS[sortKey] || SORTS.recent;
  const postMatch = postMatchFor(segment);

  if (STORED_SORTS.has(sortKey) && !postMatch) {
    return [{ $match: filter }, { $sort: sortSpec }, { $skip: skip }, { $limit: limit }, ORDER_ROLLUP, ...FLATTEN_ROLLUP];
  }
  const pipeline = [{ $match: filter }, ORDER_ROLLUP, ...FLATTEN_ROLLUP];
  if (postMatch) pipeline.push({ $match: postMatch });
  pipeline.push({ $sort: sortSpec }, { $skip: skip }, { $limit: limit });
  return pipeline;
}

// Present a customer row the same way everywhere.
export function serializeCustomer(u) {
  return {
    _id: String(u._id),
    name: u.name,
    email: u.email || null,
    image: u.image || null,
    role: u.role,
    permissions: u.permissions || [],
    phone: u.phone || null,
    isGuest: !!u.isGuest,
    guestSource: u.guestSource || "",
    emailVerified: !!u.emailVerified,
    createdAt: u.createdAt,
    hasPin: !!u.pinSetAt,
    pinLockedUntil:
      u.pinLockedUntil && new Date(u.pinLockedUntil).getTime() > Date.now() ? u.pinLockedUntil : null,
    orderCount: u.orderCount || 0,
    totalSpent: u.totalSpent || 0,
    collected: u.collected || 0,
    deliveredCount: u.deliveredCount || 0,
    cancelledCount: u.cancelledCount || 0,
    returnedCount: u.returnedCount || 0,
    lastOrderAt: u.lastOrderAt || null,
    firstOrderAt: u.firstOrderAt || null,
    channels: (u.channels || []).filter(Boolean),
  };
}
