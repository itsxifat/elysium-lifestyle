// Relative imports throughout: scripts/ncom-*.mjs import this module directly
// with plain node, which has no "@/" alias resolution. models/Settings.js
// imports nothing but mongoose, so it is safe to pull in here.
import Settings from "../models/Settings.js";

// ncom.bd integration — CONTRACT 1.
//
// ── What changed, and why every file in this integration moved ──────────────
// ncom used to store a copy of our catalogue: we pushed products, categories
// and opening stock through /api/v1/products/import, and mirrored every sale
// back as an inventory delta. Two databases held one price, and keeping them in
// step was the whole job.
//
// Under contract 1 there is no copy. ncom asks THIS server what we sell, what
// it costs and how many are left, on every page view, every cart and every
// checkout. So the direction of the integration reverses:
//
//   * we HOST a small read-only endpoint group  →  app/api/ncom/v1/*
//   * ncom signs every request it makes to it   →  lib/ncom-connector.js
//   * stock moves through /reserve + /release   →  our DB decides who wins
//   * nothing is imported, so nothing can drift
//
// This module is what is left of the OUTBOUND side: the REST client used for
// the handshake (/me), reading orders back, and managing webhook endpoints. It
// no longer pushes a catalogue and no longer pushes stock — both of those now
// happen by ncom reading us.
//
// Ships INERT: with no key configured every helper here is a no-op and the
// storefront behaves exactly as it does today.
//
// Credentials come from the DB (Settings.ncom, managed at /admin/ncom) so the
// VPS needs no redeploy to change them. Env vars still WIN if set:
//
//   NCOM_API_KEY            REST key from Developers → API keys
//   NCOM_WEBHOOK_SECRET     signing secret for inbound /api/ncom-webhook
//   NCOM_CONNECTOR_KEY      key id ncom sends as X-NCOM-Key   (Settings → Product source)
//   NCOM_CONNECTOR_SECRET   HMAC secret ncom signs its reads with
//   NCOM_API_URL            override for the REST base URL

export const NCOM_DEFAULT_API = "https://ncom.bd/api/v1";

// The contract version we implement. Sent back on /ping and checked against the
// X-NCOM-Contract header on every inbound connector request.
export const CONNECTOR_CONTRACT = "1";

// Where our connector lives. This is the path an admin pastes into
// Settings → Product source, after the site's own origin.
export const CONNECTOR_BASE_PATH = "/api/ncom/v1";

// The currency our prices are actually denominated in. ncom interprets the
// prices it reads from us in the WORKSPACE currency and cannot detect a
// mismatch, so /ping declares this and the connection panel compares.
export const PRICE_CURRENCY = "BDT";

const env = (name) => (process.env[name] || "").trim();

// Short cache so a burst of connector reads doesn't re-query Settings per
// request. Invalidated explicitly when the admin panel saves.
//
// Disabled under DEMO_MODE: the cache is module state and Settings is
// per-sandbox there, so one tenant's credentials must never be served to
// another's request.
let configCache = null;
let configCachedAt = 0;
const CONFIG_TTL_MS = 15_000;

export function invalidateNcomConfig() {
  configCache = null;
  configCachedAt = 0;
}

// Capability defaults. `reserve`/`release` are the consequential pair: with them
// our database decides which of two shoppers gets the last unit, without them
// ncom checks stock moments before writing the order and no more.
function capabilitiesOf(db = {}) {
  return {
    products: true, // required — always served
    stock: true, // required in practice; a cart cannot render without it
    search: db.allowSearch !== false,
    categories: db.allowCategories !== false,
    reserve: db.allowReserve !== false,
    release: db.allowReserve !== false, // one switch: a hold you cannot return is worse than no hold
  };
}

export async function getNcomConfig({ fresh = false } = {}) {
  const cacheable = !process.env.DEMO_MODE;
  if (!fresh && cacheable && configCache && Date.now() - configCachedAt < CONFIG_TTL_MS) {
    return configCache;
  }

  let db = {};
  let vendor = "";
  try {
    // One read, not two: the connector needs the shop's display name on every
    // serialised product, and a second Settings query per request would be a
    // second query on a shopper's critical path.
    const settings = await Settings.findOne({}).select("ncom siteInfo.siteName").lean();
    db = settings?.ncom || {};
    vendor = settings?.siteInfo?.siteName || "";
  } catch {
    // No DB connection yet (a CLI script before connect, or a cold call).
    // Env-only config is still perfectly valid.
  }

  const cfg = {
    // Gates the connector: off means ncom is told the shop is not serving,
    // rather than being handed a catalogue nobody meant to publish.
    enabled: Boolean(db.enabled),

    // Outbound REST.
    apiKey: env("NCOM_API_KEY") || (db.apiKey || "").trim(),
    webhookSecret: env("NCOM_WEBHOOK_SECRET") || (db.webhookSecret || "").trim(),
    baseUrl: (env("NCOM_API_URL") || db.baseUrl || NCOM_DEFAULT_API).trim(),

    // Inbound connector. Both are issued by ncom when you press Connect on
    // Settings → Product source, and shown exactly once.
    connectorKeyId: env("NCOM_CONNECTOR_KEY") || (db.connectorKeyId || "").trim(),
    connectorSecret: env("NCOM_CONNECTOR_SECRET") || (db.connectorSecret || "").trim(),

    capabilities: capabilitiesOf(db),
    // Drafts are shown in their dashboard so a landing page can be built before
    // publishing — they are never sellable. Off hides them entirely.
    includeDrafts: db.includeDrafts !== false,
    // We carry no per-product weight, so one workspace-wide parcel weight is
    // offered for shipping labels. 0 omits weightGrams rather than lying.
    defaultWeightGrams: Math.max(0, Number(db.defaultWeightGrams) || 0),
    publicBaseUrl: (db.publicBaseUrl || "").trim(),
    vendor,

    source: env("NCOM_API_KEY") ? "env" : db.apiKey ? "settings" : "none",
    connectorSource: env("NCOM_CONNECTOR_SECRET") ? "env" : db.connectorSecret ? "settings" : "none",
  };

  if (cacheable) {
    configCache = cfg;
    configCachedAt = Date.now();
  }
  return cfg;
}

// True when ncom is allowed to read this shop right now.
export async function connectorLive() {
  const cfg = await getNcomConfig();
  return Boolean(cfg.enabled && cfg.connectorSecret);
}

export function takaToCents(taka) {
  return Math.round(Number(taka || 0) * 100);
}

export function centsToTaka(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

// The public origin this shop is reachable at — what ncom's landing pages point
// their product links and <img> tags at.
//
// The admin-entered value wins here, unlike every credential above where the
// env var does. A secret is pinned at deploy time on purpose; a URL is not, and
// a field that silently does nothing because someone set NEXT_PUBLIC_SITE_URL
// two deploys ago is a field nobody can debug. Blank falls back to the env var,
// which is what every other outbound URL in this app uses.
export function siteOrigin(cfg = {}) {
  const raw = (cfg.publicBaseUrl || "").trim() || env("NEXT_PUBLIC_SITE_URL");
  return String(raw || "").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// HTTP — outbound REST client
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
export async function ncomFetch(path, { method = "GET", body, retries = 3, key, baseUrl, timeoutMs = 15_000 } = {}) {
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
    // Never let a stalled upstream hold an admin request open indefinitely.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      response = await fetch(api + path, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: abort.signal,
        cache: "no-store",
      });
    } catch (networkError) {
      if (attempt++ >= retries) {
        throw new NcomError(
          "server_error",
          networkError.name === "AbortError" ? `Timed out after ${timeoutMs}ms` : networkError.message
        );
      }
      await sleep(500 * 2 ** attempt);
      continue;
    } finally {
      clearTimeout(timer);
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

// Walk a paginated list endpoint to completion. `max` is a hard stop so a
// runaway pagination cursor cannot spin forever against an admin request.
export async function ncomList(path, { limit = 250, key, baseUrl, max = 5000 } = {}) {
  const out = [];
  for (let page = 1; ; page++) {
    const joiner = path.includes("?") ? "&" : "?";
    const { data, pagination } = await ncomFetch(`${path}${joiner}page=${page}&limit=${limit}`, { key, baseUrl });
    out.push(...(data || []));
    if (!pagination?.hasMore || out.length >= max) return out;
  }
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

// Scopes worth having under contract 1. The catalogue write scopes are NOT
// among them: nothing here ever writes a product to ncom any more, and a key
// that can rewrite prices is a key that can destroy a shop if it leaks.
const WANTED_SCOPES = ["ORDERS_READ", "WEBHOOKS_READ", "WEBHOOKS_WRITE"];

export async function connectionStatus() {
  const cfg = await getNcomConfig({ fresh: true });
  if (!cfg.apiKey) {
    return { ok: false, configured: false, error: "No API key configured yet." };
  }

  try {
    const { data } = await ncomFetch("/me");
    const scopes = data.key?.scopes || [];
    const warnings = [];
    const org = data.organization || {};

    if (org.currencyCode && org.currencyCode !== PRICE_CURRENCY) {
      warnings.push(
        `Workspace currency is ${org.currencyCode}, but this shop's prices are ${PRICE_CURRENCY}. ncom reads ` +
        `the prices it fetches from us as workspace currency and nothing downstream can detect the ` +
        `mismatch — a ৳1,290 product would be sold as ${org.currencyCode} 1,290.00. Change it under ` +
        `Settings before connecting the product source.`
      );
    } else if (org.currencyConfigured === false) {
      // Right currency, but nobody ever chose it — so it is a default that
      // could change under you rather than a decision.
      warnings.push(
        `The workspace currency is ${org.currencyCode} but was never explicitly chosen. Set it in the ncom ` +
        `dashboard so it cannot shift beneath a live catalogue.`
      );
    }

    for (const scope of WANTED_SCOPES) {
      if (!scopes.includes(scope)) {
        warnings.push(`API key is missing the ${scope} permission — that part of this panel will not work.`);
      }
    }

    for (const scope of scopes) {
      if (scope === "PRODUCTS_WRITE" || scope === "INVENTORY_WRITE" || scope === "CATEGORIES_WRITE") {
        warnings.push(
          `This key still carries ${scope}. Nothing in this integration writes a catalogue to ncom any ` +
          `more — the shop is read live instead — so that permission only widens what a leaked key could do.`
        );
      }
    }

    return {
      ok: true,
      configured: true,
      source: cfg.source,
      organization: data.organization,
      key: data.key,
      scopes,
      warnings,
    };
  } catch (e) {
    return { ok: false, configured: true, source: cfg.source, error: e.message, code: e.code };
  }
}

// ---------------------------------------------------------------------------
// Orders (read-only over the API by design — see the docs on why)
// ---------------------------------------------------------------------------

export async function listNcomOrders({ page = 1, limit = 25 } = {}) {
  const { data, pagination } = await ncomFetch(`/orders?page=${page}&limit=${Math.min(250, limit)}`);
  return { orders: data || [], pagination: pagination || null };
}

export async function getNcomOrder(id) {
  const { data } = await ncomFetch(`/orders/${encodeURIComponent(id)}`);
  return data;
}

// ---------------------------------------------------------------------------
// Products ncom STORES (the other half of the catalogue)
// ---------------------------------------------------------------------------

// Products added in the ncom dashboard: campaign gifts, bundle-only items,
// samples. They are theirs, not ours — this is a read so the admin panel can
// show what exists over there alongside what we serve.
export async function listNcomStoredProducts({ page = 1, limit = 50 } = {}) {
  const { data, pagination } = await ncomFetch(`/products?page=${page}&limit=${Math.min(250, limit)}`);
  return { products: data || [], pagination: pagination || null };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

// Topics we subscribe to. Under contract 1 stock is ours and is never reported
// back to us, so inventory.updated is NOT here: subscribing to it would invite
// events about ncom's own products that we must not apply to ours.
export const WEBHOOK_TOPICS = [
  "order.created",
  "order.updated",
  "order.cancelled",
  "order.fulfilled",
  "order.held_for_review",
  "shipment.created",
  "shipment.updated",
  "shipment.delivered",
  "shipment.returned",
];

export async function listWebhooks() {
  const { data } = await ncomFetch("/webhooks");
  return data || [];
}

// Register our receiver, or update the existing registration if one already
// points at this URL.
//
// The signing secret is returned ONLY by create — GET and PATCH never expose
// it. So re-registering an endpoint that already exists cannot recover a secret
// nobody stored; the honest answer is to say so and offer to replace it, which
// mints a new one (and breaks the old until it is saved).
export async function registerWebhook(url, { replace = false } = {}) {
  const existing = await listWebhooks().catch(() => []);
  const match = existing.find((w) => w.url === url);

  if (match && !replace) {
    const { data } = await ncomFetch(`/webhooks/${match.id}`, {
      method: "PATCH",
      body: { topics: WEBHOOK_TOPICS, isActive: true },
    });
    return { updated: true, webhook: data, secret: null, secretUnavailable: true };
  }

  // Replacing: drop the old registration so create can issue a fresh secret.
  if (match && replace) {
    await ncomFetch(`/webhooks/${match.id}`, { method: "DELETE" }).catch(() => {});
  }

  const { data } = await ncomFetch("/webhooks", {
    method: "POST",
    body: { url, description: "Elysium storefront", topics: WEBHOOK_TOPICS },
  });
  return { created: true, replaced: Boolean(match), webhook: data, secret: data?.secret || null };
}
