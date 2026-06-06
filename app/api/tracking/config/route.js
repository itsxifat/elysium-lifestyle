export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTrackingConfig, clientSafeConfig } from "@/lib/tracking/config";

// Public, NON-SECRET config the browser helper reads to know what to fire and
// which first-party paths to load scripts from. Never exposes tokens/secrets.
export async function GET() {
  try {
    const config = await getTrackingConfig();
    const safe = clientSafeConfig(config);
    return NextResponse.json(safe, {
      // Cache briefly at the edge/browser; admin changes propagate within ~30s.
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(
      { meta: { pixelEnabled: false }, ga4: { clientEnabled: false }, events: [] },
      { status: 200 }
    );
  }
}
