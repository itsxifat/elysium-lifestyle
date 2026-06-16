import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import { buildProductSearchFilter } from "@/lib/search";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) return NextResponse.json([]);

  try {
    await connectDB();

    // Advanced match: name, description, tags, slug, SKU, size, category name…
    const sf = await buildProductSearchFilter(q);
    if (!sf.$and) return NextResponse.json([]);

    const products = await Product.find({ isPublished: true, ...sf })
      .select("name slug images variants featured")
      .sort({ featured: -1, createdAt: -1 })
      .limit(8)
      .lean();

    return NextResponse.json(
      products.map((p) => {
        const prices = (p.variants || []).map((v) => v.price).filter((n) => Number.isFinite(n));
        return {
          _id: p._id.toString(),
          name: p.name,
          slug: p.slug,
          image: p.images?.[0] || null,
          price: prices.length ? Math.min(...prices) : 0,
        };
      })
    );
  } catch (err) {
    console.error("GET /api/search error:", err);
    return NextResponse.json([]);
  }
}
