export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";

// Browser tracking events (PageView, AddToCart, …), forwarded to the brand ERP
// (POST /storefront/v1/events, M35b), whose worker sends them to Meta's
// Conversions API and GA4 with the shopper's address and browser.
//
// WAITING FOR M35b: until the ERP serves that route the forward fails quietly.
// Always 200, so a browser beacon never surfaces an error to the shopper.
export async function POST(request) {
  const payload = await jsonBody(request);
  const events = (Array.isArray(payload) ? payload : [payload]).filter((e) => e && e.eventName).slice(0, 20);
  if (events.length) {
    const client = clientOf(request);
    try {
      await erpPost(erpPath("/events"), { events, ...(client ? { client } : {}) });
    } catch {
      // Tracking must never break a page.
    }
  }
  return NextResponse.json({ ok: true });
}
