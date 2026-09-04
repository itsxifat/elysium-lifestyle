export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { connectDB } from "@/lib/mongoose";
import {
  authenticate, readRawBody, connectorJson, connectorError, recordActivity, releaseUnits,
} from "@/lib/ncom-connector";

// POST {base}/release — give held units back.
//
// Arrives when an order is cancelled, when a parcel comes back, and when a
// checkout failed after the hold. Idempotent on `orderRef`: we credit exactly
// what our own reservation record says was taken, exactly once, so a retried
// release cannot invent stock.
export async function POST(request) {
  await connectDB();

  const { raw, tooLarge } = await readRawBody(request);
  if (tooLarge) return connectorError(413, "payload_too_large", "Request body is too large.");

  const auth = await authenticate(request, raw);
  if (auth.response) return auth.response;

  const { cfg } = auth;
  if (!cfg.enabled) {
    return connectorError(503, "not_serving", "The product source is switched off in this shop's admin panel.");
  }
  if (!cfg.capabilities.release) {
    return connectorError(501, "not_implemented", "This connector does not hold stock.");
  }

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return connectorError(400, "invalid_request", "Body is not valid JSON.");
  }

  const result = await releaseUnits(body?.orderRef);

  recordActivity("release");
  return connectorJson(result);
}
