export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAdmin } from "@/lib/auth";
import { searchPickerProducts, pickerParamsFrom } from "@/lib/product-picker";

// Powers the highlight-product picker on /admin/custom-urls.
export async function GET(request) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  try {
    await connectDB();
    return NextResponse.json(await searchPickerProducts(pickerParamsFrom(request)));
  } catch (err) {
    console.error("GET /api/admin/custom-urls/products error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
