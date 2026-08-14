import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { requirePin } from "@/lib/pin";
import { notifyEvent } from "@/lib/notifications";
import { reportStockDelta, stockLinesForOrderItems } from "@/lib/ncom";

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Record a return / partial delivery. Staff pick which lines (and how many) came
// back; the order total is recomputed (discount scaled to kept items), the
// delivery charge is kept or waived per this return, and stock is restored.
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
    const restockedLines = []; // {product, size, quantity} — mirrored to ncom below
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
        restockedLines.push({ product: item.product, size: item.size, quantity: addable });
      }
    }

    if (returnedLines.length === 0) {
      return NextResponse.json({ error: "Nothing to return" }, { status: 400 });
    }

    // Mirror the restock to ncom.bd as a positive delta (fire-and-forget).
    if (restockedLines.length) {
      stockLinesForOrderItems(Product, restockedLines, 1)
        .then((l) => reportStockDelta(l, { reason: "RECEIVED", note: `Return on order ${order.orderNumber}` }))
        .catch(() => {});
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
    order.editHistory = order.editHistory || [];
    order.editHistory.push({
      at: new Date(),
      by: session.user.id,
      byName: actorName,
      action: "return",
      summary: `Recorded return of ${returnedUnits} unit${returnedUnits === 1 ? "" : "s"} (refund ৳${refundThis})${waived ? ", delivery waived" : ""}`,
      pinVerified: true,
    });

    await order.save();

    notifyEvent("order_returned", {
      severity: "warning",
      title: `Return on order ${order.orderNumber}`,
      body: `${actorName} recorded a return of ${returnedUnits} unit${returnedUnits === 1 ? "" : "s"} (refund ৳${refundThis}).`,
      link: `/admin/orders/${order._id}`,
      order: order._id,
      actor: session.user.id,
      actorName,
    }).catch(() => {});

    const updated = await Order.findById(params.id).populate("user", "name email").lean();
    return NextResponse.json(updated);
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/return error:", err);
    return NextResponse.json({ error: "Failed to record return" }, { status: 500 });
  }
}
