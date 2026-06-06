import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import { escapeRegExp } from "@/lib/utils";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) return NextResponse.json([]);

  const safe = escapeRegExp(q);
  if (!safe) return NextResponse.json([]);

  try {
    await connectDB();

    const products = await Product.find({
      isPublished: true,
      $or: [
        { name: { $regex: safe, $options: "i" } },
        { tags: { $regex: safe, $options: "i" } },
      ],
    })
      .select("name slug images variants")
      .limit(6)
      .lean();

    return NextResponse.json(
      products.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        slug: p.slug,
        image: p.images?.[0] || null,
        price: p.variants?.[0]?.price || 0,
      }))
    );
  } catch {
    return NextResponse.json([]);
  }
}
