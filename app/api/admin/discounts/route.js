export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Discount from "@/models/Discount";
import { requireAdmin } from "@/lib/auth";

// Normalize an incoming payload into the Discount schema shape.
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
  };
  // Code is required for coupon-type, ignored for automatic.
  if (out.method === "code") {
    out.code = (data.code || "").toUpperCase().trim();
  } else {
    out.code = undefined;
  }
  return out;
}

export async function GET() {
  const { error } = await requireAdmin("discounts.manage");
  if (error) return error;

  await connectDB();
  const discounts = await Discount.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ discounts });
}

export async function POST(request) {
  const { error } = await requireAdmin("discounts.manage");
  if (error) return error;

  const data = await request.json();
  const doc = sanitize(data);

  if (!doc.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (doc.method === "code" && !doc.code) return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });

  await connectDB();
  if (doc.code) {
    const exists = await Discount.findOne({ code: doc.code });
    if (exists) return NextResponse.json({ error: "That code already exists" }, { status: 409 });
  }

  try {
    const created = await Discount.create(doc);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to create discount" }, { status: 400 });
  }
}
