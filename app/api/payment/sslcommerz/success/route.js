import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import { validateSSLCommerz } from "@/lib/sslcommerz";
import { trackPurchaseFromOrder } from "@/lib/tracking/server";
import { runFraudCheckForOrder } from "@/lib/fraud";
import { reportStockDelta, stockLinesForOrderItems } from "@/lib/ncom";
import { releaseStock, heldLines } from "@/lib/stock";

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
      // The order reserved its stock when it was created, so a failed payment
      // has to give it back — otherwise every abandoned card attempt quietly
      // burns inventory that nobody bought.
      const failed = await Order.findById(tran_id);
      if (failed) {
        if (failed.stockReserved) {
          await releaseStock(Product, heldLines(failed));
          failed.stockReserved = false;
        }
        failed.paymentStatus = "failed";
        failed.orderStatus = "cancelled";
        await failed.save();
      }
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

    // NO stock movement here. The units were reserved atomically when the order
    // was created (see lib/stock.js), so decrementing again on the callback took
    // the same sale out of inventory twice. The old query also filtered on
    // `variants.color`, a field the variant schema does not have — so for any
    // item carrying a colour it silently matched nothing and moved no stock at
    // all. Both bugs are gone with the reservation model.

    // Mirror to ncom.bd as a signed delta (fire-and-forget).
    stockLinesForOrderItems(Product, order.items, -1)
      .then((lines) => reportStockDelta(lines, { reason: "MANUAL", note: `Paid online — order ${order.orderNumber}` }))
      .catch(() => {});

    // Server-side Purchase. This callback comes from SSLCommerz (not the
    // customer's browser), so we don't pass the request — the customer's IP/UA
    // arrive via the deduped client Purchase fired on the confirmation page.
    trackPurchaseFromOrder(order).catch(() => {});

    // Store the courier fraud history on the order too (paid orders keep their
    // "processing" status — this is for the admin's visibility).
    runFraudCheckForOrder(order._id, order.shippingAddress?.phone).catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/order-confirmation/${order._id.toString()}`
    );
  } catch (error) {
    console.error("SSLCommerz success callback error:", error);
    return NextResponse.redirect(`${baseUrl}/checkout?error=payment_failed`);
  }
}
