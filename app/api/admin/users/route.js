import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import Order from "@/models/Order";
import bcrypt from "bcryptjs";
import { normalizeBdPhone } from "@/lib/utils";
import {
  SEGMENTS,
  SORTS,
  buildFilter,
  buildPipeline,
  postMatchFor,
  ORDER_ROLLUP,
  FLATTEN_ROLLUP,
  serializeCustomer,
} from "@/lib/customer-directory";
import {
  canManageRole,
  getEffectivePermissions,
  hasPermission,
  isElevated,
  PERMISSIONS,
  ROLES,
} from "@/lib/permissions";

// The customer + team directory.
//
// Two audiences share one collection and one endpoint, but they are different
// jobs with different permissions:
//
//   • CUSTOMERS (segment=all|guests|registered) — a CRM view. Almost every buyer
//     is a guest stub created from a COD order, so the list is dominated by them
//     and is only useful if it can be ranked by what those people are worth.
//     Gated on `customers.view`.
//   • TEAM (segment=team) — staff accounts, roles and permissions. A security
//     surface, gated on `users.manage`. A moderator holding `customers.view`
//     must not be able to enumerate admin accounts through a query parameter.
//
// Every write (create/edit/delete/merge) stays on `users.manage`.

// Keep only valid permission keys the actor is actually allowed to grant.
function sanitizePermissions(requested, actor) {
  if (!Array.isArray(requested)) return [];
  const actorPerms = getEffectivePermissions(actor);
  const valid = Object.keys(PERMISSIONS);
  return requested.filter((p) => valid.includes(p) && actorPerms.includes(p));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const segment = SEGMENTS.includes(searchParams.get("segment")) ? searchParams.get("segment") : "all";

  // Team listings expose staff accounts and their roles — a different clearance
  // from browsing the customer directory.
  const { error, session } = await requireAdmin(segment === "team" ? "users.manage" : "customers.view");
  if (error) return error;

  const canManageUsers = isElevated(session.user.role) || hasPermission(session.user, "users.manage");

  const q = searchParams.get("q") || "";
  const role = searchParams.get("role") || "";
  const sortKey = SORTS[searchParams.get("sort")] ? searchParams.get("sort") : "recent";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));

  await connectDB();

  const filter = buildFilter({ segment, role, q });
  const skip = (page - 1) * limit;
  const postMatch = postMatchFor(segment);
  const pipeline = buildPipeline({ segment, role, q, sortKey, skip, limit });

  // A rollup-defined segment can only be counted after the $lookup.
  const countPipeline = postMatch
    ? [{ $match: filter }, ORDER_ROLLUP, ...FLATTEN_ROLLUP, { $match: postMatch }, { $count: "n" }]
    : null;

  const [rows, total, stats] = await Promise.all([
    User.aggregate(pipeline),
    countPipeline
      ? User.aggregate(countPipeline).then((r) => r[0]?.n || 0)
      : User.countDocuments(filter),
    getDirectoryStats(),
  ]);

  const users = rows.map(serializeCustomer);

  return NextResponse.json({
    users,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    segment,
    sort: sortKey,
    canManageUsers,
    stats,
  });
}

// Headline numbers for the whole directory — deliberately NOT filtered by the
// current search, because they are the shop's totals, not the page's.
async function getDirectoryStats() {
  const [byRole, orderAgg, repeat] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          customers: { $sum: { $cond: [{ $eq: ["$role", ROLES.CUSTOMER] }, 1, 0] } },
          guests: {
            $sum: { $cond: [{ $and: [{ $eq: ["$role", ROLES.CUSTOMER] }, { $eq: ["$isGuest", true] }] }, 1, 0] },
          },
          registered: {
            $sum: { $cond: [{ $and: [{ $eq: ["$role", ROLES.CUSTOMER] }, { $ne: ["$isGuest", true] }] }, 1, 0] },
          },
          team: { $sum: { $cond: [{ $ne: ["$role", ROLES.CUSTOMER] }, 1, 0] } },
          // Reachability is a CUSTOMER statistic — counting staff phones here
          // would report more reachable people than there are customers.
          withPhone: {
            $sum: {
              $cond: [{ $and: [{ $eq: ["$role", ROLES.CUSTOMER] }, { $ifNull: ["$phone", false] }] }, 1, 0],
            },
          },
          withEmail: {
            $sum: {
              $cond: [{ $and: [{ $eq: ["$role", ROLES.CUSTOMER] }, { $ifNull: ["$email", false] }] }, 1, 0],
            },
          },
        },
      },
    ]),
    Order.aggregate([
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          unattached: { $sum: { $cond: [{ $ifNull: ["$user", false] }, 0, 1] } },
          lifetimeValue: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 0, "$totalAmount"] },
          },
          collected: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "delivered"] }, "$totalAmount", 0] },
          },
        },
      },
    ]),
    // How many buyers have come back — the number that says whether the shop has
    // a customer base or just a stream of strangers.
    Order.aggregate([
      { $match: { user: { $ne: null } } },
      { $group: { _id: "$user", n: { $sum: 1 } } },
      { $group: { _id: null, buyers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gte: ["$n", 2] }, 1, 0] } } } },
    ]),
  ]);

  const u = byRole[0] || {};
  const o = orderAgg[0] || {};
  const r = repeat[0] || {};
  return {
    total: u.total || 0,
    customers: u.customers || 0,
    guests: u.guests || 0,
    registered: u.registered || 0,
    team: u.team || 0,
    withPhone: u.withPhone || 0,
    withEmail: u.withEmail || 0,
    orders: o.orders || 0,
    unattachedOrders: o.unattached || 0,
    lifetimeValue: o.lifetimeValue || 0,
    collected: o.collected || 0,
    buyers: r.buyers || 0,
    repeatBuyers: r.repeat || 0,
  };
}

export async function POST(request) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  const data = await request.json();
  const { name, email, password, role = ROLES.CUSTOMER, phone } = data;

  // A customer record is a CRM entry and needs only a way to reach the person;
  // an account that can SIGN IN needs an email and a password. Creating a
  // phone-only customer by hand is exactly what a shop taking orders over the
  // phone wants, so allow it.
  const wantsLogin = role !== ROLES.CUSTOMER || !!password;
  const normalizedPhone = normalizeBdPhone(phone || "");

  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  if (wantsLogin) {
    if (!email?.trim() || !password)
      return NextResponse.json({ error: "Email and password are required for a sign-in account" }, { status: 400 });
    if (password.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  } else if (!normalizedPhone && !email?.trim()) {
    return NextResponse.json({ error: "A phone number or an email is required" }, { status: 400 });
  }

  // Privilege-escalation guard: never let an actor create a user at or above
  // their own authority (only superadmins can mint admins/superadmins).
  if (!canManageRole(session.user.role, role))
    return NextResponse.json({ error: "You cannot assign that role" }, { status: 403 });

  const permissions = sanitizePermissions(data.permissions, session.user);

  await connectDB();

  const cleanEmail = email?.toLowerCase().trim() || "";
  if (cleanEmail) {
    const existing = await User.findOne({ email: cleanEmail });
    if (existing)
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }
  if (normalizedPhone) {
    const byPhone = await User.findOne({ phone: normalizedPhone }).select("name email").lean();
    if (byPhone)
      return NextResponse.json(
        { error: `${normalizedPhone} already belongs to ${byPhone.name}`, existingId: String(byPhone._id) },
        { status: 409 }
      );
  }

  const doc = {
    name: name.trim(),
    role,
    permissions,
    isGuest: !wantsLogin,
    guestSource: wantsLogin ? "" : "manual",
    emailVerified: wantsLogin,
  };
  if (cleanEmail) doc.email = cleanEmail;
  if (normalizedPhone) doc.phone = normalizedPhone;
  if (wantsLogin) doc.password = await bcrypt.hash(password, 12);

  const user = await User.create(doc);

  return NextResponse.json(
    {
      _id: String(user._id),
      name: user.name,
      email: user.email || null,
      role: user.role,
      permissions: user.permissions || [],
      phone: user.phone || null,
      isGuest: !!user.isGuest,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      orderCount: 0,
      totalSpent: 0,
      collected: 0,
      channels: [],
    },
    { status: 201 }
  );
}
