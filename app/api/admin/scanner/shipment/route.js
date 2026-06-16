export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import { escapeRegExp } from "@/lib/utils";
import { requireScannerAuth, corsJson, preflight } from "@/lib/scanner-auth";

export function OPTIONS(request) {
  return preflight(request);
}

// The app's WebView origin is https://localhost, so relative image URLs
// (/api/img/…, /uploads/…) would resolve there and break. Resolve them to the
// public site origin so thumbnails load in the app. Already-absolute URLs
// (CDN, data:) pass through untouched.
function siteOrigin(request) {
  const h = request.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host) return `${h.get("x-forwarded-proto") || "https"}://${host}`;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  try { return new URL(request.url).origin; } catch { return ""; }
}
function absoluteImg(url, origin) {
  if (!url) return "";
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:")) return url;
  return origin + (url.startsWith("/") ? url : "/" + url);
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

    const origin = siteOrigin(request);
    const items = (order.items || []).map((it) => ({
      name: it.name,
      image: absoluteImg(it.image, origin),
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
