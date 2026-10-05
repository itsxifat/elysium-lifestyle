export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDistricts } from "@/lib/storefront";
import { erpFailure } from "@/lib/http";

// The districts couriers deliver to, for the checkout's and the address book's
// pickers (GET /storefront/v1/geo/districts).
export async function GET() {
  try {
    return NextResponse.json({ items: await getDistricts() });
  } catch (error) {
    return erpFailure(error);
  }
}
