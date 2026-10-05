export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/storefront";

// The search box: up to eight products from the brand ERP's search (every word
// must match the name, address, SKU codes, tags, material or category).
export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchProducts(q));
  } catch (err) {
    console.error("GET /api/search error:", err?.code || err?.message);
    return NextResponse.json([]);
  }
}
