export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getThanas } from "@/lib/storefront";
import { erpFailure } from "@/lib/http";

// The thanas of one district (GET /storefront/v1/geo/thanas?districtId=).
export async function GET(request) {
  const districtId = new URL(request.url).searchParams.get("districtId") || "";
  if (!/^\d{1,6}$/.test(districtId)) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await getThanas(districtId) });
  } catch (error) {
    return erpFailure(error);
  }
}
