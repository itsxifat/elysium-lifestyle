export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Order from "@/models/Order";
import "@/models/Category";
import { escapeRegExp } from "@/lib/utils";

// Resolve a scanned code to what the packer needs to see.
//
// A shipping label's QR encodes the SHIPMENT code (`courier.trackingCode ||
// orderNumber` — see app/(admin)/admin/labels), so we resolve an ORDER first and
// return its full item list ("what's in this parcel"). If that misses (e.g. the
// operator scanned an individual product's own SKU barcode), we fall back to the
// original product lookup. The response carries a `type` so the page renders the
// right view.
export async function GET(request) {
  const { error } = await requireAdmin("orders.view");
  if (error) return error;

  try {
    await connectDB();
    const raw = (new URL(request.url).searchParams.get("code") || "").trim();
    if (!raw) return NextResponse.json({ found: false, error: "No code" }, { status: 400 });

    const exact = { $regex: `^${escapeRegExp(raw)}$`, $options: "i" };

    // ── 1) Shipment (the label QR) ──────────────────────────────────────────
    const orderOr = [{ "courier.trackingCode": exact }, { orderNumber: exact }];
    if (/^\d+$/.test(raw)) orderOr.push({ "courier.consignmentId": Number(raw) });

    const order = await Order.findOne({ $or: orderOr })
      .select("orderNumber items shippingAddress status paymentMethod paymentStatus totalAmount courier createdAt notes")
      .lean();

    if (order) {
      const a = order.shippingAddress || {};
      const items = (order.items || []).map((it) => ({
        name: it.name, image: it.image || "", sku: it.sku || "",
        size: it.size || "", color: it.color || "",
        quantity: it.quantity, returnedQuantity: it.returnedQuantity || 0,
      }));
      return NextResponse.json({
        found: true,
        type: "shipment",
        code: raw,
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentMethod: order.paymentMethod,
          paid: order.paymentStatus === "paid",
          codAmount: order.paymentStatus === "paid" ? 0 : order.totalAmount,
          totalAmount: order.totalAmount,
          notes: order.notes || "",
          consignmentId: order.courier?.consignmentId || null,
          trackingCode: order.courier?.trackingCode || "",
          recipient: {
            name: a.name || "", phone: a.phone || "",
            address: [a.street, a.city, a.state].filter(Boolean).join(", "),
          },
          itemCount: items.length,
          totalUnits: items.reduce((n, it) => n + (it.quantity || 0), 0),
          items,
        },
      });
    }

    // ── 2) Product fallback (a variant SKU / product slug / id) ──────────────
    let product = await Product.findOne({ "variants.sku": exact }).populate("category", "name slug").lean();
    if (!product) product = await Product.findOne({ slug: exact }).populate("category", "name slug").lean();
    if (!product && raw.length === 24) product = await Product.findById(raw).populate("category", "name slug").lean();

    if (!product) return NextResponse.json({ found: false, code: raw });

    const lower = raw.toLowerCase();
    const variants = (product.variants || []).map((v) => ({
      size: v.size, sku: v.sku || "", price: v.price, stock: v.stock,
    }));
    const matchedVariant = variants.find((v) => (v.sku || "").toLowerCase() === lower) || null;

    return NextResponse.json({
      found: true,
      type: "product",
      code: raw,
      product: {
        _id: product._id.toString(),
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] || "",
        images: product.images || [],
        category: product.category ? { name: product.category.name, slug: product.category.slug } : null,
        description: product.description || "",
        material: product.material || "",
        isPublished: product.isPublished,
      },
      matchedVariant,
      variants,
    });
  } catch (err) {
    console.error("GET /api/admin/scan error:", err);
    return NextResponse.json({ found: false, error: "Lookup failed" }, { status: 500 });
  }
}
