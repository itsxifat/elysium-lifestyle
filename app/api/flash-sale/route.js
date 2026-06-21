export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveFlashSalePublic } from "@/lib/flashSale";

// Public: the live flash sale (with product details + remaining stock). Lets the
// homepage section refresh "X left" without a full page reload.
export async function GET() {
  try {
    const sale = await getActiveFlashSalePublic();
    return NextResponse.json({ sale: sale || null });
  } catch (err) {
    console.error("GET /api/flash-sale error:", err);
    return NextResponse.json({ sale: null });
  }
}
