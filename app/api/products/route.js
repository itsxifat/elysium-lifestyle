import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import { slugify, escapeRegExp } from "@/lib/utils";
import { findCategory, getSubtreeIds } from "@/lib/categories";
import { buildProductSearchFilter } from "@/lib/search";
import { applySkuScheme, uniqueSlug } from "@/lib/sku-server";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const query = { isPublished: true };
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const size = searchParams.get("size");
    const color = searchParams.get("color");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const featured = searchParams.get("featured");
    const newArrival = searchParams.get("newArrival");
    const onSale = searchParams.get("onSale");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const sort = searchParams.get("sort") || "newest";

    // Categories are needed for the subtree filter AND to let search match by
    // category name — fetch once and reuse for both.
    let allCats = null;
    if (category || search) {
      allCats = await Category.find({}).select("_id name slug parent").lean();
    }

    // Filter by category (slug OR id) including the whole subtree, so a parent
    // category lists everything nested under it (child + grandchild).
    if (category) {
      const root = findCategory(allCats, category);
      // Unmatched category → return nothing rather than silently showing all.
      query.category = { $in: root ? getSubtreeIds(allCats, root._id) : [] };
    }
    // Advanced multi-field, multi-word search (name, tags, sku, size, category…).
    if (search) {
      const sf = await buildProductSearchFilter(search, { categories: allCats });
      if (sf.$and) query.$and = [...(query.$and || []), ...sf.$and];
    }
    if (size) query["variants.size"] = size;
    if (color) {
      const safeColor = escapeRegExp(color);
      if (safeColor) query["variants.color"] = { $regex: safeColor, $options: "i" };
    }
    // Price lives on variants — match products with ANY variant in the range.
    if (minPrice || maxPrice) {
      const priceRange = {};
      if (minPrice) priceRange.$gte = Number(minPrice);
      if (maxPrice) priceRange.$lte = Number(maxPrice);
      query.variants = { $elemMatch: { price: priceRange } };
    }
    if (featured === "true") query.featured = true;
    if (newArrival === "true") query.isNewArrival = true;
    if (onSale === "true") query.salePrice = { $exists: true, $gt: 0 };

    // Sorting on an array field uses each doc's lowest value (asc) / highest
    // (desc), so "variants.price" gives a correct cheapest/priciest ordering.
    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "price-asc": { "variants.price": 1 },
      "price-desc": { "variants.price": -1 },
      featured: { featured: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[sort] || sortMap.newest;

    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name slug")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    return NextResponse.json({
      products,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(request) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    if (!data.name || !data.variants?.length) {
      return NextResponse.json({ error: "Name and at least one variant are required" }, { status: 400 });
    }

    // Apply the configured SKU scheme (base code + variant SKUs + slug). When the
    // scheme is off, fall back to the legacy name-based slug.
    const sku = await applySkuScheme(data);
    let toCreate;
    if (sku.applied) {
      toCreate = { ...data, variants: sku.variants, slug: sku.slug, skuBase: sku.skuBase };
    } else {
      const slug = await uniqueSlug(data.slug || slugify(data.name), {});
      toCreate = { ...data, slug };
    }

    const product = await Product.create(toCreate);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
