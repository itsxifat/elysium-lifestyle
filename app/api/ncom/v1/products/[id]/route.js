export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import mongoose from "mongoose";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import {
  authenticate, connectorJson, connectorError, recordActivity, connectorContext,
  toConnectorProduct, statusFilter, PRODUCT_PROJECTION,
} from "@/lib/ncom-connector";

// GET {base}/products/{id} — one product, by id or handle.
//
// A missing (or draft-and-hidden) product must answer 404. That is what makes
// an offer referencing a deleted product disappear from the landing page
// instead of rendering as an empty card, and it is checked explicitly by their
// conformance checker.
export async function GET(request, { params }) {
  await connectDB();

  const auth = await authenticate(request, "");
  if (auth.response) return auth.response;

  const { cfg } = auth;
  if (!cfg.enabled) {
    return connectorError(503, "not_serving", "The product source is switched off in this shop's admin panel.");
  }

  const { origin } = connectorContext(cfg);
  const key = String(params?.id || "").trim();
  if (!key) return connectorError(404, "not_found", "No such product.");

  const visible = statusFilter(cfg, null);
  if (!visible) return connectorError(404, "not_found", "No such product.");

  // Our own id first, then the handle — and the handle lookup also checks
  // previousSlugs, so an offer built before a rename keeps resolving instead of
  // silently vanishing from the page it was built for.
  const or = [{ slug: key.toLowerCase() }, { previousSlugs: key.toLowerCase() }];
  if (mongoose.Types.ObjectId.isValid(key)) or.unshift({ _id: new mongoose.Types.ObjectId(key) });

  const product = await Product.findOne({ ...visible, $or: or }, PRODUCT_PROJECTION).lean();

  if (!product) return connectorError(404, "not_found", "No such product.");

  recordActivity("products");

  const shaped = toConnectorProduct(product, cfg, origin);
  // Their docs pin the list shape ({ products: [...] }) but not this one. Both
  // readings are served at once — `body.product` and `body.id` each resolve —
  // which costs a few hundred bytes on a single-product read and removes a
  // guess that would otherwise only surface as a broken offer.
  return connectorJson({ product: shaped, ...shaped });
}
