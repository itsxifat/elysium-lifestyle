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
import { isStaff } from "@/lib/permissions";
import { maybeAutoSendToCourier } from "@/lib/steadfast";

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

    return NextResponse.json(order);
  } catch (err) {
    console.error("GET /api/orders/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { error } = await requireAdmin("orders.manage");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    const allowedFields = ["orderStatus", "paymentStatus", "notes"];
    const update = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) update[field] = data[field];
    }

    // Track the prior status so we can detect a transition into "processing".
    const prev = await Order.findById(params.id).select("orderStatus courier.consignmentId").lean();

    const order = await Order.findByIdAndUpdate(params.id, update, { new: true })
      .populate("user", "name email")
      .lean();

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // Entering "processing" → auto-create the Steadfast consignment (idempotent;
    // skips if it already has one or auto-send is off).
    if (data.orderStatus === "processing" && prev?.orderStatus !== "processing" && !prev?.courier?.consignmentId) {
      maybeAutoSendToCourier(order._id).catch(() => {});
    }

    // Send status update email
    if (data.orderStatus && ["processing", "shipped", "delivered", "cancelled"].includes(data.orderStatus)) {
      const toEmail = order.user?.email || order.guestEmail;
      if (toEmail) {
        sendEmail({
          to: toEmail,
          subject: `Order Update — ${order.orderNumber}`,
          html: orderStatusTemplate(order),
        }).catch(console.error);
      }
    }

    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}
