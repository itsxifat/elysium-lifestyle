import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import { deleteImageIfUnreferenced } from "@/lib/images";
import { applySkuScheme } from "@/lib/sku-server";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = params;

    const query = id.length === 24
      ? { _id: id }
      : { slug: id };

    const product = await Product.findOne(query)
      .populate("category", "name slug")
      .lean();

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    // Current state — needed for image cleanup and to keep the SKU base / record
    // the old slug for redirects when the name changes.
    const existing = await Product.findById(params.id).lean();
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const before = Array.isArray(data.images) ? existing : null;

    // Refresh variant SKUs + slug per the configured scheme (no-op when disabled).
    const sku = await applySkuScheme(data, { existing });
    const update = { ...data };
    if (sku.applied) {
      update.variants = sku.variants;
      update.slug = sku.slug;
      update.skuBase = sku.skuBase;
      if (sku.previousSlugs) update.previousSlugs = sku.previousSlugs;
    }

    const product = await Product.findByIdAndUpdate(
      params.id,
      update,
      { new: true, runValidators: true }
    ).populate("category", "name slug");

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Delete from the CDN any image that was on the product but isn't anymore.
    if (before) {
      const removed = (before.images || []).filter((u) => !data.images.includes(u));
      await Promise.all(removed.map((u) => deleteImageIfUnreferenced(u)));
    }

    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const product = await Product.findByIdAndDelete(params.id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    // Remove the product's images from the CDN — but only those no longer used
    // by any other product/category/duplicate.
    await Promise.all((product.images || []).map((u) => deleteImageIfUnreferenced(u)));
    return NextResponse.json({ message: "Product deleted successfully" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
