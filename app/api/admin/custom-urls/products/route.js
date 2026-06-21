export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import { getSubtreeIds } from "@/lib/categories";
import { buildProductSearchFilter } from "@/lib/search";

const PAGE_SIZE = 40;

// Powers the highlight-product picker. Two modes:
//   • category browse — products in one category node, or its whole subtree
//     (?category=<id>&subtree=1), so admins drill the tree to find items fast.
//   • search — ?q=<text> matches across name/sku/size/tags/category.
// Either or both may be supplied.
export async function GET(request) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category");
    const subtree = searchParams.get("subtree") === "1";
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const skip = (page - 1) * PAGE_SIZE;

    const filter = {};

    if (categoryId) {
      let ids = [categoryId];
      if (subtree) {
        const allCats = await Category.find({}).select("_id parent").lean();
        ids = getSubtreeIds(allCats, categoryId);
      }
      filter.category = { $in: ids };
    }

    if (q) {
      const sf = await buildProductSearchFilter(q);
      if (sf.$and) filter.$and = sf.$and;
    }

    // Fetch one extra to know if a further page exists without a count().
    const products = await Product.find(filter)
      .select("name images variants slug skuBase")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = products.length > PAGE_SIZE;
    const items = (hasMore ? products.slice(0, PAGE_SIZE) : products).map((p) => ({
      _id: p._id.toString(),
      name: p.name,
      sku: p.skuBase || "",
      image: p.images?.[0] || "",
      price: p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : 0,
    }));

    return NextResponse.json({ products: items, page, hasMore });
  } catch (err) {
    console.error("GET /api/admin/custom-urls/products error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
