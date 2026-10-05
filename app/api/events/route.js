export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpGet, erpPath, erpPost } from "@/lib/erp";
import { jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";

// Browser tracking events (PageView, AddToCart, …), forwarded to the brand ERP
// (POST /storefront/v1/events, M35b), whose worker sends them to Meta's
// Conversions API and GA4 with the shopper's address and browser.
//
// WAITING FOR M35b: events are forwarded only while the ERP serves a tracking
// config (read through the 30-second cache); until then nothing is sent.
// Always 200, so a browser beacon never surfaces an error to the shopper.

// The answer is remembered for a minute, a "no" included, so a page full of
// beacons costs the ERP one read, not one per event.
let known = { on: false, until: 0 };

async function trackingOn() {
  if (Date.now() < known.until) return known.on;
  let on = false;
  try {
    const config = await erpGet(erpPath("/tracking/config"));
    const c = config?.config || config || {};
    on = !!(c.meta?.pixelEnabled || c.meta?.capiEnabled || c.ga4?.clientEnabled || c.ga4?.serverEnabled || c.enabled);
  } catch {
    on = false;
  }
  known = { on, until: Date.now() + 60_000 };
  return on;
}

export async function POST(request) {
  const payload = await jsonBody(request);
  const events = (Array.isArray(payload) ? payload : [payload]).filter((e) => e && e.eventName).slice(0, 20);
  if (events.length && (await trackingOn())) {
    const client = clientOf(request);
    try {
      await erpPost(erpPath("/events"), { events, ...(client ? { client } : {}) });
    } catch {
      // Tracking must never break a page.
    }
  }
  return NextResponse.json({ ok: true });
}
