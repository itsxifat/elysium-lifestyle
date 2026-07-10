import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
// Registered so `.populate("user" | "items.product")` always resolves their
// schemas — without these imports a dev hot-reload can drop the registration
// and populate throws MissingSchemaError.
import "@/models/User";
import "@/models/Product";
import { sendEmail, orderStatusTemplate } from "@/lib/email";
import { isStaff, isElevated } from "@/lib/permissions";
import { maybeAutoSendToCourier } from "@/lib/steadfast";
import { requirePin } from "@/lib/pin";
import { applyCodAutoPaid } from "@/lib/orders";
import { notifyEvent } from "@/lib/notifications";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    const order = await Order.findById(params.id)
      .populate("user", "name email")
      .populate("items.product", "variants")
      .lean();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // SKU isn't stored on the order item — resolve it from the product variant
    // (matched by size), then flatten product back to its id.
    for (const item of order.items || []) {
      const variant = item.product?.variants?.find((v) => v.size === item.size);
      item.sku = variant?.sku || null;
      item.product = item.product?._id || item.product || null;
    }

    const isAdmin = isStaff(session?.user?.role);
    const isOwner = session?.user?.id && order.user?._id?.toString() === session.user.id;
    const isGuest = !order.user;

    if (!isAdmin && !isOwner && !isGuest) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // Campaign attribution and the staff audit trail are internal. A customer
    // must see a landing-page order as a perfectly ordinary order.
    if (!isAdmin) {
      delete order.landingPage;
      delete order.editHistory;
      delete order.fraudCheck;
    }

    return NextResponse.json(order);
  } catch (err) {
    console.error("GET /api/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { error, session } = await requireAdmin("orders.manage");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    const order = await Order.findById(params.id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const prevStatus = order.orderStatus;
    const prevPaymentStatus = order.paymentStatus;

    const nextStatus = typeof data.orderStatus === "string" ? data.orderStatus : prevStatus;
    const nextPaymentStatus = typeof data.paymentStatus === "string" ? data.paymentStatus : prevPaymentStatus;
    const statusChanged = nextStatus !== prevStatus;
    const paymentStatusChanged = nextPaymentStatus !== prevPaymentStatus;

    // ── Critical actions require the security PIN ────────────────────────────
    // Moving an order to delivered/cancelled, or touching the payment status, is
    // financially significant — gate it behind the member's 6-digit PIN.
    const needsPin =
      (statusChanged && (nextStatus === "delivered" || nextStatus === "cancelled")) ||
      paymentStatusChanged;
    if (needsPin) {
      const pinError = await requirePin(session, data.pin, request);
      if (pinError) return pinError;
    }

    // Apply the allowed field changes.
    if (data.orderStatus !== undefined) order.orderStatus = data.orderStatus;
    if (data.paymentStatus !== undefined) order.paymentStatus = data.paymentStatus;
    if (data.notes !== undefined) order.notes = data.notes;

    // COD auto-paid: collecting cash at delivery means the order is now paid.
    const autoPaid = applyCodAutoPaid(order);

    // Record who did what (audit trail).
    const actorName = session.user.name || session.user.email || "Staff";
    const parts = [];
    if (statusChanged) parts.push(`status ${prevStatus} → ${nextStatus}`);
    if (order.paymentStatus !== prevPaymentStatus)
      parts.push(`payment ${prevPaymentStatus} → ${order.paymentStatus}${autoPaid ? " (auto, COD delivered)" : ""}`);
    if (parts.length) {
      order.editHistory = order.editHistory || [];
      order.editHistory.push({
        at: new Date(),
        by: session.user.id,
        byName: actorName,
        action: statusChanged ? "status_change" : "payment_update",
        summary: parts.join("; "),
        pinVerified: needsPin,
      });
    }

    await order.save();

    // Entering "processing" → auto-create the Steadfast consignment (idempotent;
    // skips if it already has one or auto-send is off).
    if (statusChanged && nextStatus === "processing" && !order.courier?.consignmentId) {
      maybeAutoSendToCourier(order._id).catch(() => {});
    }

    const populated = await Order.findById(params.id).populate("user", "name email").lean();

    // Send status update email
    if (statusChanged && ["processing", "shipped", "delivered", "cancelled"].includes(nextStatus)) {
      const toEmail = populated.user?.email || populated.guestEmail;
      if (toEmail) {
        sendEmail({
          to: toEmail,
          subject: `Order Update — ${populated.orderNumber}`,
          html: orderStatusTemplate(populated),
        }).catch(console.error);
      }
    }

    // ── Notify subscribed roles ────────────────────────────────────────────────
    const link = `/admin/orders/${order._id}`;
    if (statusChanged && nextStatus === "cancelled") {
      notifyEvent("order_cancelled", {
        severity: "warning",
        title: `Order ${order.orderNumber} cancelled`,
        body: `Cancelled by ${actorName}.`,
        link, order: order._id, actor: session.user.id, actorName,
      }).catch(() => {});
    } else if (!isElevated(session.user.role) && parts.length) {
      // A moderator/staff member acted — notify the subscribed roles.
      notifyEvent(statusChanged ? "order_status" : "order_payment", {
        severity: "info",
        title: `Order ${order.orderNumber} updated`,
        body: `${actorName}: ${parts.join("; ")}.`,
        link, order: order._id, actor: session.user.id, actorName,
      }).catch(() => {});
    }

    return NextResponse.json(populated);
  } catch {
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}
