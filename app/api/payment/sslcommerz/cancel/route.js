import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { releaseIfHeld } from "@/lib/stock";

export async function POST(request) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    await connectDB();
    const formData = await request.formData();
    const tran_id = formData.get("tran_id");

    if (tran_id) {
      // These two callbacks carry no val_id, so unlike /success there is nothing
      // to verify with the gateway — the endpoint is effectively public and the
      // tran_id is just an order id. Treat it as an untrusted hint: only an
      // order still sitting unpaid at the gateway may be touched. Without this
      // filter anyone could POST an id and cancel a stranger's order (and, now
      // that cancelling releases stock, quietly empty the shelves).
      const order = await Order.findOne({
        _id: tran_id,
        paymentMethod: "sslcommerz",
        paymentStatus: "pending",
        orderStatus: "pending",
      });
      if (order) {
        // A customer backing out of the gateway hands their reserved units
        // straight back to the next shopper.
        await releaseIfHeld(Product, order);
        order.orderStatus = "cancelled";
        await order.save();
      }
    }

    return NextResponse.redirect(`${baseUrl}/cart`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/cart`);
  }
}
