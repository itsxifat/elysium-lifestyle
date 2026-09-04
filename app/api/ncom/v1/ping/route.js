export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:crypto for the HMAC — not available on edge

import { connectDB } from "@/lib/mongoose";
import { authenticate, connectorJson, connectorError, recordActivity } from "@/lib/ncom-connector";
import { CONNECTOR_CONTRACT, PRICE_CURRENCY } from "@/lib/ncom";

// GET {base}/ping — the handshake.
//
// Called when a merchant presses Test on Settings → Product source, never while
// a shopper is waiting. `capabilities` is read literally: ncom shows the
// merchant exactly what this site can do, so claiming something we have not
// built turns a clear warning into a mysterious checkout failure. Every flag
// below is derived from what these routes actually serve.
export async function GET(request) {
  await connectDB();

  // The signed body of a GET is the empty string.
  const auth = await authenticate(request, "");
  if (auth.response) return auth.response;

  const { cfg } = auth;

  // Credentials are right but the merchant has not switched serving on. Saying
  // so plainly beats an empty catalogue that looks like a working connection.
  if (!cfg.enabled) {
    return connectorError(
      503,
      "not_serving",
      "The product source is switched off in this shop's admin panel."
    );
  }

  recordActivity("ping");

  return connectorJson({
    ok: true,
    contract: CONNECTOR_CONTRACT,
    platform: "elysium-nextjs/1",
    // Compared against the workspace currency, never converted. Reading a price
    // as one currency and charging it as another is a hundredfold error.
    currency: PRICE_CURRENCY,
    capabilities: cfg.capabilities,
  });
}
