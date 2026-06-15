export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import "@/models/Category";
import { escapeRegExp } from "@/lib/utils";

// Resolve a scanned code (a variant SKU, or a product slug / id as a fallback)
// to product details for the scan page.
export async function GET(request) {
  const { error } = await requireAdmin("orders.view");
  if (error) return error;

  try {
    await connectDB();
    const raw = (new URL(request.url).searchParams.get("code") || "").trim();
    if (!raw) return NextResponse.json({ found: false, error: "No code" }, { status: 400 });

    const safe = escapeRegExp(raw);
    const exact = { $regex: `^${safe}$`, $options: "i" };

    // Primary: match a variant SKU. Fallbacks: product slug or id.
    let product = await Product.findOne({ "variants.sku": exact })
      .populate("category", "name slug")
      .lean();
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
