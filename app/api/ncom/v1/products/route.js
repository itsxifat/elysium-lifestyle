export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import {
  authenticate, connectorJson, connectorError, recordActivity, connectorContext,
  toConnectorProduct, statusFilter, searchFilter, encodeCursor, decodeCursor,
  toObjectIds, PRODUCT_PROJECTION, MAX_PRODUCT_IDS, MAX_PAGE_LIMIT,
} from "@/lib/ncom-connector";
import mongoose from "mongoose";
import Category from "@/models/Category";

// GET {base}/products — a page of the catalogue, read live.
//
// Called once per landing-page render (a page with six offers over four
// products makes ONE call, not six), so this is a hot path with a 4-second
// budget at the other end. Every branch below is a single indexed query.

// Ids can arrive repeated (?ids=a&ids=b) or comma-joined (?ids=a,b).
function readIds(params) {
  const out = [];
  for (const value of params.getAll("ids")) {
    for (const piece of String(value).split(",")) {
      const id = piece.trim();
      if (id) out.push(id);
    }
  }
  return out;
}

export async function GET(request) {
  await connectDB();

  const auth = await authenticate(request, "");
  if (auth.response) return auth.response;

  const { cfg } = auth;
  if (!cfg.enabled) {
    return connectorError(503, "not_serving", "The product source is switched off in this shop's admin panel.");
  }

  const { origin } = connectorContext(cfg);
  const params = request.nextUrl.searchParams;

  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Number(params.get("limit")) || 50));
  const serialise = (docs) => docs.map((p) => toConnectorProduct(p, cfg, origin));

  // ── ids, before anything else ────────────────────────────────────────────
  // This is how ncom re-reads the exact products a saved offer names, on every
  // render of that landing page. A connector that ignores `ids` and returns its
  // first page instead makes an offer appear to sell the wrong things.
  const requestedIds = readIds(params);
  if (requestedIds.length) {
    const objectIds = toObjectIds(requestedIds, MAX_PRODUCT_IDS);
    const docs = objectIds.length
      ? await Product.find({ _id: { $in: objectIds } }, PRODUCT_PROJECTION).lean()
      : [];

    // Answer in the order asked. An offer that names three products expects
    // them back in the order it named them, and a $in does not promise that.
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const ordered = requestedIds.map((id) => byId.get(String(id).trim())).filter(Boolean);

    recordActivity("products");
    return connectorJson({ products: serialise(ordered), nextCursor: null, total: ordered.length });
  }

  // ── a page of the catalogue ──────────────────────────────────────────────
  const visible = statusFilter(cfg, params.get("status"));
  if (!visible) {
    // A status this shop has nothing in (archived), or drafts while they are
    // switched off. An empty page is the honest answer.
    recordActivity("products");
    return connectorJson({ products: [], nextCursor: null, total: 0 });
  }

  const filter = { ...visible };

  const category = (params.get("category") || "").trim();
  if (category) {
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = new mongoose.Types.ObjectId(category);
    } else {
      // Also accept a handle, because that is what a human pastes.
      const cat = await Category.findOne({ slug: category.toLowerCase() }, { _id: 1 }).lean();
      filter.category = cat?._id ?? null;
    }
  }

  const q = params.get("q");
  if (q) {
    if (!cfg.capabilities.search) {
      return connectorError(501, "not_implemented", "Search is switched off for this connector.");
    }
    const search = searchFilter(q);
    if (search) Object.assign(filter, search);
  }

  // Cursor paging on _id: an indexed range scan whose cost does not grow with
  // how deep into the catalogue you are. skip/limit re-walks everything it
  // skipped, so page 40 costs forty times page 1.
  const after = decodeCursor(params.get("cursor"));
  if (after) filter._id = { $gt: after };

  const docs = await Product.find(filter, PRODUCT_PROJECTION)
    .sort({ _id: 1 })
    .limit(limit + 1) // one extra: its existence is what says there is a next page
    .lean();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  // Counted only on the first page. It is a convenience for their dashboard,
  // not something a shopper waits on, and re-counting per page would double the
  // work of every paginated read.
  // `filter` carries no _id clause on the first page — the cursor is the only
  // thing that puts one there — so this counts the whole matching set.
  let total;
  if (!after) total = await Product.countDocuments(filter);

  recordActivity("products");

  return connectorJson({
    products: serialise(page),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]._id) : null,
    ...(total === undefined ? {} : { total }),
  });
}
