import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import { validateSSLCommerz } from "@/lib/sslcommerz";

export async function POST(request) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    await connectDB();
    const formData = await request.formData();

    const val_id = formData.get("val_id");
    const tran_id = formData.get("tran_id");
    const status = formData.get("status");

    if (!val_id || !tran_id) {
      return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`);
    }

    const settings = await Settings.findOne({}).lean();
    const sslConfig = settings?.paymentGateways?.sslcommerz;

    if (!sslConfig?.storeId || !sslConfig?.storePassword) {
      return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`);
    }

    // Validate IPN
    const validation = await validateSSLCommerz(
      val_id,
      sslConfig.storeId,
      sslConfig.storePassword,
      sslConfig.isLive || false
    );

    if (
      validation?.status !== "VALID" &&
      validation?.status !== "VALIDATED"
    ) {
      await Order.findByIdAndUpdate(tran_id, {
        paymentStatus: "failed",
        orderStatus: "cancelled",
      });
      return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`);
    }

    const order = await Order.findByIdAndUpdate(
      tran_id,
      {
        paymentStatus: "paid",
        orderStatus: "processing",
        transactionId: tran_id,
        valId: val_id,
      },
      { new: true }
    ).lean();

    if (!order) {
      return NextResponse.redirect(`${baseUrl}/checkout?error=order_not_found`);
    }

    // Decrement stock after successful payment
    for (const item of order.items) {
      await Product.updateOne(
        {
          _id: item.product,
          "variants.size": item.size,
          "variants.color": item.color,
        },
        { $inc: { "variants.$.stock": -item.quantity } }
      );
    }

    return NextResponse.redirect(
      `${baseUrl}/order-confirmation/${order._id.toString()}`
    );
  } catch (error) {
    console.error("SSLCommerz success callback error:", error);
    return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`);
  }
}
