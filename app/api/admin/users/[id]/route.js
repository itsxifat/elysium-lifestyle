import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import Order from "@/models/Order";
import { normalizeBdPhone } from "@/lib/utils";
import {
  canManageRole,
  getEffectivePermissions,
  PERMISSIONS,
  ROLES,
} from "@/lib/permissions";

function sanitizePermissions(requested, actor) {
  if (!Array.isArray(requested)) return undefined;
  const actorPerms = getEffectivePermissions(actor);
  const valid = Object.keys(PERMISSIONS);
  return requested.filter((p) => valid.includes(p) && actorPerms.includes(p));
}

// One customer, with everything the shop knows about them: the full order
// history, what they are worth, which channels they buy through, and every
// delivery address they have used (COD buyers move around, and staff need the
// last one to hand).
export async function GET(request, { params }) {
  const { error } = await requireAdmin("customers.view");
  if (error) return error;

  await connectDB();

  const user = await User.findById(params.id).lean();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orders = await Order.find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("orderNumber totalAmount orderStatus paymentStatus paymentMethod source items shippingAddress createdAt")
    .lean();

  // Same COD vocabulary as /admin/analytics: invoiced vs actually collected.
  const stats = orders.reduce(
    (acc, o) => {
      acc.orderCount++;
      if (o.orderStatus === "cancelled") { acc.cancelledCount++; acc.cancelledValue += o.totalAmount || 0; }
      else if (o.orderStatus === "returned") acc.returnedCount++;
      else acc.totalSpent += o.totalAmount || 0;
      if (o.orderStatus === "partial_returned") acc.returnedCount++;
      if (o.orderStatus === "delivered") { acc.deliveredCount++; acc.collected += o.totalAmount || 0; }
      if (["pending", "processing", "shipped"].includes(o.orderStatus)) acc.inFlight += o.totalAmount || 0;
      acc.units += (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
      acc.channels[o.source || "website"] = (acc.channels[o.source || "website"] || 0) + 1;
      return acc;
    },
    {
      orderCount: 0, totalSpent: 0, collected: 0, inFlight: 0,
      deliveredCount: 0, cancelledCount: 0, returnedCount: 0, cancelledValue: 0, units: 0, channels: {},
    }
  );

  // Distinct delivery addresses, newest first — orders already come that way.
  const seenAddr = new Set();
  const addresses = [];
  for (const o of orders) {
    const a = o.shippingAddress;
    if (!a) continue;
    const key = [a.street, a.city, a.state, a.postalCode].map((v) => (v || "").trim().toLowerCase()).join("|");
    if (!key.replace(/\|/g, "") || seenAddr.has(key)) continue;
    seenAddr.add(key);
    addresses.push({
      name: a.name || "", phone: a.phone || "", street: a.street || "",
      city: a.city || "", state: a.state || "", postalCode: a.postalCode || "",
      country: a.country || "Bangladesh", lastUsedAt: o.createdAt,
    });
  }

  return NextResponse.json({
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email || null,
      image: user.image || null,
      role: user.role,
      permissions: user.permissions || [],
      phone: user.phone || null,
      isGuest: !!user.isGuest,
      guestSource: user.guestSource || "",
      emailVerified: !!user.emailVerified,
      address: user.address || {},
      createdAt: user.createdAt,
      hasPin: !!user.pinSetAt,
      pinLockedUntil: user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now() ? user.pinLockedUntil : null,
      ...stats,
      avgOrderValue: stats.orderCount ? Math.round(stats.totalSpent / Math.max(1, stats.orderCount - stats.cancelledCount)) : 0,
      firstOrderAt: orders.length ? orders[orders.length - 1].createdAt : null,
      lastOrderAt: orders.length ? orders[0].createdAt : null,
    },
    addresses,
    orders: orders.map((o) => ({
      _id: String(o._id),
      orderNumber: o.orderNumber,
      totalAmount: o.totalAmount,
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      source: o.source || "website",
      createdAt: o.createdAt,
      itemCount: o.items?.length || 0,
      units: (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0),
    })),
  });
}

export async function PUT(request, { params }) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  const data = await request.json();
  const { name, phone, email, role, emailVerified, address } = data;

  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await connectDB();

  const target = await User.findById(params.id).select("role isGuest email phone").lean();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Can't edit someone of equal/greater authority (e.g. an admin editing another
  // admin or a superadmin) unless you're a superadmin.
  if (!canManageRole(session.user.role, target.role))
    return NextResponse.json({ error: "You cannot modify this account" }, { status: 403 });

  const updateFields = { name: name.trim() };

  // Phone is an identity, not a free-text field: store it in the one canonical
  // form everything matches on, and never let two records claim the same number
  // — that is precisely how duplicate customers are born.
  if (phone !== undefined) {
    const p = normalizeBdPhone(phone || "");
    if (p && p !== target.phone) {
      const clash = await User.findOne({ _id: { $ne: params.id }, phone: p }).select("name").lean();
      if (clash)
        return NextResponse.json(
          { error: `${p} already belongs to ${clash.name}. Merge the two records instead.`, existingId: String(clash._id) },
          { status: 409 }
        );
    }
    updateFields.phone = p || null;
  }

  // An email may be added to a guest stub (it is how they will later claim the
  // account) but a real account's sign-in address is not editable from here.
  if (email !== undefined && target.isGuest) {
    const e = String(email || "").toLowerCase().trim();
    if (e && e !== target.email) {
      const clash = await User.findOne({ _id: { $ne: params.id }, email: e }).select("name").lean();
      if (clash)
        return NextResponse.json(
          { error: `${e} already belongs to ${clash.name}. Merge the two records instead.`, existingId: String(clash._id) },
          { status: 409 }
        );
    }
    if (e) updateFields.email = e;
    else updateFields.$unset = { email: "" }; // absent, not null — the index is sparse
  }

  if (emailVerified !== undefined) updateFields.emailVerified = emailVerified;
  if (address !== undefined) updateFields.address = address;

  // Role change: must be allowed to assign the *new* role too.
  if (role !== undefined && role !== target.role) {
    // Don't let anyone change their own role (prevents self-lockout / escalation).
    if (String(params.id) === String(session.user.id))
      return NextResponse.json({ error: "You can't change your own role" }, { status: 403 });
    if (!canManageRole(session.user.role, role))
      return NextResponse.json({ error: "You cannot assign that role" }, { status: 403 });
    // Promoting a guest stub into the team would hand panel access to a record
    // that has no password — make them a real account first.
    if (role !== ROLES.CUSTOMER && target.isGuest)
      return NextResponse.json(
        { error: "This is a guest record with no sign-in. Give it an email and password before assigning a staff role." },
        { status: 400 }
      );
    updateFields.role = role;
  }

  const cleanedPerms = sanitizePermissions(data.permissions, session.user);
  if (cleanedPerms !== undefined) updateFields.permissions = cleanedPerms;

  const { $unset, ...setFields } = updateFields;
  const update = { $set: setFields };
  if ($unset) update.$unset = $unset;

  let user;
  try {
    user = await User.findByIdAndUpdate(params.id, update, { new: true, lean: true });
  } catch (err) {
    if (err?.code === 11000)
      return NextResponse.json({ error: "Those contact details already belong to another record." }, { status: 409 });
    throw err;
  }
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: String(user._id),
    name: user.name,
    email: user.email || null,
    image: user.image || null,
    role: user.role,
    permissions: user.permissions || [],
    phone: user.phone || null,
    isGuest: !!user.isGuest,
    emailVerified: !!user.emailVerified,
    createdAt: user.createdAt,
  });
}

export async function DELETE(request, { params }) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  if (session.user.id === params.id)
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  await connectDB();

  const target = await User.findById(params.id).select("role name").lean();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Can't delete an account of equal/greater authority.
  if (!canManageRole(session.user.role, target.role))
    return NextResponse.json({ error: "You cannot delete this account" }, { status: 403 });

  // Deleting a buyer would strand their orders with `user: null` — re-creating,
  // one record at a time, exactly the hole the backfill just closed. Merging is
  // what people actually mean when a record looks redundant.
  const orderCount = await Order.countDocuments({ user: params.id });
  if (orderCount > 0) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("force") !== "true")
      return NextResponse.json(
        {
          error: `${target.name} has ${orderCount} order${orderCount === 1 ? "" : "s"}. Merge this record into the right customer instead of deleting it.`,
          orderCount,
        },
        { status: 409 }
      );
  }

  await User.findByIdAndDelete(params.id);
  return NextResponse.json({ success: true, ordersOrphaned: orderCount });
}
