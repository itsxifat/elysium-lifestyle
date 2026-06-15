import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import "@/models/User";
import { sendOrderToCourier } from "@/lib/steadfast";

// Manually push an order to Steadfast (idempotent unless ?force=1).
export async function POST(request, { params }) {
  const { error } = await requireAdmin("orders.manage");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  const result = await sendOrderToCourier(params.id, { force });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await connectDB();
  const order = await Order.findById(params.id).populate("user", "name email").lean();
  return NextResponse.json(order);
}
