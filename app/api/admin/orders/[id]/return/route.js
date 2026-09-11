import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { requirePin } from "@/lib/pin";
import { notifyEvent } from "@/lib/notifications";
import { notifyNcom } from "@/lib/ncom-orders";
import { orderStatusLabel, returnTally } from "@/lib/order-status";

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Record a return / partial delivery. Staff pick which lines (and how many) came
// back; the order total is recomputed (discount scaled to kept items), the
// delivery charge is kept or waived per this return, and stock is restored.
//
// This route is also what sets the two return STATUSES, and it is the only
// thing that may: the split follows from the quantities it just wrote — every
// unit back is a full `returned`, some units back is `partial_returned` — so
// the status can never claim something the recorded lines do not support.
// An order the courier left in `return_requested` leaves here classified.
export async function POST(request, { params }) {
  const { error, session } = await requireAdmin("orders.manage");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    // Recording / editing a return is a critical action → require the PIN.
    const pinError = await requirePin(session, data.pin, request);
    if (pinError) return pinError;

    const lines = Array.isArray(data.items) ? data.items : [];
    const waived = !!data.deliveryChargeWaived;
    const restock = data.restock !== false;

    const order = await Order.findById(params.id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const returnedLines = [];
    for (const ln of lines) {
      const idx = ln.index;
      const qty = Math.max(0, parseInt(ln.returnQuantity, 10) || 0);
      const item = order.items[idx];
      if (!item || qty <= 0) continue;
      const alreadyReturned = item.returnedQuantity || 0;
      const addable = Math.min(qty, item.quantity - alreadyReturned);
      if (addable <= 0) continue;
      item.returnedQuantity = alreadyReturned + addable;
      returnedLines.push({ name: item.name, size: item.size, quantity: addable, price: item.price });
      if (restock && item.product) {
        await Product.updateOne(
          { _id: item.product, "variants.size": item.size },
          { $inc: { "variants.$.stock": addable } }
        );
      }
    }

    if (returnedLines.length === 0) {
      return NextResponse.json({ error: "Nothing to return" }, { status: 400 });
    }

    // Recompute totals. Subtotal is the original; kept = not-returned value.
    const origSubtotal = order.subtotal || 0;
    const keptSubtotal = order.items.reduce(
      (s, i) => s + (i.quantity - (i.returnedQuantity || 0)) * i.price, 0
    );
    const effectiveDiscount = origSubtotal > 0 ? round((order.discount || 0) * (keptSubtotal / origSubtotal)) : 0;
    const oldTotal = order.totalAmount;
    const newTotal = Math.max(0, round(keptSubtotal - effectiveDiscount + (waived ? 0 : (order.shippingFee || 0))));
    const refundThis = Math.max(0, round(oldTotal - newTotal));

    const actorName = session.user.name || session.user.email || "Staff";
    order.deliveryChargeWaived = waived;
    order.returnedAmount = round((order.returnedAmount || 0) + refundThis);
    order.totalAmount = newTotal;
    order.returns = order.returns || [];
    order.returns.push({
      at: new Date(),
      by: actorName,
      items: returnedLines,
      refundAmount: refundThis,
      deliveryChargeWaived: waived,
      note: (data.note || "").trim(),
    });

    const returnedUnits = returnedLines.reduce((s, l) => s + l.quantity, 0);

    // Classify the order from the totals now stored on its items — counting
    // every return ever recorded against it, not just this one, so a second
    // partial return that happens to take the last units lands on `returned`.
    const tally = returnTally(order.items);
    const prevStatus = order.orderStatus;
    const statusChanged = tally.status && tally.status !== prevStatus;
    if (statusChanged) order.orderStatus = tally.status;

    order.editHistory = order.editHistory || [];
    order.editHistory.push({
      at: new Date(),
      by: session.user.id,
      byName: actorName,
      action: "return",
      summary:
        `Recorded return of ${returnedUnits} unit${returnedUnits === 1 ? "" : "s"} (refund ৳${refundThis})${waived ? ", delivery waived" : ""}` +
        (statusChanged ? `; status ${prevStatus} → ${tally.status}` : ""),
      pinVerified: true,
    });

    await order.save();

    notifyEvent("order_returned", {
      severity: "warning",
      title: `${statusChanged ? orderStatusLabel(tally.status) : "Return"} — order ${order.orderNumber}`,
      body: `${actorName} recorded a return of ${returnedUnits} unit${returnedUnits === 1 ? "" : "s"} (refund ৳${refundThis}); ${tally.returned} of ${tally.ordered} units are now back.`,
      link: `/admin/orders/${order._id}`,
      order: order._id,
      actor: session.user.id,
      actorName,
    }).catch(() => {});

    // An ncom order is a shared record and a return changes the money on it, so
    // their copy follows — a FULL return is sent as a cancellation, because for
    // their order book a sale where everything came back is no sale, and for any
    // product they store it is stock that has to go back on their shelf.
    if (order.source === "ncom") {
      await notifyNcom(order, tally.status === "returned" ? "order.cancelled" : "order.updated", {
        reason: `Return recorded: ${returnedUnits} unit${returnedUnits === 1 ? "" : "s"} back (refund ৳${refundThis})`,
      }).catch(() => {});
    }

    const updated = await Order.findById(params.id).populate("user", "name email").lean();
    return NextResponse.json(updated);
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/return error:", err);
    return NextResponse.json({ error: "Failed to record return" }, { status: 500 });
  }
}
