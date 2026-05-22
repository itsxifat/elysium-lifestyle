import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import Order from "@/models/Order";

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await request.json();
  const { name, phone, role, emailVerified, address } = data;

  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await connectDB();

  const updateFields = { name: name.trim() };
  if (phone !== undefined) updateFields.phone = phone?.trim() || null;
  if (role !== undefined) updateFields.role = role;
  if (emailVerified !== undefined) updateFields.emailVerified = emailVerified;
  if (address !== undefined) updateFields.address = address;

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
    phone: user.phone || null,
    emailVerified: user.emailVerified || false,
    createdAt: user.createdAt,
  });
}

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.id === params.id)
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  await connectDB();

  const user = await User.findByIdAndDelete(params.id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
