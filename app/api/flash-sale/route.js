export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getFlashSale, getFlashSales } from "@/lib/storefront";

// Public: the live flash sales (products, per-size prices, what is left), or one
// campaign with ?slug=, from the brand ERP. Lets a sale's page refresh "X left"
// without a full reload.
export async function GET(request) {
  const slug = new URL(request.url).searchParams.get("slug");
  try {
    if (slug) return NextResponse.json({ sale: await getFlashSale(slug) });
    const { live } = await getFlashSales();
    return NextResponse.json({ sales: live });
  } catch (err) {
    console.error("GET /api/flash-sale error:", err?.code || err?.message);
    return NextResponse.json(slug ? { sale: null } : { sales: [] });
  }
}
