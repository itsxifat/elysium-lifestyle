export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { connectDB } from "@/lib/mongoose";
import {
  authenticate, readRawBody, connectorJson, connectorError, recordActivity,
  stockForVariantIds, MAX_STOCK_IDS,
} from "@/lib/ncom-connector";

// POST {base}/stock — current stock for a list of variants.
//
// The hot endpoint: called on every cart render and again inside every
// checkout. It is one indexed query no matter how many ids arrive, and it
// writes nothing.
export async function POST(request) {
  await connectDB();

  const { raw, tooLarge } = await readRawBody(request);
  if (tooLarge) return connectorError(413, "payload_too_large", "Request body is too large.");

  const auth = await authenticate(request, raw);
  if (auth.response) return auth.response;

  if (!auth.cfg.enabled) {
    return connectorError(503, "not_serving", "The product source is switched off in this shop's admin panel.");
  }

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return connectorError(400, "invalid_request", "Body is not valid JSON.");
  }

  const ids = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length > MAX_STOCK_IDS) {
    return connectorError(422, "invalid_request", `At most ${MAX_STOCK_IDS} ids per request.`);
  }

  const stock = await stockForVariantIds(ids);

  recordActivity("stock");
  return connectorJson({ stock });
}
