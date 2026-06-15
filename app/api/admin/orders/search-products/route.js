export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import { escapeRegExp } from "@/lib/utils";

// Lightweight product lookup for the POS / manual-order builder. Substring match
// on name (and variant SKU) so staff can find items instantly while typing.
export async function GET(request) {
  const { error } = await requireAdmin("orders.create");
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const q = escapeRegExp((searchParams.get("q") || "").trim());

    const filter = { isPublished: true };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { "variants.sku": { $regex: q, $options: "i" } },
      ];
    }

    const products = await Product.find(filter)
      .select("name images variants slug")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const result = products.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      image: p.images?.[0] || "",
      variants: (p.variants || []).map((v) => ({
        size: v.size,
        price: v.price,
        stock: v.stock,
        sku: v.sku || null,
      })),
    }));

    return NextResponse.json({ products: result });
  } catch (err) {
    console.error("GET /api/admin/orders/search-products error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
