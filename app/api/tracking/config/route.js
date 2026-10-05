export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTrackingConfig } from "@/lib/storefront";

// What the browser's tracking helper (lib/tracking/client.js) may load and fire:
// the brand ERP's Website → Tracking (GET /storefront/v1/tracking/config, M35b,
// D-552), mapped by lib/storefront-map.js → mapTrackingConfig. No secret is in
// it: the pixel id, the GA4 measurement id, this site's proxy paths and which
// events fire in the browser. `enabled: false` (the ERP has the pixel and gtag
// off, or cannot be read) means no script, no cookie and no event.
export async function GET() {
  const config = await getTrackingConfig();
  return NextResponse.json(config, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
  });
}
