export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import { buildProductSearchFilter } from "@/lib/search";

const PAGE_SIZE = 20;

// Product lookup for the POS / manual-order builder. Advanced multi-field match
// (name, SKU, size, tags, category, price…) so staff can find any item fast.
// Paginated so the dropdown can infinite-scroll through hundreds of same-named
// products instead of being capped at a single page.
export async function GET(request) {
  const { error } = await requireAdmin("orders.create");
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const skip = (page - 1) * PAGE_SIZE;

    const filter = { isPublished: true };
    const sf = await buildProductSearchFilter(q);
    if (sf.$and) filter.$and = sf.$and;

    // Fetch one extra row to know whether another page exists without a count().
    // _id is a stable tiebreaker so paging stays consistent across same-instant rows.
    const products = await Product.find(filter)
      .select("name images variants slug skuBase")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = products.length > PAGE_SIZE;
    const pageItems = hasMore ? products.slice(0, PAGE_SIZE) : products;

    const result = pageItems.map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      sku: p.skuBase || "",
      image: p.images?.[0] || "",
      variants: (p.variants || []).map((v) => ({
        size: v.size,
        price: v.price,
        stock: v.stock,
        sku: v.sku || null,
      })),
    }));

    return NextResponse.json({ products: result, page, hasMore });
  } catch (err) {
    console.error("GET /api/admin/orders/search-products error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
