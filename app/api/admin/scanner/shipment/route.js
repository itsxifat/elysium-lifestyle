export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import { escapeRegExp } from "@/lib/utils";
import { requireScannerAuth, corsJson, preflight } from "@/lib/scanner-auth";

export function OPTIONS(request) {
  return preflight(request);
}

// Resolve a scanned shipping-label code to the full packing list for that
// shipment. The label barcode encodes `courier.trackingCode || orderNumber`
// (see app/(admin)/admin/labels Label), so we match those first, then fall back
// to the numeric courier consignment id.
export async function GET(request) {
  const { error, user } = await requireScannerAuth(request, "orders.view");
  if (error) return error;

  try {
    await connectDB();
    const raw = (new URL(request.url).searchParams.get("code") || "").trim();
    if (!raw) return corsJson(request, { found: false, error: "No code" }, { status: 400 });

    const exact = { $regex: `^${escapeRegExp(raw)}$`, $options: "i" };
    const or = [{ "courier.trackingCode": exact }, { orderNumber: exact }];
    if (/^\d+$/.test(raw)) or.push({ "courier.consignmentId": Number(raw) });

    const order = await Order.findOne({ $or: or })
      .select("orderNumber items shippingAddress status paymentMethod paymentStatus totalAmount subtotal discount shippingFee courier createdAt notes")
      .lean();

    if (!order) return corsJson(request, { found: false, code: raw });

    const items = (order.items || []).map((it) => ({
      name: it.name,
      image: it.image || "",
      sku: it.sku || "",
      size: it.size || "",
      color: it.color || "",
      quantity: it.quantity,
      returnedQuantity: it.returnedQuantity || 0,
    }));
    const a = order.shippingAddress || {};
    const cod = order.paymentStatus === "paid" ? 0 : order.totalAmount;

    return corsJson(request, {
      found: true,
      code: raw,
      scannedBy: user.name,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        paymentMethod: order.paymentMethod,
        paid: order.paymentStatus === "paid",
        codAmount: cod,
        totalAmount: order.totalAmount,
        notes: order.notes || "",
        consignmentId: order.courier?.consignmentId || null,
        trackingCode: order.courier?.trackingCode || "",
        recipient: { name: a.name || "", phone: a.phone || "", address: [a.street, a.city, a.state].filter(Boolean).join(", ") },
        itemCount: items.length,
        totalUnits: items.reduce((n, it) => n + (it.quantity || 0), 0),
        items,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/scanner/shipment error:", err);
    return corsJson(request, { found: false, error: "Lookup failed" }, { status: 500 });
  }
}
