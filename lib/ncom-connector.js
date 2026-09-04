import mongoose from "mongoose";
import Settings from "@/models/Settings";
import Product from "@/models/Product";
import Category from "@/models/Category";
import NcomReservation from "@/models/NcomReservation";
import { cdnAbsoluteUrl } from "./cdn";
import { verifySignature, secretEquals } from "./ncom-signature";
import {
  getNcomConfig, siteOrigin, CONNECTOR_CONTRACT, PRICE_CURRENCY,
} from "./ncom";

// The shop's side of the ncom.bd product source (contract 1).
//
// ncom stores no copy of this catalogue. It calls the endpoints in
// app/api/ncom/v1/* on every landing-page render, every cart and every
// checkout, and renders whatever this file says. A price changed here at 3pm is
// the price on their pages at 3pm, because there is no second copy to update.
//
// Everything below is therefore on a shopper's critical path. Two rules follow:
//
//   1. NOTHING IS TRUSTED UNTIL THE HMAC CHECKS OUT. These endpoints expose
//      prices, unpublished drafts and stock levels, and /reserve MOVES stock.
//      The URL is not a secret; the signature is.
//   2. EVERY QUERY IS INDEXED AND PROJECTED. A shopper is waiting on the other
//      end of each of these, and ncom gives up after 4 seconds by default.

// A signed body larger than this is not a catalogue read; refuse it before
// reading it into memory rather than after.
const MAX_BODY_BYTES = 256 * 1024;

// Their documented ceilings, enforced on our side too so a malformed or hostile
// request cannot turn one call into an unbounded scan.
export const MAX_PRODUCT_IDS = 250;
export const MAX_STOCK_IDS = 1000;
export const MAX_PAGE_LIMIT = 100;
export const MAX_RESERVE_LINES = 100;

// Sizes that carry no real choice — a single-variant product in one of these
// gets no Size option, because there is nothing for a shopper to pick.
const GENERIC_SIZES = new Set(["OS", "FS", "ONE SIZE", "FREE SIZE", "FREE", ""]);

const isMeaningfulSize = (size) => !GENERIC_SIZES.has(String(size || "").trim().toUpperCase());

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

// no-store on every response, without exception. ncom deliberately keeps no
// cache — "a five-second cache is a stored catalogue with a short attention
// span" — and a CDN or reverse proxy in front of us caching a stock reading
// would reintroduce exactly the drift this design removes.
const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "X-NCOM-Contract": CONNECTOR_CONTRACT,
  // These payloads are JSON read by a server, never rendered in a browser.
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function connectorJson(data, { status = 200, headers } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, ...(headers || {}) },
  });
}

// Errors carry a short machine-readable code and never echo anything the caller
// sent, so a probe learns nothing from the body it did not already know.
export function connectorError(status, code, message, extra, headers) {
  return connectorJson({ ok: false, error: { code, message }, ...(extra || {}) }, { status, headers });
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

// Failed signature attempts, per IP. Successful ncom traffic never touches this
// — the docs are explicit that a 429 at our end shows up as gaps in their
// storefront — so only forgeries are slowed down.
const failures = new Map();
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_LIMIT = 30;

if (!globalThis.__ncomFailureSweeper) {
  globalThis.__ncomFailureSweeper = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of failures) if (entry.resetAt <= now) failures.delete(ip);
  }, FAILURE_WINDOW_MS);
  globalThis.__ncomFailureSweeper.unref?.();
}

function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function noteFailure(request) {
  const ip = clientIp(request);
  const now = Date.now();
  let entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + FAILURE_WINDOW_MS };
  entry.count += 1;
  failures.set(ip, entry);
  return entry.count > FAILURE_LIMIT;
}

/**
 * Read the exact bytes ncom signed.
 *
 * Must happen before anything else can consume the body: `request.json()`
 * re-serializes, and re-serialized JSON is different bytes, so the signature
 * would never match.
 */
export async function readRawBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { tooLarge: true, raw: "" };
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return { tooLarge: true, raw: "" };
  return { tooLarge: false, raw };
}

/**
 * Authenticate one inbound connector request.
 *
 * Resolves to `{ cfg }` on success, or `{ response }` — an already-built refusal
 * the route should return untouched. Callers must not proceed on a response.
 */
export async function authenticate(request, rawBody) {
  // `|| {}` because the demo kit can stub this module out entirely; an
  // undefined config must read as "not connected", not throw.
  const cfg = (await getNcomConfig()) || {};

  // Fail closed. Without a secret we cannot tell ncom from anyone who learned
  // the URL, and this endpoint group exposes prices and moves stock.
  if (!cfg.connectorSecret) {
    return { response: connectorError(401, "unauthorized", "Product source is not connected.") };
  }

  const contract = request.headers.get("x-ncom-contract");
  if (contract && String(contract).trim() !== CONNECTOR_CONTRACT) {
    // Serving contract-1 shapes to a reader expecting something else is how a
    // price gets misread. Refusing is the documented failure mode: when the
    // catalogue cannot be read, ncom declines to sell rather than guessing.
    return {
      response: connectorError(
        400,
        "unsupported_contract",
        `This connector implements contract ${CONNECTOR_CONTRACT}, not ${contract}.`
      ),
    };
  }

  // The key id is not a credential on its own — the signature is — but a
  // mismatch means the request is signed for a different workspace, and
  // answering it would leak this shop's catalogue to that one.
  if (cfg.connectorKeyId) {
    const sent = request.headers.get("x-ncom-key") || "";
    if (!secretEquals(sent, cfg.connectorKeyId)) {
      const flooding = noteFailure(request);
      console.warn("[ncom] connector key mismatch from", clientIp(request));
      return { response: unauthorized(flooding) };
    }
  }

  const result = verifySignature(cfg.connectorSecret, rawBody, request.headers.get("x-ncom-signature"));
  if (!result.ok) {
    const flooding = noteFailure(request);
    // Logged here and nowhere else: the caller is told only "unauthorized", so
    // a forger cannot learn which half of the signature to fix.
    console.warn("[ncom] connector auth refused:", result.reason);
    recordFailure(result.reason);
    return { response: unauthorized(flooding) };
  }

  return { cfg };
}

// One answer for every kind of failed authentication, so a probe cannot tell a
// wrong key from a wrong signature from a clock that has drifted.
//
// Always 401, never 429, even for a caller failing hundreds of times a minute.
// The likeliest cause of exactly that pattern is a rotated secret that was
// never pasted in here — and 401 is what makes ncom's dashboard say "the key or
// the clock is wrong", which is the thing an admin needs to read. A 429 would
// replace that with "rate limited" at the precise moment it is most misleading.
// Retry-After is a courtesy hint on top, not a refusal.
function unauthorized(flooding) {
  return connectorError(
    401,
    "unauthorized",
    "Invalid signature.",
    null,
    flooding ? { "Retry-After": "60" } : undefined
  );
}

// ---------------------------------------------------------------------------
// Activity — what the admin panel shows without polling ncom
// ---------------------------------------------------------------------------

// Counters live in memory and are flushed to Settings at most once a minute.
// Writing a document per /stock call would mean a database write on every cart
// render, which is precisely the cost this integration exists to avoid.
const pending = { ping: 0, products: 0, stock: 0, categories: 0, reserve: 0, release: 0, refused: 0 };
let lastFlushAt = 0;
let lastFailureReason = "";
const FLUSH_EVERY_MS = 60_000;

function recordFailure(reason) {
  pending.refused += 1;
  lastFailureReason = reason;
}

/**
 * Count one served request and, occasionally, persist the tally.
 *
 * Never awaited by a route: an admin dashboard statistic must not add latency
 * to a shopper's checkout.
 */
export function recordActivity(kind) {
  if (kind in pending) pending[kind] += 1;

  const now = Date.now();
  if (now - lastFlushAt < FLUSH_EVERY_MS) return;
  lastFlushAt = now;

  const delta = {};
  for (const [key, value] of Object.entries(pending)) {
    if (value) delta[`ncom.stats.${key}`] = value;
    pending[key] = 0;
  }
  if (!Object.keys(delta).length) return;

  const set = { "ncom.lastRequestAt": new Date(), "ncom.lastRequestKind": kind };
  if (lastFailureReason) {
    set["ncom.lastRefusalReason"] = lastFailureReason;
    set["ncom.lastRefusalAt"] = new Date();
    lastFailureReason = "";
  }

  Settings.updateOne({}, { $inc: delta, $set: set }).catch((e) => {
    console.error("[ncom] activity flush failed:", e.message);
  });
}

// ---------------------------------------------------------------------------
// Serialisation — our Product → the shape ncom reads
// ---------------------------------------------------------------------------

// The fields the connector actually needs. Everything else on a product —
// cost, internal notes, audit trail — is never projected, so it can never be
// serialised by accident.
export const PRODUCT_PROJECTION =
  "name slug description category images variants isPublished material gender tags updatedAt";

/**
 * Turn stored image values into URLs ncom's LANDING PAGES can load.
 *
 * Under contract 1 ncom never downloads or re-hosts artwork — the page points
 * a browser straight at these URLs. A signed lifetime CDN URL is therefore the
 * right answer twice over: it bypasses the CDN's domain lock (which would 403 a
 * visitor arriving from ncom.bd), and it is served from the CDN edge rather
 * than from this origin, so their traffic never touches our server.
 *
 * Without CDN_API_SECRET nothing can be signed; we fall back to our own public
 * image proxy, which works but costs us the bandwidth.
 */
export function resolveImageUrls(product, origin = "") {
  const out = [];
  for (const value of product.images || []) {
    let url = null;
    try {
      url = cdnAbsoluteUrl(value);
    } catch {
      url = null;
    }
    if (!url && origin && typeof value === "string" && value.startsWith("/")) {
      url = origin + value;
    }
    // Plain http:// is refused at their end and would be a mixed-content block
    // in the browser besides. Drop it rather than ship a broken <img>.
    if (url && /^https:\/\//i.test(url)) out.push(url);
  }
  return out;
}

// Prices go over as decimal strings — the documented primary form, and exact
// for whole-taka amounts. `priceCents` is the alternative; sending one form
// only means there is never a pair of numbers that could disagree.
const money = (taka) => (Math.round(Number(taka || 0) * 100) / 100).toFixed(2);

export function toConnectorProduct(product, cfg, origin) {
  const variants = product.variants || [];

  // Declare the Size option when any variant has a real size, or when there is
  // more than one variant at all — two variants with no option to tell them
  // apart are indistinguishable to a shopper.
  const useOption = variants.some((v) => isMeaningfulSize(v.size)) || variants.length > 1;
  const values = [...new Set(variants.map((v) => String(v.size || "").trim()).filter(Boolean))];

  const weight = cfg.defaultWeightGrams;

  return {
    id: String(product._id),
    handle: product.slug,
    title: product.name,
    // Only `active` is sellable. Drafts appear in their dashboard so a landing
    // page can be built before the product is published.
    status: product.isPublished ? "active" : "draft",
    description: product.description || "",
    vendor: cfg.vendor || "",
    categoryId: product.category ? String(product.category) : null,
    url: origin ? `${origin}/shop/${product.slug}` : undefined,
    images: resolveImageUrls(product, origin).map((url) => ({ url, alt: product.name })),
    options: useOption && values.length ? [{ name: "Size", values }] : [],
    variants: variants.map((v) => ({
      // The variant subdocument id: stable for the life of the variant, which
      // is what an offer saved on their side stores and re-reads for ever.
      // A SKU would have been the obvious choice and is the wrong one — SKUs
      // are editable, and an id that changes is a saved offer that stops
      // resolving.
      id: String(v._id),
      title: String(v.size || "").trim() || "Default",
      sku: v.sku || null,
      price: money(v.price),
      options: useOption ? [String(v.size || "").trim()] : [],
      available: Math.max(0, Number(v.stock) || 0),
      // We do not sell what we do not have: reserve refuses at zero.
      policy: "deny",
      requiresShipping: true,
      ...(weight ? { weightGrams: weight } : {}),
    })),
  };
}

/**
 * The status filter, honouring the admin's "never expose drafts" switch.
 *
 * Returns `null` — not an impossible filter like `{ _id: null }` — when nothing
 * may match. An impossible filter is a trap here: the paging code below sets
 * `filter._id` to the cursor range, which would overwrite the very clause doing
 * the hiding and quietly serve every draft in the catalogue from page two on.
 */
export function statusFilter(cfg, status) {
  const wanted = String(status || "").toLowerCase();
  if (wanted === "active") return { isPublished: true };
  if (wanted === "draft") return cfg.includeDrafts ? { isPublished: false } : null;
  // We have no archive state, so an explicit request for one matches nothing
  // rather than quietly returning live products.
  if (wanted === "archived") return null;
  return cfg.includeDrafts ? {} : { isPublished: true };
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Free-text search, bounded so a long query cannot become an expensive scan. */
export function searchFilter(q) {
  const term = String(q || "").trim().slice(0, 80);
  if (!term) return null;
  const rx = new RegExp(escapeRegex(term), "i");
  return { $or: [{ name: rx }, { skuBase: rx }, { "variants.sku": rx }, { tags: rx }] };
}

/** Opaque page cursor — their example is base64 JSON, so ours is too. */
export function encodeCursor(id) {
  return Buffer.from(JSON.stringify({ id: String(id) }), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const { id } = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
  } catch {
    return null;
  }
}

/** Cast a list of ids, dropping anything that is not one of ours. */
export function toObjectIds(list, cap) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id) || !mongoose.Types.ObjectId.isValid(id)) continue;
    seen.add(id);
    out.push(new mongoose.Types.ObjectId(id));
    if (out.length >= cap) break;
  }
  return out;
}

// The workspace-wide bits of context every serialised product needs. Derived
// from the already-cached config, so it costs no query at all.
export function connectorContext(cfg) {
  return { cfg, origin: siteOrigin(cfg) };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/**
 * Current stock for a set of variant ids.
 *
 * One indexed query, whatever the batch size — this endpoint is called on every
 * cart render and again inside every checkout, so it must not become a loop.
 *
 * An id we do not recognise answers `available: 0, policy: "deny"`. Reporting
 * `null` would mean "not counted, always sellable", and answering that for
 * something we cannot find is how a deleted product keeps selling.
 */
export async function stockForVariantIds(ids) {
  const objectIds = toObjectIds(ids, MAX_STOCK_IDS);
  const known = new Map();

  if (objectIds.length) {
    const products = await Product.find(
      { "variants._id": { $in: objectIds } },
      { "variants._id": 1, "variants.stock": 1, isPublished: 1 }
    ).lean();

    const wanted = new Set(objectIds.map(String));
    for (const p of products) {
      for (const v of p.variants || []) {
        const id = String(v._id);
        if (!wanted.has(id)) continue;
        known.set(id, {
          id,
          // An unpublished product is not sellable, whatever the shelf holds.
          available: p.isPublished ? Math.max(0, Number(v.stock) || 0) : 0,
          policy: "deny",
        });
      }
    }
  }

  // Answer in the order asked, so a caller can zip the arrays.
  return (Array.isArray(ids) ? ids : []).slice(0, MAX_STOCK_IDS).map((raw) => {
    const id = String(raw || "").trim();
    return known.get(id) || { id, available: 0, policy: "deny" };
  });
}

// ---------------------------------------------------------------------------
// Reserve / release
// ---------------------------------------------------------------------------

// Sum the lines first: a checkout that lists the same variant twice must not
// slip two separate checks past a stock of one.
function mergeLines(lines) {
  const merged = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const variantId = String(line?.variantId ?? line?.id ?? "").trim();
    const quantity = Math.floor(Number(line?.quantity) || 0);
    if (!variantId || quantity <= 0) continue;
    merged.set(variantId, (merged.get(variantId) || 0) + quantity);
  }
  return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Take units, or take none at all.
 *
 * Each line is one atomic conditional update:
 *
 *     { variants: { $elemMatch: { _id, stock: { $gte: n } } } }
 *     { $inc: { "variants.$.stock": -n } }
 *
 * The check and the write are a single operation on a single document, so they
 * cannot be separated. Reading the stock and then writing it — the obvious
 * implementation — lets two checkouts both see the last unit and both succeed,
 * which is the exact failure this endpoint exists to prevent.
 *
 * This database is a standalone mongod, not a replica set, so multi-document
 * transactions are unavailable; a basket therefore takes line by line and hands
 * back what it already took if any line fails.
 */
export async function reserveUnits(orderRef, lines) {
  const wanted = mergeLines(lines);
  if (!wanted.length) return { ok: false, rejected: [{ reason: "No sellable lines in this request." }] };
  if (wanted.length > MAX_RESERVE_LINES) {
    return { ok: false, rejected: [{ reason: `Too many lines (max ${MAX_RESERVE_LINES}).` }] };
  }

  const ref = String(orderRef || "").trim().slice(0, 128);
  if (!ref) return { ok: false, rejected: [{ reason: "orderRef is required." }] };

  // Claim the reference atomically. Two concurrent calls for one checkout —
  // a retry after a timeout, most likely — must not both decrement.
  const existing = await NcomReservation.findOneAndUpdate(
    { orderRef: ref },
    // createdAt is left to the schema's timestamps — setting it here too puts
    // the same path in $setOnInsert twice and Mongo refuses the whole update.
    { $setOnInsert: { orderRef: ref, state: "pending", lines: [] } },
    { upsert: true, new: false, setDefaultsOnInsert: true }
  ).lean();

  if (existing) {
    // Already holding these units: answer yes without taking them a second
    // time. Idempotency on orderRef is what the retry ladder needs.
    if (existing.state === "held") return { ok: true, idempotent: true };

    // A claim that never finished. Anything younger than this is still in
    // flight somewhere and must not be duplicated; anything older crashed
    // between the claim and the take, and is ours to retry.
    if (existing.state === "pending" && Date.now() - new Date(existing.createdAt).getTime() < 120_000) {
      return { ok: false, rejected: [{ reason: "A reservation for this order is already in progress." }] };
    }
    await NcomReservation.updateOne({ orderRef: ref }, { $set: { state: "pending", lines: [] } });
  }

  const objectIds = toObjectIds(wanted.map((l) => l.variantId), MAX_RESERVE_LINES);
  const products = await Product.find(
    { "variants._id": { $in: objectIds } },
    { name: 1, isPublished: 1, "variants._id": 1, "variants.size": 1, "variants.stock": 1 }
  ).lean();

  const index = new Map();
  for (const p of products) {
    for (const v of p.variants || []) {
      index.set(String(v._id), { productId: p._id, name: p.name, size: v.size, stock: v.stock, published: p.isPublished });
    }
  }

  const taken = [];
  const giveBack = async () => {
    for (const t of taken) {
      await Product.updateOne(
        { _id: t.productId, "variants._id": t.variantId },
        { $inc: { "variants.$.stock": t.quantity } }
      ).catch(() => {});
    }
  };

  for (const line of wanted) {
    const meta = index.get(line.variantId);

    if (!meta) {
      await giveBack();
      await NcomReservation.deleteOne({ orderRef: ref }).catch(() => {});
      return { ok: false, rejected: [{ variantId: line.variantId, reason: "No longer sold" }] };
    }
    if (!meta.published) {
      await giveBack();
      await NcomReservation.deleteOne({ orderRef: ref }).catch(() => {});
      return { ok: false, rejected: [{ variantId: line.variantId, reason: "Not available" }] };
    }

    const res = await Product.updateOne(
      { _id: meta.productId, variants: { $elemMatch: { _id: line.variantId, stock: { $gte: line.quantity } } } },
      { $inc: { "variants.$.stock": -line.quantity } }
    );

    if (res.modifiedCount === 1) {
      taken.push({ productId: meta.productId, variantId: line.variantId, quantity: line.quantity });
      continue;
    }

    // Lost the race, or never had the stock. Undo this basket entirely, then
    // report what is actually left — the shopper is told which size ran out
    // rather than that the order failed.
    await giveBack();
    await NcomReservation.deleteOne({ orderRef: ref }).catch(() => {});

    const fresh = await Product.findOne(
      { "variants._id": line.variantId },
      { "variants._id": 1, "variants.stock": 1 }
    ).lean();
    const left = Math.max(0, Number(fresh?.variants?.find((v) => String(v._id) === line.variantId)?.stock) || 0);

    return {
      ok: false,
      rejected: [{
        variantId: line.variantId,
        reason: left > 0 ? `Only ${left} left` : "Sold out",
        available: left,
        requested: line.quantity,
      }],
    };
  }

  await NcomReservation.updateOne(
    { orderRef: ref },
    { $set: { state: "held", heldAt: new Date(), lines: taken.map((t) => ({ product: t.productId, variant: t.variantId, quantity: t.quantity })) } }
  );

  return { ok: true, held: taken.length };
}

/**
 * Hand held units back.
 *
 * Driven off what we recorded at reserve time, not off what the caller sends:
 * a release arrives when an order is cancelled, when a parcel comes back and
 * when a checkout failed after the hold, and only our own record knows what was
 * actually taken. A second release for the same reference does nothing.
 */
export async function releaseUnits(orderRef) {
  const ref = String(orderRef || "").trim().slice(0, 128);
  if (!ref) return { ok: false, error: "orderRef is required." };

  // Flip to released first, and only act if this call is the one that flipped
  // it — two concurrent releases must not both credit the stock.
  const claimed = await NcomReservation.findOneAndUpdate(
    { orderRef: ref, state: "held" },
    { $set: { state: "released", releasedAt: new Date() } },
    { new: false }
  ).lean();

  if (!claimed) {
    // Never held, or already given back. Either way there is nothing owed, and
    // saying so is the correct answer to a retry.
    return { ok: true, released: 0, noop: true };
  }

  let released = 0;
  for (const line of claimed.lines || []) {
    const quantity = Math.max(0, Number(line.quantity) || 0);
    if (!quantity) continue;
    await Product.updateOne(
      { _id: line.product, "variants._id": line.variant },
      { $inc: { "variants.$.stock": quantity } }
    ).catch((e) => console.error("[ncom] release failed for", String(line.variant), e.message));
    released += quantity;
  }

  return { ok: true, released };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// Flat, with parentId — the shape that survives whatever depth a browse tree
// grows to, and the one a consumer can rebuild a nested tree from in a line.
export async function categoryTree(origin) {
  const categories = await Category.find(
    { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
    { name: 1, slug: 1, parent: 1, sortOrder: 1 }
  )
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  return categories.map((c) => ({
    id: String(c._id),
    handle: c.slug,
    name: c.name,
    parentId: c.parent ? String(c.parent) : null,
    position: c.sortOrder ?? 0,
    url: origin ? `${origin}/shop?category=${encodeURIComponent(c.slug)}` : undefined,
  }));
}

export { PRICE_CURRENCY };
