export const dynamic = "force-dynamic";

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAdmin } from "@/lib/auth";
import Product from "@/models/Product";
import { searchPickerProducts, pickerParamsFrom } from "@/lib/product-picker";

// Powers the product picker on /admin/flash-sales/<id>. Returns each product's
// sizes with their live stock and price, so a size can be put on sale against
// the real inventory.
//
// `?ids=a,b,c` instead returns exactly those products — the editor's "refresh
// stock", which re-reads the inventory of everything already in the sale.
export async function GET(request) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  try {
    await connectDB();
    const ids = (new URL(request.url).searchParams.get("ids") || "")
      .split(",")
      .filter((id) => mongoose.isValidObjectId(id))
      .slice(0, 300);
    if (ids.length) {
      const products = await Product.find({ _id: { $in: ids } })
        .select("name images variants slug skuBase isPublished")
        .lean();
      return NextResponse.json({ products });
    }
    return NextResponse.json(await searchPickerProducts({ ...pickerParamsFrom(request), withVariants: true }));
  } catch (err) {
    console.error("GET /api/admin/flash-sales/products error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
