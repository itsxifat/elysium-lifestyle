// Relative imports throughout: scripts/ncom-*.mjs import this module directly
// with plain node, which has no "@/" alias resolution. models/Settings.js
// imports nothing but mongoose, so it is safe to pull in here.
import { sizeCode } from "./sku.js";
import { cdnAbsoluteUrl } from "./cdn.js";
import Settings from "../models/Settings.js";

// ncom.bd integration — catalogue push + two-way stock sync.
//
// Ships INERT: with no API key configured every helper here is a no-op, so the
// storefront behaves exactly as it does today. Same pattern as the tracking +
// courier integrations.
//
// Credentials come from the DB (Settings.ncom, managed at /admin/ncom) so the
// VPS needs no redeploy to change them. Env vars still WIN if set, so an
// existing env-configured deployment keeps working untouched:
//
//   NCOM_API_KEY         write-scoped key from Developers → API keys
//   NCOM_WEBHOOK_SECRET  signing secret for the inbound /api/ncom-webhook route
//   NCOM_API_URL         override for the base URL
//
// Money: ncom takes MINOR units of the workspace currency. Our prices are whole
// taka, so priceCents = taka * 100. That is only correct while the ncom
// workspace currency is BDT — set it under the workspace settings before
// importing, or every price reads as USD.

export const NCOM_DEFAULT_API = "https://ncom.bd/api/v1";

// The currency our prices are actually denominated in. Sent as `expectCurrency`
// on every import so a workspace priced in anything else refuses the batch
// outright (409) instead of silently reading ৳1,290 as $1,290.00.
export const PRICE_CURRENCY = "BDT";

const envKey = () => (process.env.NCOM_API_KEY || "").trim();
const envSecret = () => (process.env.NCOM_WEBHOOK_SECRET || "").trim();

// Short cache so a burst of stock pushes doesn't re-query Settings per line.
// Invalidated explicitly when the admin panel saves.
let configCache = null;
let configCachedAt = 0;
const CONFIG_TTL_MS = 15_000;

export function invalidateNcomConfig() {
  configCache = null;
  configCachedAt = 0;
}

export async function getNcomConfig({ fresh = false } = {}) {
  if (!fresh && configCache && Date.now() - configCachedAt < CONFIG_TTL_MS) return configCache;

  let db = {};
  try {
    const settings = await Settings.findOne({}).select("ncom").lean();
    db = settings?.ncom || {};
  } catch {
    // No DB connection yet (a CLI script before connect, or a cold edge call).
    // Env-only config is still perfectly valid.
  }

  configCache = {
    // `enabled` gates the automatic outbound pushes only. Admin-panel actions
    // (test, migrate, reconcile) work as soon as a key exists — you want to
    // verify the connection before switching the sync on.
    enabled: Boolean(db.enabled),
    apiKey: envKey() || (db.apiKey || "").trim(),
    webhookSecret: envSecret() || (db.webhookSecret || "").trim(),
    baseUrl: (process.env.NCOM_API_URL || db.baseUrl || NCOM_DEFAULT_API).trim(),
    autoPushStock: db.autoPushStock !== false,
    source: envKey() ? "env" : db.apiKey ? "settings" : "none",
  };
  configCachedAt = Date.now();
  return configCache;
}

// True only when a key exists AND the admin switched the sync on.
export async function stockPushEnabled() {
  const cfg = await getNcomConfig();
  return Boolean(cfg.apiKey && cfg.enabled && cfg.autoPushStock);
}

export function takaToCents(taka) {
  return Math.round(Number(taka || 0) * 100);
}

export function centsToTaka(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export class NcomError extends Error {
  // `fields` carries per-field validation problems; `errors` carries per-row
  // ones (the inventory endpoint reports which SKUs it could not match there).
  constructor(code, message, fields, errors) {
    super(message);
    this.name = "NcomError";
    this.code = code;
    this.fields = fields || [];
    this.errors = errors || [];
  }
}

// One request, with 429 handling. `rate_limited` carries Retry-After in
// seconds; honouring it is cheaper than hammering and getting throttled harder.
// 5xx is retried with backoff, 4xx is not — a 422 will fail identically forever.
export async function ncomFetch(path, { method = "GET", body, retries = 3, key, baseUrl } = {}) {
  let apiKey = key;
  let api = baseUrl;
  if (!apiKey || !api) {
    const cfg = await getNcomConfig();
    apiKey = apiKey || cfg.apiKey;
    api = api || cfg.baseUrl;
  }
  if (!apiKey) throw new NcomError("unauthorized", "No ncom API key configured — add one at /admin/ncom");

  let attempt = 0;
  for (;;) {
    let response;
    try {
      response = await fetch(api + path, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      if (attempt++ >= retries) throw new NcomError("server_error", networkError.message);
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (response.status === 429 && attempt < retries) {
      const wait = Number(response.headers.get("retry-after")) || 2;
      attempt++;
      await sleep(wait * 1000);
      continue;
    }

    if (response.status >= 500 && attempt < retries) {
      attempt++;
      await sleep(500 * 2 ** attempt);
      continue;
    }

    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON body — fall through to the status-based error below */
    }

    if (!response.ok) {
      const err = payload.error || {};
      // Branch on code, never on message text — the docs are explicit that
      // messages get reworded and codes do not.
      throw new NcomError(
        err.code || `http_${response.status}`,
        err.message || `HTTP ${response.status}`,
        err.fields,
        err.errors
      );
    }

    return payload;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Walk a paginated list endpoint to completion.
export async function ncomList(path, { limit = 250, key, baseUrl } = {}) {
  const out = [];
  for (let page = 1; ; page++) {
    const joiner = path.includes("?") ? "&" : "?";
    const { data, pagination } = await ncomFetch(`${path}${joiner}page=${page}&limit=${limit}`, { key, baseUrl });
    out.push(...(data || []));
    if (!pagination?.hasMore) return out;
  }
}

// ---------------------------------------------------------------------------
// Mapping: our Product → their product shape
// ---------------------------------------------------------------------------

// Sizes that carry no real choice — a product whose only variant is one of
// these gets no Size option, because there is nothing for a shopper to pick.
const GENERIC_SIZES = new Set(["OS", "FS"]);

function isMeaningfulSize(size) {
  const code = sizeCode(size);
  return Boolean(code) && !GENERIC_SIZES.has(code);
}

// Turn our stored image values into URLs ncom's server can actually fetch.
//
// Product.images holds internal proxy paths (/api/img/<clientId>/<filename>),
// not URLs — and the CDN is domain-locked, so even the raw public CDN URL would
// 403 for an off-site fetcher. cdnAbsoluteUrl mints a lifetime *signed* URL,
// which bypasses the lock; already-absolute values (Unsplash, legacy) pass
// through untouched, and anything unusable comes back null.
//
// Requires CDN_API_SECRET. Without it signing throws, and rather than fail the
// whole product we drop the images — the caller reports how many were lost.
export function resolveImageUrls(product) {
  return (product.images || [])
    .map((value) => {
      try {
        return cdnAbsoluteUrl(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// `categoryMap` maps our Category _id (string) → their category id.
//
// Images are sent as source URLs; ncom fetches them server-side and dedupes on
// the URL, so a re-run costs nothing for artwork that hasn't changed. (This
// only works as of their 14 Aug 2026 release — before it, `images[].mediaId`
// was required and unobtainable, so images could not be synced at all.)
export function toNcomProduct(product, categoryMap = new Map()) {
  const variants = (product.variants || []).map((v) =>
    typeof v?.toObject === "function" ? v.toObject() : v
  );

  // Declare the Size option whenever any variant has a real size — including
  // single-variant products, where dropping it would silently lose the "M".
  const useOption = variants.some((v) => isMeaningfulSize(v.size));
  const values = [...new Set(variants.filter((v) => isMeaningfulSize(v.size)).map((v) => String(v.size).trim()))];

  const mapped = {
    externalId: String(product._id),
    title: product.name,
    description: product.description || "",
    status: product.isPublished ? "ACTIVE" : "DRAFT",
    tags: Array.isArray(product.tags) ? product.tags : [],
    options: useOption ? [{ name: "Size", position: 1, values }] : [],
    variants: variants.map((v) => ({
      option1: useOption && isMeaningfulSize(v.size) ? String(v.size).trim() : null,
      sku: v.sku || undefined,
      priceCents: takaToCents(v.price),
      inventoryTracked: true,
    })),
  };

  const categoryId = product.category ? categoryMap.get(String(product.category)) : null;
  if (categoryId) mapped.categoryId = categoryId;
  if (product.material) mapped.productType = product.material;

  const images = resolveImageUrls(product);
  if (images.length) {
    mapped.images = images.map((src, i) => ({ src, altText: product.name, position: i }));
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// Inventory push (us → them)
// ---------------------------------------------------------------------------

// Report a stock movement as a signed delta. Deltas compose where absolute
// writes overwrite, so this is what every concurrent sale path uses; absolute
// counts are reserved for the nightly reconcile.
//
// Fire-and-forget by design: a stock sync must never fail a customer's
// checkout, so callers do not await this and it never throws.
export async function reportStockDelta(lines, { reason = "MANUAL", note = "" } = {}) {
  if (!(await stockPushEnabled())) return null;

  const updates = (lines || [])
    .filter((l) => l.sku && Number(l.delta))
    .map((l) => ({
      sku: l.sku,
      delta: Number(l.delta),
      reason,
      ...(note ? { note } : {}),
    }));

  if (!updates.length) return null;

  // 250 updates per request is their cap.
  const batches = [];
  for (let i = 0; i < updates.length; i += 250) batches.push(updates.slice(i, i + 250));

  return Promise.all(
    batches.map((batch) =>
      ncomFetch("/inventory", { method: "POST", body: { updates: batch } })
        .then((res) => {
          // A 200 is not proof the stock moved: the endpoint applies what it
          // can and reports the rest. Since their 14 Aug 2026 release this is
          // the ONLY shape — a batch where nothing applied is 200 with
          // applied:0, not a 422.
          for (const f of res?.data?.errors || []) {
            console.error(`[ncom] stock not applied for ${f.sku}: ${f.error}`);
          }
          // A clamp is the moment our side believes it removed stock that was
          // never there — i.e. exactly where the two systems start to disagree.
          // Worth its own line rather than being folded into "applied".
          for (const c of res?.data?.clamps || []) {
            console.warn(`[ncom] stock clamped for ${c.sku}: asked ${c.requested}, applied ${c.applied}, now ${c.available}`);
          }
          return res;
        })
        .catch((e) => {
          const detail = (e.errors || []).map((f) => `${f.sku}: ${f.error}`).join("; ");
          console.error("[ncom] inventory push failed:", e.code, e.message, detail);
          return null;
        })
    )
  );
}

// Absolute counts — "there are 42". Only for the nightly reconcile, where we
// are the authority and nothing is selling.
export async function reportStockAbsolute(lines) {
  const cfg = await getNcomConfig();
  if (!cfg.apiKey) return null;
  const updates = (lines || [])
    .filter((l) => l.sku && Number.isFinite(Number(l.available)))
    .map((l) => ({ sku: l.sku, available: Number(l.available) }));
  if (!updates.length) return null;

  const results = [];
  for (let i = 0; i < updates.length; i += 250) {
    results.push(await ncomFetch("/inventory", { method: "POST", body: { updates: updates.slice(i, i + 250) } }));
  }
  return results;
}

// Order items are { product, size, quantity }; the SKU lives on the matching
// variant. Resolve them into SKU-keyed deltas without a second DB round-trip
// per line.
export async function stockLinesForOrderItems(ProductModel, items, sign = -1) {
  const ids = [...new Set((items || []).map((i) => String(i.product)).filter(Boolean))];
  if (!ids.length) return [];

  const products = await ProductModel.find({ _id: { $in: ids } })
    .select("variants.size variants.sku")
    .lean();

  const skuFor = new Map();
  for (const p of products) {
    for (const v of p.variants || []) {
      if (v.sku) skuFor.set(`${p._id}:${v.size}`, v.sku);
    }
  }

  return (items || [])
    .map((i) => ({
      sku: skuFor.get(`${i.product}:${i.size}`),
      delta: sign * Number(i.quantity || 0),
    }))
    .filter((l) => l.sku && l.delta);
}

// SKU allocation lives in scripts/ncom-backfill-skus.mjs — it is a one-time
// operation against raw collections, and keeping Settings out of this module is
// what lets the plain-node scripts import it.
