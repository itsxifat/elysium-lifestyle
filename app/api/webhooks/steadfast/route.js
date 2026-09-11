export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import "@/models/User";
import { getSteadfastConfig } from "@/lib/steadfast";
import { applyCourierStatus } from "@/lib/courier-sync";

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
    // One shared rule for "the courier says the parcel is here now", whether
    // they pushed it to us or the admin panel's sync pulled it (lib/courier-sync).
    // It saves the order, hands back stock on a cancellation, marks COD paid on
    // delivery, records the audit entry, mails the customer and notifies staff.
    await applyCourierStatus(order, body.status, {
      deliveryCharge: body.delivery_charge,
      trackingMessage: body.tracking_message,
      actorName: "Steadfast webhook",
    });

    return NextResponse.json({ status: "success", message: "Webhook received successfully." });
  }

  // Unknown notification type — acknowledge so Steadfast doesn't retry forever.
  await order.save();
  return NextResponse.json({ status: "success", message: "Ignored." });
}
