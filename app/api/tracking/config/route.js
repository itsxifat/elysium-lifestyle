export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpGet, erpPath } from "@/lib/erp";

// Public, NON-SECRET tracking config the browser helper (lib/tracking/client.js)
// reads to know what to fire and which first-party paths to load scripts from:
// the brand ERP's Website → Tracking (GET /storefront/v1/tracking/config, M35b).
//
// WAITING FOR M35b: until the ERP serves that route, tracking stays off (the
// answer below), so no pixel or gtag loads.
const OFF = { meta: { pixelEnabled: false }, ga4: { clientEnabled: false }, events: [] };

export async function GET() {
  try {
    const config = await erpGet(erpPath("/tracking/config"));
    return NextResponse.json(config?.config || config || OFF, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(OFF, { headers: { "Cache-Control": "public, max-age=30" } });
  }
}
