export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import "@/models/Category";
import { requireAdmin } from "@/lib/auth";
import { escapeRegExp } from "@/lib/utils";

// Make N copies of a product (same name, images, variants) with unique slugs.
// Duplicates share the original's image references (no re-upload) and are
// created as DRAFTS so you can swap photos before publishing.
export async function POST(request, { params }) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const count = Math.min(20, Math.max(1, parseInt(body.count, 10) || 1));

    const original = await Product.findById(params.id).lean();
    if (!original) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    // Collect existing "<slug>-copy*" slugs so we can number new ones uniquely.
    const base = original.slug;
    const existing = await Product.find({ slug: new RegExp(`^${escapeRegExp(base)}-copy`) })
      .select("slug")
      .lean();
    const taken = new Set(existing.map((p) => p.slug));
    let n = 1;
    const nextSlug = () => {
      let s = `${base}-copy`;
      while (taken.has(s)) {
        n += 1;
        s = `${base}-copy-${n}`;
      }
      taken.add(s);
      return s;
    };

    const docs = [];
    for (let i = 0; i < count; i++) {
      const copy = { ...original };
      delete copy._id;
      delete copy.createdAt;
      delete copy.updatedAt;
      delete copy.__v;
      copy.slug = nextSlug();
      copy.isPublished = false; // draft — change the photo, then publish
      if (Array.isArray(copy.variants)) {
        copy.variants = copy.variants.map(({ _id, ...rest }) => rest); // fresh subdoc ids
      }
      docs.push(copy);
    }

    const created = await Product.insertMany(docs);
    const populated = await Product.find({ _id: { $in: created.map((c) => c._id) } })
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ created: created.length, products: JSON.parse(JSON.stringify(populated)) });
  } catch (err) {
    console.error("Duplicate error:", err);
    return NextResponse.json({ error: "Failed to duplicate product" }, { status: 500 });
  }
}
