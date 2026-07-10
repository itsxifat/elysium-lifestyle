export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAdmin } from "@/lib/auth";
import { searchPickerProducts, pickerParamsFrom } from "@/lib/product-picker";

// Powers the offer product picker on /admin/landing-pages/<id>. Same browser as
// the custom-url picker, but it also returns variants so the admin can pin a
// size to an offer line.
export async function GET(request) {
  const { error } = await requireAdmin("landing.manage");
  if (error) return error;

  try {
    await connectDB();
    const params = pickerParamsFrom(request);
    return NextResponse.json(await searchPickerProducts({ ...params, withVariants: true }));
  } catch (err) {
    console.error("GET /api/admin/landing-pages/products error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
