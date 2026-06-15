export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import "@/models/User";
import { getSteadfastConfig, mapSteadfastStatus } from "@/lib/steadfast";
import { sendEmail, orderStatusTemplate } from "@/lib/email";

// Steadfast Courier webhook. They POST delivery-status + tracking updates here.
// Auth: header `Authorization: Bearer <token>` where token = our configured
// webhookToken (falls back to apiKey). Configure this URL in the Steadfast portal:
//   https://<your-domain>/api/webhooks/steadfast

function unauthorized() {
  return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
}

export async function POST(request) {
  const cfg = await getSteadfastConfig();
  const expected = (cfg.webhookToken || cfg.apiKey || "").trim();

  // Fail closed: without a configured token we cannot authenticate the caller,
  // so we refuse rather than let anyone mutate order status by invoice number.
  if (!expected) return unauthorized();

  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== expected) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  const { notification_type, consignment_id, invoice } = body || {};

  await connectDB();

  // Locate the order by our invoice (orderNumber) first, then consignment id.
  let order = null;
  if (invoice) order = await Order.findOne({ orderNumber: invoice });
  if (!order && consignment_id) order = await Order.findOne({ "courier.consignmentId": consignment_id });
  if (!order) {
    return NextResponse.json({ status: "error", message: "Order not found" }, { status: 200 });
  }

  if (!order.courier) order.courier = {};
  order.courier.lastWebhookAt = new Date();
  if (consignment_id && !order.courier.consignmentId) order.courier.consignmentId = consignment_id;

  if (notification_type === "tracking_update") {
    const msg = body.tracking_message || "";
    if (msg) {
      order.courier.trackingMessages = order.courier.trackingMessages || [];
      order.courier.trackingMessages.push({ message: msg, at: new Date() });
    }
    await order.save();
    return NextResponse.json({ status: "success", message: "Webhook received successfully." });
  }

  if (notification_type === "delivery_status") {
    const rawStatus = String(body.status || "").toLowerCase();
    order.courier.status = rawStatus;
    if (body.delivery_charge != null) order.courier.deliveryCharge = Number(body.delivery_charge) || 0;
    if (body.tracking_message) {
      order.courier.trackingMessages = order.courier.trackingMessages || [];
      order.courier.trackingMessages.push({ message: body.tracking_message, at: new Date() });
    }

    const mapped = mapSteadfastStatus(rawStatus);
    let statusChanged = false;
    // Never override a manual "cancelled"; otherwise apply the mapped status.
    if (mapped && order.orderStatus !== mapped && order.orderStatus !== "cancelled") {
      order.orderStatus = mapped;
      statusChanged = true;
    }

    await order.save();

    if (statusChanged) {
      const toEmail = order.guestEmail || order.shippingAddress?.email;
      if (toEmail) {
        sendEmail({
          to: toEmail,
          subject: `Order Update — ${order.orderNumber}`,
          html: orderStatusTemplate(order.toObject()),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ status: "success", message: "Webhook received successfully." });
  }

  // Unknown notification type — acknowledge so Steadfast doesn't retry forever.
  await order.save();
  return NextResponse.json({ status: "success", message: "Ignored." });
}
