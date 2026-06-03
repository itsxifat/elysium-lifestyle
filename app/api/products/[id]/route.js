import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import { deleteFromCDN } from "@/lib/cdn";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = params;

    const query = id.length === 24
      ? { _id: id }
      : { slug: id };

    const product = await Product.findOne(query)
      .populate("category", "name slug gender")
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
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();

    // Capture the previous images so we can clean up any that get removed.
    const before = Array.isArray(data.images)
      ? await Product.findById(params.id).select("images").lean()
      : null;

    const product = await Product.findByIdAndUpdate(
      params.id,
      { ...data },
      { new: true, runValidators: true }
    ).populate("category", "name slug");

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Delete from the CDN any image that was on the product but isn't anymore.
    if (before) {
      const removed = (before.images || []).filter((u) => !data.images.includes(u));
      await Promise.all(removed.map((u) => deleteFromCDN(u)));
    }

    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    await connectDB();
    const product = await Product.findByIdAndDelete(params.id);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    // Remove the product's images from the CDN so they stop using storage.
    await Promise.all((product.images || []).map((u) => deleteFromCDN(u)));
    return NextResponse.json({ message: "Product deleted successfully" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
