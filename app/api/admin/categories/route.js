import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Category from "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export async function GET() {
  try {
    await connectDB();
    const cats = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    return NextResponse.json(cats);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request) {
  const { error } = await requireAdmin("categories.manage");
  if (error) return error;
  try {
    await connectDB();
    const data = await request.json();
    const slug = data.slug?.trim() || slugify(data.name);
    const cat = await Category.create({
      name: data.name,
      slug,
      code: (data.code || "").toUpperCase().trim(),
      parent: data.parent || null,
      gender: data.gender || "all",
      image: data.image || "",
      description: data.description || "",
      isActive: data.isActive !== false,
      sortOrder: data.sortOrder || 0,
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
