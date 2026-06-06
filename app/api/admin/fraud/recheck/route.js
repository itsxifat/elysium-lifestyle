export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import { runFraudCheckForOrder } from "@/lib/fraud";

// Re-run the courier check for a specific order (admin "Recheck" button).
export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { orderId } = await request.json().catch(() => ({}));
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  await connectDB();
  const order = await Order.findById(orderId).select("shippingAddress").lean();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  await runFraudCheckForOrder(orderId, order.shippingAddress?.phone); // await so we return fresh data
  const updated = await Order.findById(orderId).select("fraudCheck orderStatus").lean();
  return NextResponse.json(updated);
}
