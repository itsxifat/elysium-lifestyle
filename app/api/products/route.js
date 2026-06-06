import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/auth";
import { slugify, escapeRegExp } from "@/lib/utils";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const query = { isPublished: true };
    const gender = searchParams.get("gender");
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

    if (gender) {
      const categories = await (
        await import("@/models/Category")
      ).default.find({ gender }).select("_id");
      query.category = { $in: categories.map((c) => c._id) };
    }
    if (category && mongoose.isValidObjectId(category)) query.category = category;
    if (search) query.$text = { $search: search };
    if (size) query["variants.size"] = size;
    if (color) {
      const safeColor = escapeRegExp(color);
      if (safeColor) query["variants.color"] = { $regex: safeColor, $options: "i" };
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (featured === "true") query.featured = true;
    if (newArrival === "true") query.isNewArrival = true;
    if (onSale === "true") query.salePrice = { $exists: true, $gt: 0 };

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "price-asc": { price: 1 },
      "price-desc": { price: -1 },
      featured: { featured: -1, createdAt: -1 },
    };
    const sortQuery = sortMap[sort] || sortMap.newest;

    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name slug gender")
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
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    if (!data.name || !data.variants?.length) {
      return NextResponse.json({ error: "Name and at least one variant are required" }, { status: 400 });
    }

    let slug = data.slug || slugify(data.name);
    const existing = await Product.findOne({ slug });
    if (existing) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const product = await Product.create({ ...data, slug });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
