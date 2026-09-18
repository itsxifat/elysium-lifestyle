export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getPublicFlashSales, getPublicFlashSale } from "@/lib/flashSale";

// Public: the live flash sales (products, per-size prices, what is left), or
// one campaign with ?slug=. Lets the storefront refresh "X left" without a
// full page reload.
export async function GET(request) {
  const slug = new URL(request.url).searchParams.get("slug");
  try {
    if (slug) return NextResponse.json({ sale: await getPublicFlashSale(slug) });
    return NextResponse.json({ sales: await getPublicFlashSales() });
  } catch (err) {
    console.error("GET /api/flash-sale error:", err);
    return NextResponse.json(slug ? { sale: null } : { sales: [] });
  }
}
