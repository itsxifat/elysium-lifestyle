export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";
import { getTrackingConfig } from "@/lib/storefront";
import { toErpEvents } from "@/lib/tracking/forward";

// Browser tracking events (PageView, ViewContent, AddToCart, …), batched by the
// browser (lib/tracking/client.js) and forwarded to the brand ERP
// (POST /storefront/v1/events, M35b, D-552) with the shopper's own address and
// browser as `client`. The ERP logs them and sends them again from its server
// (Meta's Conversions API, GA4's Measurement Protocol) under the same event id.
//
// Only while the ERP's tracking config has the pixel or gtag on (read through
// lib/erp.js's 30-second cache); at most twenty events a call; never Purchase
// (the ERP sends its own, `purchase_<orderNo>`); every event reduced to the
// fields the ERP accepts (lib/tracking/forward.js). Always 200, so a beacon never
// surfaces an error to the shopper.
export async function POST(request) {
  const events = toErpEvents(await jsonBody(request));
  if (events.length && (await getTrackingConfig()).enabled) {
    const client = clientOf(request);
    try {
      await erpPost(erpPath("/events"), { events, ...(client ? { client } : {}) });
    } catch {
      // Tracking must never break a page (a 429 for a busy shopper included).
    }
  }
  return NextResponse.json({ ok: true });
}
