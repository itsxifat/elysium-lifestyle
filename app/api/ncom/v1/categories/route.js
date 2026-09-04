export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { connectDB } from "@/lib/mongoose";
import {
  authenticate, connectorJson, connectorError, recordActivity, connectorContext, categoryTree,
} from "@/lib/ncom-connector";

// GET {base}/categories — the browse tree.
//
// Optional, and declared in /ping's capabilities, so a merchant who does not
// want their tree exposed can switch it off and ncom stops asking.
export async function GET(request) {
  await connectDB();

  const auth = await authenticate(request, "");
  if (auth.response) return auth.response;

  const { cfg } = auth;
  if (!cfg.enabled) {
    return connectorError(503, "not_serving", "The product source is switched off in this shop's admin panel.");
  }
  if (!cfg.capabilities.categories) {
    return connectorError(501, "not_implemented", "Categories are switched off for this connector.");
  }

  const { origin } = connectorContext(cfg);
  const categories = await categoryTree(origin);

  recordActivity("categories");
  return connectorJson({ categories });
}
