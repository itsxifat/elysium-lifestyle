import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import { sendEmail, orderConfirmationTemplate } from "@/lib/email";
import { runFraudCheckForOrder } from "@/lib/fraud";
import { maybeAutoSendToCourier } from "@/lib/steadfast";
import { notifyEvent } from "@/lib/notifications";
import { normalizeBdPhone } from "@/lib/utils";
import { findOrCreateCustomer } from "@/lib/customer-link";
import { reportStockDelta, stockLinesForOrderItems } from "@/lib/ncom";
import { reserveStock, releaseStock } from "@/lib/stock";

const SOURCES = ["facebook", "instagram", "whatsapp", "phone", "offline", "other"];
const PAYMENT_METHODS = ["cod", "bkash", "nagad", "bank", "cash"];
const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

// Create a manual / POS order from the admin panel (offline sale, Facebook,
// Instagram, etc.). Records the sales channel and which staff member made it.
export async function POST(request) {
  const { error, session } = await requireAdmin("orders.create");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    // ── Validate the basics ──────────────────────────────────────────────────
    if (!Array.isArray(data.items) || data.items.length === 0)
      return NextResponse.json({ error: "Add at least one product" }, { status: 400 });

    const c = data.customer || {};
    if (!c.name?.trim() || !c.phone?.trim())
      return NextResponse.json({ error: "Customer name and phone are required" }, { status: 400 });
    if (!c.street?.trim() || !c.city?.trim())
      return NextResponse.json({ error: "Customer address (street & city) is required" }, { status: 400 });

    const source = SOURCES.includes(data.source) ? data.source : "offline";
    const paymentMethod = PAYMENT_METHODS.includes(data.paymentMethod) ? data.paymentMethod : "cod";
    const orderStatus = ORDER_STATUSES.includes(data.orderStatus) ? data.orderStatus : "processing";

    // ── Resolve products → priced order items ────────────────────────────────
    const productIds = data.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

    const orderItems = [];
    for (const item of data.items) {
      const product = productMap[item.productId];
      if (!product) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 400 });

      const variant = product.variants?.find((v) => v.size === item.size);
      if (!variant) return NextResponse.json({ error: `Size "${item.size}" not found for ${product.name}` }, { status: 400 });

      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images?.[0] || "",
        sku: variant.sku || "",
        size: item.size,
        price: variant.price,
        quantity,
      });
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // ── Shipping: auto from zone (reusing the storefront rules) unless the staff
    //    member typed an explicit override. ─────────────────────────────────────
    const settings = await Settings.findOne({}).lean();
    const s = settings?.shipping || {};
    const zone = ["inside_dhaka", "suburbs", "outside_dhaka"].includes(data.shippingZone)
      ? data.shippingZone
      : "inside_dhaka";

    let shippingFee;
    if (data.shippingFee !== undefined && data.shippingFee !== null && data.shippingFee !== "") {
      shippingFee = Math.max(0, Number(data.shippingFee) || 0);
    } else if (s.freeShippingEnabled) {
      shippingFee = 0;
    } else {
      const freeThreshold = s.freeShippingThreshold ?? settings?.siteInfo?.freeShippingThreshold ?? 1500;
      if (subtotal >= freeThreshold) shippingFee = 0;
      else if (zone === "outside_dhaka") shippingFee = s.outsideDhaka ?? 130;
      else if (zone === "suburbs") shippingFee = s.suburbs ?? 100;
      else shippingFee = s.insideDhaka ?? 60;
    }

    const discount = Math.max(0, Number(data.discount) || 0);
    const totalAmount = Math.max(0, subtotal + shippingFee - discount);
    const paymentStatus = data.markPaid ? "paid" : "pending";

    // Attach the sale to a customer record (matched on phone/email, guest stub
    // on a miss) so walk-in and social-channel buyers build the same history as
    // storefront ones. Never blocks the sale — see /api/orders for the rationale.
    let customerId = null;
    try {
      const { user } = await findOrCreateCustomer({
        name: c.name,
        phone: c.phone,
        email: c.email,
        source,
      });
      customerId = user._id;
    } catch (e) {
      console.error("customer link error:", e.message);
    }

    // Take the stock before the order exists, atomically — a counter sale and a
    // website sale race for the same unit exactly like two website sales do.
    // Staff get the same refusal a customer would, naming the size that ran out.
    const reservation = await reserveStock(Product, orderItems);
    if (!reservation.ok) {
      const first = reservation.unavailable[0];
      return NextResponse.json(
        {
          error:
            first.available > 0
              ? `Only ${first.available} left of ${first.name} (${first.size}).`
              : `${first.name} (${first.size}) is out of stock.`,
          unavailable: reservation.unavailable,
        },
        { status: 409 }
      );
    }

    let order;
    try {
      order = await Order.create({
      user: customerId,
      guestEmail: c.email?.trim() || undefined,
      items: orderItems,
      shippingAddress: {
        name: c.name.trim(),
        phone: normalizeBdPhone(c.phone),
        email: c.email?.trim() || undefined,
        street: c.street.trim(),
        city: c.city.trim(),
        state: c.state?.trim() || undefined,
      },
      source,
      createdBy: session.user.id,
      createdByName: session.user.name || session.user.email || "Staff",
      shippingZone: zone,
      paymentMethod,
      paymentStatus,
      orderStatus,
      subtotal,
      shippingFee,
      discount,
      totalAmount,
      notes: data.notes?.trim() || undefined,
      stockReserved: true,
      });
    } catch (err) {
      // Order never landed — put the units back rather than lose them.
      await releaseStock(Product, orderItems);
      throw err;
    }

    // Stock already moved with the reservation above.

    // Mirror to ncom.bd as a signed delta (fire-and-forget).
    stockLinesForOrderItems(Product, orderItems, -1)
      .then((lines) => reportStockDelta(lines, { reason: "MANUAL", note: `Manual/POS order ${order.orderNumber}` }))
      .catch(() => {});

    // Optional confirmation email if the customer gave one.
    if (c.email?.trim()) {
      sendEmail({
        to: c.email.trim(),
        subject: `Order Confirmed — ${order.orderNumber}`,
        html: orderConfirmationTemplate(order.toObject()),
      }).catch(() => {});
    }

    // Courier delivery-history / fraud check on the phone (useful for COD risk).
    // NOTE: we intentionally do NOT fire the web Purchase pixel here — a manual
    // sale's request comes from staff, so pixel attribution would be wrong.
    runFraudCheckForOrder(order._id, order.shippingAddress.phone).catch(() => {});

    // If the staff created it already in "processing", push it to the courier.
    if (orderStatus === "processing") maybeAutoSendToCourier(order._id).catch(() => {});

    // Notify the roles subscribed to new manual/POS sales.
    notifyEvent("order_new_pos", {
      severity: "info",
      title: `New ${source} order ${order.orderNumber}`,
      body: `${session.user.name || "Staff"} created an order for ৳${totalAmount} (${orderItems.length} item${orderItems.length === 1 ? "" : "s"}).`,
      link: `/admin/orders/${order._id}`,
      order: order._id,
      actor: session.user.id,
      actorName: session.user.name || session.user.email || "Staff",
    }).catch(() => {});

    return NextResponse.json({ orderId: order._id.toString(), orderNumber: order.orderNumber }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/orders error:", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
