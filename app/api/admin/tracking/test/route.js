export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dispatchEvent, newEventId } from "@/lib/tracking/dispatch";
import { extractClientMeta } from "@/lib/tracking/server";

// Fire a TEST event (testMode forced on): Meta routes it to Test Events via
// test_event_code, GA4 uses the /debug endpoint and returns validationMessages.
// Returns the full dispatch result so the admin UI shows live request/response.
export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { ip, userAgent } = extractClientMeta(request);

  const eventName = body.eventName || "Purchase";
  const result = await dispatchEvent({
    eventName,
    eventId: body.eventId || newEventId(),
    source: "server",
    actionSource: "website",
    eventSourceUrl: body.eventSourceUrl || "https://example.com/admin-test",
    testMode: true,
    userData: body.userData || {
      email: "test@example.com",
      phone: "01700000000",
      firstName: "Test",
      lastName: "User",
      city: "Dhaka",
      country: "BD",
    },
    customData:
      body.customData ||
      (eventName === "Purchase"
        ? { currency: "BDT", value: 1499, order_id: `TEST-${Date.now()}`, num_items: 1 }
        : { currency: "BDT", value: 0 }),
    ga4: { clientId: body.clientId || `test.${Date.now()}` },
    ip,
    userAgent: userAgent || "Mozilla/5.0 (AdminTest)",
  });

  return NextResponse.json(result);
}
