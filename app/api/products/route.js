export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listProducts } from "@/lib/storefront";
import { erpFailure } from "@/lib/http";

// The shop's grid: the brand ERP's product list for the shop's own filters
// (search, category, size, price in taka, new arrivals, sort, page).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await listProducts(searchParams));
  } catch (error) {
    return erpFailure(error);
  }
}
