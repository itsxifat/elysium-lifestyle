import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Discount from "@/models/Discount";
import { requireAdmin } from "@/lib/auth";

// Shared with the collection route's normalizer.
function sanitize(data) {
  const out = {
    title: (data.title || "").trim(),
    description: (data.description || "").trim(),
    method: data.method === "automatic" ? "automatic" : "code",
    type: data.type,
    value: Number(data.value) || 0,
    maxDiscount: Number(data.maxDiscount) || 0,
    buyQuantity: Number(data.buyQuantity) || 0,
    getQuantity: Number(data.getQuantity) || 0,
    getDiscountPercent: data.getDiscountPercent != null ? Number(data.getDiscountPercent) : 100,
    tiers: Array.isArray(data.tiers)
      ? data.tiers.map((t) => ({ minSubtotal: Number(t.minSubtotal) || 0, type: t.type === "fixed" ? "fixed" : "percentage", value: Number(t.value) || 0 }))
      : [],
    appliesTo: ["all", "products", "categories"].includes(data.appliesTo) ? data.appliesTo : "all",
    products: Array.isArray(data.products) ? data.products : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    minSubtotal: Number(data.minSubtotal) || 0,
    minQuantity: Number(data.minQuantity) || 0,
    firstOrderOnly: !!data.firstOrderOnly,
    usageLimit: Number(data.usageLimit) || 0,
    perCustomerLimit: Number(data.perCustomerLimit) || 0,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    allowStacking: !!data.allowStacking,
    priority: Number(data.priority) || 0,
    active: data.active !== false,
    code: data.method === "automatic" ? null : (data.code || "").toUpperCase().trim(),
  };
  return out;
}

export async function GET(_, { params }) {
  const { error } = await requireAdmin("discounts.manage");
  if (error) return error;
  await connectDB();
  const discount = await Discount.findById(params.id).lean();
  if (!discount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(discount);
}

export async function PUT(request, { params }) {
  const { error } = await requireAdmin("discounts.manage");
  if (error) return error;

  const data = await request.json();
  const doc = sanitize(data);
  if (!doc.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (doc.method === "code" && !doc.code) return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });

  await connectDB();
  if (doc.code) {
    const exists = await Discount.findOne({ code: doc.code, _id: { $ne: params.id } });
    if (exists) return NextResponse.json({ error: "That code already exists" }, { status: 409 });
  }

  // Don't reset usedCount on edit.
  delete doc.usedCount;
  const updated = await Discount.findByIdAndUpdate(params.id, { $set: doc }, { new: true, runValidators: true });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_, { params }) {
  const { error } = await requireAdmin("discounts.manage");
  if (error) return error;
  await connectDB();
  const deleted = await Discount.findByIdAndDelete(params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
