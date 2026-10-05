import "server-only";

import { createHmac, randomUUID } from "node:crypto";

// The website's only backend: the brand ERP's storefront API (`/storefront/v1/*`).
//
// Server-only. Every request is signed with the website key (ERP_SITE_KEY_ID /
// ERP_SITE_SECRET, issued on the ERP's Website → Connection screen) exactly as
// docs/storefront-api.md describes:
//
//   GET          <timestamp>.GET.<path and query>
//   POST, PATCH  <timestamp>.<METHOD>.<path and query>.<idempotency key>.<raw body>
//
// The path and query are signed exactly as sent, and the body is serialised once
// and that same string is sent, so the signature always covers the bytes the ERP
// receives. Shoppers' browsers never call the ERP: they call this site's own
// pages and /api routes, which call this module.
//
// Reads (GET) are kept in a short in-process cache that follows the ERP's own
// ETag and Cache-Control (max-age, stale-while-revalidate, no-store): a fresh
// copy is served from memory, a stale one is revalidated with If-None-Match, and
// if the ERP cannot be reached a copy inside its stale-while-revalidate window is
// served rather than an error page. Personal answers (accounts, orders) are
// `no-store` at the ERP and are never cached here.

const SIGNED_PREFIX = "/storefront/v1/";
const GET_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 20_000;
const CACHE_LIMIT = 500;

/** A refusal or failure from the ERP, with the problem+json `code` it sent. */
export class ErpError extends Error {
  constructor({ status, code, title, detail, problem = null, retryAfter = null }) {
    super(detail || title || code || `ERP answered ${status}`);
    this.name = "ErpError";
    this.status = status;
    this.code = code || (status === 0 ? "ERP_UNREACHABLE" : `HTTP_${status}`);
    this.title = title || "";
    this.detail = detail || "";
    // The whole problem document: some refusals carry more than a sentence
    // (`quote` on CART_REPRICED, `lines` on OUT_OF_STOCK).
    this.problem = problem;
    this.retryAfter = retryAfter;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

/** The ERP is not configured for this server (missing env). */
export class ErpNotConfigured extends ErpError {
  constructor(missing) {
    super({ status: 0, code: "ERP_NOT_CONFIGURED", detail: `Missing ${missing.join(", ")}` });
    this.name = "ErpNotConfigured";
  }
}

function config() {
  const url = (process.env.ERP_API_URL || "").trim().replace(/\/+$/, "");
  const keyId = (process.env.ERP_SITE_KEY_ID || "").trim();
  const secret = (process.env.ERP_SITE_SECRET || "").trim();
  const missing = [
    !url && "ERP_API_URL",
    !keyId && "ERP_SITE_KEY_ID",
    !secret && "ERP_SITE_SECRET",
  ].filter(Boolean);
  if (missing.length) throw new ErpNotConfigured(missing);
  // ERP_API_URL is an origin only. A path prefix that a proxy strips would make
  // every signature cover a different path from the one the ERP checks.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ErpNotConfigured(["a valid ERP_API_URL"]);
  }
  if (parsed.pathname !== "/" || parsed.search) {
    throw new ErpNotConfigured(["ERP_API_URL as an origin (no path)"]);
  }
  return { origin: parsed.origin, keyId, secret };
}

/** The three signing headers for one request. */
export function signRequest({ method, pathAndQuery, idempotencyKey = "", rawBody = "", keyId, secret, now = Date.now() }) {
  const timestamp = String(Math.floor(now / 1000));
  const base =
    method === "GET"
      ? `${timestamp}.GET.${pathAndQuery}`
      : `${timestamp}.${method}.${pathAndQuery}.${idempotencyKey}.${rawBody}`;
  const signature = createHmac("sha256", secret).update(base).digest("hex");
  return {
    "X-Api-Key": keyId,
    "X-Api-Timestamp": timestamp,
    "X-Api-Signature": `sha256=${signature}`,
  };
}

/** A path and query string built safely: `erpPath("/catalog/products", { q })`. */
export function erpPath(path, query = {}) {
  const clean = path.startsWith("/storefront/") ? path : `${SIGNED_PREFIX}${path.replace(/^\/+/, "")}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${clean}?${qs}` : clean;
}

// --- the read cache ----------------------------------------------------------------------------

const cache = globalThis.__erpReadCache || (globalThis.__erpReadCache = new Map());
const inFlight = globalThis.__erpInFlight || (globalThis.__erpInFlight = new Map());

function cacheControlOf(header) {
  const out = { noStore: false, maxAge: 0, swr: 0 };
  for (const part of String(header || "").toLowerCase().split(",")) {
    const [name, value] = part.trim().split("=");
    if (name === "no-store" || name === "no-cache") out.noStore = true;
    else if (name === "max-age") out.maxAge = Math.max(0, Number(value) || 0);
    else if (name === "stale-while-revalidate") out.swr = Math.max(0, Number(value) || 0);
  }
  return out;
}

function personal(pathAndQuery) {
  return /^\/storefront\/v1\/(accounts|orders|payments|checkout|cart)\b/.test(pathAndQuery);
}

function remember(pathAndQuery, entry) {
  if (cache.size >= CACHE_LIMIT) {
    // Oldest insertion first: good enough for a few hundred short-lived reads.
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.delete(pathAndQuery);
  cache.set(pathAndQuery, entry);
}

/**
 * Forget cached reads (all, or those whose path starts with `prefix`): after a
 * write that changes what a page shows, such as a checkout holding stock.
 */
export function forgetReads(prefix = "") {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}

// --- transport ---------------------------------------------------------------------------------

async function problemOf(response) {
  const retryAfter = Number(response.headers.get("retry-after")) || null;
  let body = null;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return new ErpError({
    status: response.status,
    code: body?.code,
    title: body?.title,
    detail: body?.detail,
    problem: body,
    retryAfter,
  });
}

function logPath(pathAndQuery) {
  // Never log a query: an order's view token travels in one.
  return pathAndQuery.split("?")[0];
}

async function send({ method, pathAndQuery, body, idempotencyKey = "", headers = {}, timeoutMs }) {
  const { origin, keyId, secret } = config();
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const signed = signRequest({ method, pathAndQuery, idempotencyKey, rawBody, keyId, secret });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${origin}${pathAndQuery}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...signed,
        ...headers,
      },
      body: method === "GET" ? undefined : rawBody,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    console.error(`[erp] ${method} ${logPath(pathAndQuery)} ${timedOut ? "timed out" : "unreachable"}`);
    throw new ErpError({
      status: 0,
      code: timedOut ? "ERP_TIMEOUT" : "ERP_UNREACHABLE",
      detail: "The shop is not reachable right now. Please try again.",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response, method, pathAndQuery) {
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }
  const error = await problemOf(response);
  if (error.status >= 500 || error.code === "UNAUTHENTICATED") {
    // UNAUTHENTICATED means the website key is wrong, revoked or the clock is off:
    // an operator problem. (A shopper's wrong password is a different 401.)
    console.error(`[erp] ${method} ${logPath(pathAndQuery)} → ${error.status} ${error.code}`);
  }
  throw error;
}

/**
 * A signed GET. `cache: false` skips the in-process cache (the ERP is still
 * free to answer from its own).
 */
export async function erpGet(pathAndQuery, { cache: useCache = true } = {}) {
  const cacheable = useCache && !personal(pathAndQuery);
  const now = Date.now();
  const hit = cacheable ? cache.get(pathAndQuery) : undefined;
  if (hit && now < hit.freshUntil) return hit.body;

  // One request per path at a time: a burst of identical reads shares it.
  const key = cacheable ? pathAndQuery : null;
  if (key && inFlight.has(key)) return inFlight.get(key);

  const run = (async () => {
    let response;
    try {
      response = await send({
        method: "GET",
        pathAndQuery,
        headers: hit?.etag ? { "If-None-Match": hit.etag } : {},
        timeoutMs: GET_TIMEOUT_MS,
      });
    } catch (error) {
      // The ERP is down: a copy inside its stale-while-revalidate window is
      // better than an error page.
      if (hit && Date.now() < hit.staleUntil) return hit.body;
      throw error;
    }

    const policy = cacheControlOf(response.headers.get("cache-control"));
    if (response.status === 304 && hit) {
      const at = Date.now();
      remember(pathAndQuery, { ...hit, freshUntil: at + policy.maxAge * 1000, staleUntil: at + (policy.maxAge + policy.swr) * 1000 });
      return hit.body;
    }
    if (response.status >= 500 && hit && Date.now() < hit.staleUntil) return hit.body;

    const body = await readJson(response, "GET", pathAndQuery);
    if (cacheable && !policy.noStore && policy.maxAge > 0) {
      const at = Date.now();
      remember(pathAndQuery, {
        body,
        etag: response.headers.get("etag"),
        freshUntil: at + policy.maxAge * 1000,
        staleUntil: at + (policy.maxAge + policy.swr) * 1000,
      });
    }
    return body;
  })();

  if (key) {
    inFlight.set(key, run);
    run.finally(() => inFlight.delete(key)).catch(() => {});
  }
  return run;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,255}$/;

/** A fresh idempotency key: one per "Place order" press. */
export function newIdempotencyKey() {
  return randomUUID();
}

export function isIdempotencyKey(value) {
  return typeof value === "string" && IDEMPOTENCY_KEY.test(value);
}

/**
 * A signed write. With an `idempotencyKey` the call is safe to repeat, so a
 * dropped connection or `IDEMPOTENCY_IN_FLIGHT` is retried with the same key;
 * without one it is sent once.
 */
export async function erpWrite(method, pathAndQuery, body, { idempotencyKey = "", timeoutMs = WRITE_TIMEOUT_MS } = {}) {
  if (idempotencyKey && !isIdempotencyKey(idempotencyKey)) {
    throw new ErpError({ status: 400, code: "IDEMPOTENCY_KEY_INVALID", detail: "Bad idempotency key." });
  }
  const attempts = idempotencyKey ? 3 : 1;
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await send({ method, pathAndQuery, body, idempotencyKey, timeoutMs });
      const json = await readJson(response, method, pathAndQuery);
      return { status: response.status, body: json, replayed: response.headers.get("idempotency-replayed") === "true" };
    } catch (error) {
      last = error;
      const retryable =
        idempotencyKey &&
        error instanceof ErpError &&
        (error.status === 0 || error.code === "IDEMPOTENCY_IN_FLIGHT");
      if (!retryable || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw last;
}

export const erpPost = (path, body, options) => erpWrite("POST", path, body, options);
export const erpPatch = (path, body, options) => erpWrite("PATCH", path, body, options);
