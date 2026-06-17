import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import "@/models/User";
import { requirePin } from "@/lib/pin";
import { isElevated } from "@/lib/permissions";
import { notifyAdmins } from "@/lib/notifications";
import { normalizeBdPhone } from "@/lib/utils";

const PAYMENT_METHODS = ["sslcommerz", "cod", "bkash", "nagad", "bank", "cash"];
const SOURCES = ["website", "facebook", "instagram", "whatsapp", "phone", "offline", "other"];
const ZONES = ["inside_dhaka", "suburbs", "outside_dhaka"];

// Full order edit (items, address, fees, payment method, etc.). Distinct from the
// status/payment-status flip in /api/orders/[id]. Requires the orders.edit
// permission AND the member's 6-digit PIN, adjusts product stock for any item
// changes, recomputes totals, and records who edited it.
export async function PATCH(request, { params }) {
  const { error, session } = await requireAdmin("orders.edit");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    // PIN first — never mutate before the second factor checks out.
    const pinError = await requirePin(session, data.pin, request);
    if (pinError) return pinError;

    const order = await Order.findById(params.id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const changes = [];

    // ── Items (optional) ─────────────────────────────────────────────────────
    let newItems = null;
    if (Array.isArray(data.items)) {
      if (data.items.length === 0)
        return NextResponse.json({ error: "An order needs at least one item" }, { status: 400 });

      const productIds = data.items.map((i) => i.productId).filter(Boolean);
      const products = await Product.find({ _id: { $in: productIds } }).lean();
      const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

      newItems = [];
      for (const item of data.items) {
        const product = productMap[item.productId];
        if (!product) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 400 });
        const variant = product.variants?.find((v) => v.size === item.size);
        if (!variant) return NextResponse.json({ error: `Size "${item.size}" not found for ${product.name}` }, { status: 400 });
        const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
        newItems.push({
          product: product._id,
          name: product.name,
          image: product.images?.[0] || "",
          sku: variant.sku || "",
          size: item.size,
          color: item.color || undefined,
          price: variant.price,
          quantity,
        });
      }

      // Stock diff: net change per (product, size). Taking more reduces stock;
      // removing/reducing restores it.
      const tally = (items, keyFn) =>
        items.reduce((m, it) => {
          if (!it.product) return m;
          const k = `${String(it.product)}|${it.size}`;
          m[k] = (m[k] || 0) + (keyFn ? keyFn(it) : it.quantity);
          return m;
        }, {});
      const oldQty = tally(order.items);
      const newQty = tally(newItems);
      for (const k of new Set([...Object.keys(oldQty), ...Object.keys(newQty)])) {
        const delta = (newQty[k] || 0) - (oldQty[k] || 0);
        if (delta === 0) continue;
        const [productId, size] = k.split("|");
        await Product.updateOne(
          { _id: productId, "variants.size": size },
          { $inc: { "variants.$.stock": -delta } }
        );
      }

      const oldCount = order.items.reduce((s, i) => s + i.quantity, 0);
      const newCount = newItems.reduce((s, i) => s + i.quantity, 0);
      if (oldCount !== newCount || order.items.length !== newItems.length)
        changes.push(`items (${oldCount} → ${newCount} units)`);
      order.items = newItems;
    }

    // ── Shipping address (merge provided fields) ─────────────────────────────
    if (data.shippingAddress && typeof data.shippingAddress === "object") {
      const a = data.shippingAddress;
      const cur = order.shippingAddress || {};
      const merged = {
        name: a.name?.trim() || cur.name,
        phone: a.phone?.trim() ? normalizeBdPhone(a.phone) : cur.phone,
        email: a.email !== undefined ? a.email?.trim() || undefined : cur.email,
        street: a.street?.trim() || cur.street,
        city: a.city?.trim() || cur.city,
        state: a.state !== undefined ? a.state?.trim() || undefined : cur.state,
        postalCode: a.postalCode !== undefined ? a.postalCode?.trim() || undefined : cur.postalCode,
        country: cur.country || "Bangladesh",
      };
      if (!merged.name || !merged.phone || !merged.street || !merged.city)
        return NextResponse.json({ error: "Name, phone, street and city are required" }, { status: 400 });
      const addrChanged = ["name", "phone", "email", "street", "city", "state", "postalCode"].some(
        (f) => (merged[f] || "") !== (cur[f] || "")
      );
      order.shippingAddress = merged;
      if (addrChanged) changes.push("shipping address");
    }

    // ── Money + meta ─────────────────────────────────────────────────────────
    if (data.shippingFee !== undefined) {
      const fee = Math.max(0, Number(data.shippingFee) || 0);
      if (fee !== order.shippingFee) changes.push(`shipping ৳${order.shippingFee} → ৳${fee}`);
      order.shippingFee = fee;
    }
    if (data.discount !== undefined) {
      const d = Math.max(0, Number(data.discount) || 0);
      if (d !== order.discount) changes.push(`discount ৳${order.discount} → ৳${d}`);
      order.discount = d;
    }
    if (typeof data.shippingZone === "string" && ZONES.includes(data.shippingZone)) {
      order.shippingZone = data.shippingZone;
    }
    if (typeof data.source === "string" && SOURCES.includes(data.source)) {
      order.source = data.source;
    }
    if (data.notes !== undefined) order.notes = data.notes?.trim() || undefined;

    let paymentMethodChanged = false;
    if (typeof data.paymentMethod === "string" && PAYMENT_METHODS.includes(data.paymentMethod)) {
      if (data.paymentMethod !== order.paymentMethod) {
        changes.push(`payment method ${order.paymentMethod} → ${data.paymentMethod}`);
        paymentMethodChanged = true;
      }
      order.paymentMethod = data.paymentMethod;
    }

    // Recompute totals from the (possibly new) items + fees.
    order.subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    order.totalAmount = Math.max(0, order.subtotal + (order.shippingFee || 0) - (order.discount || 0));

    if (changes.length === 0)
      return NextResponse.json({ error: "No changes to save" }, { status: 400 });

    const actorName = session.user.name || session.user.email || "Staff";
    order.editHistory = order.editHistory || [];
    order.editHistory.push({
      at: new Date(),
      by: session.user.id,
      byName: actorName,
      action: paymentMethodChanged ? "payment_change" : "edit",
      summary: changes.join("; "),
      pinVerified: true,
    });

    await order.save();

    const populated = await Order.findById(params.id).populate("user", "name email").lean();

    // Notify admins on edits by staff/moderators, and always on a payment-method
    // change (it's a fraud-sensitive action).
    const link = `/admin/orders/${order._id}`;
    if (paymentMethodChanged || !isElevated(session.user.role)) {
      notifyAdmins({
        type: paymentMethodChanged ? "payment_change" : "order_edit",
        severity: paymentMethodChanged ? "warning" : "info",
        title: `Order ${order.orderNumber} edited`,
        body: `${actorName}: ${changes.join("; ")}.`,
        link, order: order._id, actor: session.user.id, actorName,
      }).catch(() => {});
    }

    return NextResponse.json(populated);
  } catch (err) {
    console.error("PATCH /api/admin/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to edit order" }, { status: 500 });
  }
}
