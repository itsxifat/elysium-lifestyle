export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import { buildProductSearchFilter } from "@/lib/search";

// Product lookup for the POS / manual-order builder. Advanced multi-field match
// (name, SKU, size, tags, category, price…) so staff can find any item fast.
export async function GET(request) {
  const { error } = await requireAdmin("orders.create");
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    const filter = { isPublished: true };
    const sf = await buildProductSearchFilter(q);
    if (sf.$and) filter.$and = sf.$and;

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
