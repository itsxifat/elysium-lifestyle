import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Category from "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { deleteImageIfUnreferenced } from "@/lib/images";

export async function GET(_, { params }) {
  try {
    await connectDB();
    const cat = await Category.findById(params.id).lean();
    if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(cat);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { error } = await requireAdmin("categories.manage");
  if (error) return error;
  try {
    await connectDB();
    const data = await request.json();
    if (data.slug) data.slug = data.slug.trim().toLowerCase();
    else if (data.name) data.slug = slugify(data.name);

    // Prevent a category from being its own parent
    if (data.parent?.toString() === params.id) {
      return NextResponse.json({ error: "A category cannot be its own parent" }, { status: 400 });
    }

    // If the image is being changed/cleared, remember the old one to clean up.
    const before = "image" in data
      ? await Category.findById(params.id).select("image").lean()
      : null;

    const cat = await Category.findByIdAndUpdate(params.id, data, { new: true }).lean();
    if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (before?.image && before.image !== data.image) {
      await deleteImageIfUnreferenced(before.image);
    }
    return NextResponse.json(cat);
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_, { params }) {
  const { error } = await requireAdmin("categories.manage");
  if (error) return error;
  try {
    await connectDB();
    const children = await Category.countDocuments({ parent: params.id });
    if (children > 0) {
      return NextResponse.json(
        { error: "Cannot delete — move or delete subcategories first" },
        { status: 400 }
      );
    }
    const cat = await Category.findByIdAndDelete(params.id);
    if (cat?.image) await deleteImageIfUnreferenced(cat.image);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
