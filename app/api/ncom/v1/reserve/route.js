export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { connectDB } from "@/lib/mongoose";
import {
  authenticate, readRawBody, connectorJson, connectorError, recordActivity, reserveUnits,
} from "@/lib/ncom-connector";

// POST {base}/reserve — hold units for an order ncom is about to write.
//
// This is the consequential half of the whole integration. With it, our
// database decides which of two shoppers gets the last unit, because the check
// and the decrement are one atomic operation here. Without it, ncom checks
// stock moments before writing the order and no more — and two shoppers
// reaching the last unit in the same second both get an order.
//
// A refusal is a 200 carrying `ok: false`, not an HTTP error: the request was
// understood and answered. ncom then declines to write the order and tells the
// shopper which line ran out.
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
  if (!cfg.capabilities.reserve) {
    return connectorError(501, "not_implemented", "This connector does not hold stock.");
  }

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return connectorError(400, "invalid_request", "Body is not valid JSON.");
  }

  const result = await reserveUnits(body?.orderRef, body?.lines);

  recordActivity("reserve");
  return connectorJson(result);
}
