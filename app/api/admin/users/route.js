import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import Order from "@/models/Order";
import bcrypt from "bcryptjs";
import { escapeRegExp } from "@/lib/utils";
import {
  canManageRole,
  getEffectivePermissions,
  PERMISSIONS,
  ROLES,
} from "@/lib/permissions";

// Keep only valid permission keys the actor is actually allowed to grant.
function sanitizePermissions(requested, actor) {
  if (!Array.isArray(requested)) return [];
  const actorPerms = getEffectivePermissions(actor);
  const valid = Object.keys(PERMISSIONS);
  return requested.filter((p) => valid.includes(p) && actorPerms.includes(p));
}

export async function GET(request) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const role = searchParams.get("role") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

  await connectDB();

  const filter = {};
  const safeQ = escapeRegExp(q);
  if (safeQ) {
    filter.$or = [
      { name: { $regex: safeQ, $options: "i" } },
      { email: { $regex: safeQ, $options: "i" } },
      { phone: { $regex: safeQ, $options: "i" } },
    ];
  }
  if (role) filter.role = role;

  const [users, total, statsArr] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          admins: { $sum: { $cond: [{ $in: ["$role", ["admin", "superadmin"]] }, 1, 0] } },
          staff: { $sum: { $cond: [{ $ne: ["$role", "customer"] }, 1, 0] } },
          customers: { $sum: { $cond: [{ $eq: ["$role", "customer"] }, 1, 0] } },
          verified: { $sum: { $cond: ["$emailVerified", 1, 0] } },
        },
      },
    ]),
  ]);

  const userIds = users.map((u) => u._id);
  const orderAgg = await Order.aggregate([
    { $match: { user: { $in: userIds } } },
    { $group: { _id: "$user", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
  ]);
  const orderMap = Object.fromEntries(orderAgg.map((o) => [o._id.toString(), o]));

  const result = users.map((u) => ({
    _id: u._id.toString(),
    name: u.name,
    email: u.email,
    image: u.image || null,
    role: u.role,
    permissions: u.permissions || [],
    phone: u.phone || null,
    emailVerified: u.emailVerified || false,
    createdAt: u.createdAt,
    orderCount: orderMap[u._id.toString()]?.count || 0,
    totalSpent: orderMap[u._id.toString()]?.total || 0,
  }));

  return NextResponse.json({
    users: result,
    total,
    page,
    pages: Math.ceil(total / limit),
    stats: statsArr[0] || { total: 0, admins: 0, staff: 0, customers: 0, verified: 0 },
  });
}

export async function POST(request) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  const data = await request.json();
  const { name, email, password, role = ROLES.CUSTOMER, phone } = data;

  if (!name?.trim() || !email?.trim() || !password)
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });

  if (password.length < 6)
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  // Privilege-escalation guard: never let an actor create a user at or above
  // their own authority (only superadmins can mint admins/superadmins).
  if (!canManageRole(session.user.role, role))
    return NextResponse.json({ error: "You cannot assign that role" }, { status: 403 });

  const permissions = sanitizePermissions(data.permissions, session.user);

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing)
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hashed,
    role,
    permissions,
    phone: phone?.trim() || undefined,
    emailVerified: true,
  });

  return NextResponse.json(
    {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      phone: user.phone || null,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      orderCount: 0,
      totalSpent: 0,
    },
    { status: 201 }
  );
}
