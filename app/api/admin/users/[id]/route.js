import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import Order from "@/models/Order";
import {
  canManageRole,
  getEffectivePermissions,
  PERMISSIONS,
} from "@/lib/permissions";

function sanitizePermissions(requested, actor) {
  if (!Array.isArray(requested)) return undefined;
  const actorPerms = getEffectivePermissions(actor);
  const valid = Object.keys(PERMISSIONS);
  return requested.filter((p) => valid.includes(p) && actorPerms.includes(p));
}

export async function GET(request, { params }) {
  const { error } = await requireAdmin("users.manage");
  if (error) return error;

  await connectDB();

  const user = await User.findById(params.id).lean();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orders = await Order.find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const totalSpent = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  return NextResponse.json({
    user: {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image || null,
      role: user.role,
      permissions: user.permissions || [],
      phone: user.phone || null,
      emailVerified: user.emailVerified || false,
      address: user.address || {},
      createdAt: user.createdAt,
      orderCount: orders.length,
      totalSpent,
    },
    orders: orders.map((o) => ({
      _id: o._id.toString(),
      orderNumber: o.orderNumber,
      totalAmount: o.totalAmount,
      orderStatus: o.orderStatus,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
      itemCount: o.items?.length || 0,
    })),
  });
}

export async function PUT(request, { params }) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  const data = await request.json();
  const { name, phone, role, emailVerified, address } = data;

  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await connectDB();

  const target = await User.findById(params.id).select("role").lean();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Can't edit someone of equal/greater authority (e.g. an admin editing another
  // admin or a superadmin) unless you're a superadmin.
  if (!canManageRole(session.user.role, target.role))
    return NextResponse.json({ error: "You cannot modify this account" }, { status: 403 });

  const updateFields = { name: name.trim() };
  if (phone !== undefined) updateFields.phone = phone?.trim() || null;
  if (emailVerified !== undefined) updateFields.emailVerified = emailVerified;
  if (address !== undefined) updateFields.address = address;

  // Role change: must be allowed to assign the *new* role too.
  if (role !== undefined && role !== target.role) {
    // Don't let anyone change their own role (prevents self-lockout / escalation).
    if (String(params.id) === String(session.user.id))
      return NextResponse.json({ error: "You can't change your own role" }, { status: 403 });
    if (!canManageRole(session.user.role, role))
      return NextResponse.json({ error: "You cannot assign that role" }, { status: 403 });
    updateFields.role = role;
  }

  const cleanedPerms = sanitizePermissions(data.permissions, session.user);
  if (cleanedPerms !== undefined) updateFields.permissions = cleanedPerms;

  const user = await User.findByIdAndUpdate(
    params.id,
    { $set: updateFields },
    { new: true, lean: true }
  );
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    image: user.image || null,
    role: user.role,
    permissions: user.permissions || [],
    phone: user.phone || null,
    emailVerified: user.emailVerified || false,
    createdAt: user.createdAt,
  });
}

export async function DELETE(request, { params }) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  if (session.user.id === params.id)
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  await connectDB();

  const target = await User.findById(params.id).select("role").lean();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Can't delete an account of equal/greater authority.
  if (!canManageRole(session.user.role, target.role))
    return NextResponse.json({ error: "You cannot delete this account" }, { status: 403 });

  await User.findByIdAndDelete(params.id);
  return NextResponse.json({ success: true });
}
