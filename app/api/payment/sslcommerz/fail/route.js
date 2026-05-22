import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";

export async function POST(request) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    await connectDB();
    const formData = await request.formData();
    const tran_id = formData.get("tran_id");

    if (tran_id) {
      await Order.findByIdAndUpdate(tran_id, {
        paymentStatus: "failed",
        orderStatus: "cancelled",
      });
    }

    return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`);
  }
}
