export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { dispatchEvent, newEventId } from "@/lib/tracking/dispatch";
import { extractClientMeta } from "@/lib/tracking/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Public ingest endpoint. Accepts events from the browser helper (and any
// server-to-server caller). Forwards to Meta CAPI + GA4 MP via the dispatcher.
// The real client IP/UA are read from the request headers (Nginx proxy chain)
// and passed through to both platforms. Never throws to the caller.

export async function POST(request) {
  // Light abuse guard — generous, since legit pages fire several events.
  const limited = checkRateLimit(request, "events", { limit: 120, windowMs: 60 * 1000 });
  if (limited) return limited;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ip, userAgent } = extractClientMeta(request);
  const events = Array.isArray(payload) ? payload : [payload];

  const results = [];
  for (const evt of events.slice(0, 20)) {
    if (!evt || !evt.eventName) {
      results.push({ status: "error", error: "missing eventName" });
      continue;
    }
    const result = await dispatchEvent({
      eventName: evt.eventName,
      eventId: evt.eventId || newEventId(),
      source: evt.source === "server" ? "server" : "client",
      eventTime: evt.eventTime,
      eventSourceUrl: evt.eventSourceUrl,
      actionSource: evt.actionSource || "website",
      userData: evt.userData || {},
      customData: evt.customData || {},
      ga4: evt.ga4 || {},
      ip,
      userAgent,
      testMode: evt.testMode,
    });
    results.push({ eventId: result.eventId, status: result.status });
  }

  // Always 200 so the browser beacon never surfaces an error to the user.
  return NextResponse.json({ ok: true, results });
}
