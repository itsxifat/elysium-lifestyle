import { NextResponse } from "next/server";

// Zero-dependency in-memory rate limiter (fixed window) for a single self-hosted
// Node process — module state persists across requests, so a plain Map works.
// Keyed by client IP (+ a label per endpoint). Not for multi-instance/serverless
// deploys; swap the Map for Redis/Mongo if you ever scale horizontally.

const store = new Map(); // key -> { count, resetAt }

// Periodic sweep so the Map can't grow unbounded. unref() keeps it from holding
// the process open. Guarded so hot-reload in dev doesn't stack intervals.
if (!globalThis.__rateLimitSweeper) {
  globalThis.__rateLimitSweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000);
  if (typeof globalThis.__rateLimitSweeper.unref === "function") {
    globalThis.__rateLimitSweeper.unref();
  }
}

/**
 * Extract the client IP from a Request / NextRequest / next-auth req / Headers.
 * Behind Nginx the real IP is the first entry of X-Forwarded-For.
 */
export function getClientIp(input) {
  const get = (name) => {
    if (!input) return null;
    const h = input.headers ?? input;
    if (h && typeof h.get === "function") return h.get(name);
    if (h && typeof h === "object") return h[name] ?? h[name.toLowerCase()] ?? null;
    return null;
  };
  const xff = get("x-forwarded-for");
  if (xff) return String(xff).split(",")[0].trim();
  const real = get("x-real-ip");
  if (real) return String(real).trim();
  return "unknown";
}

/**
 * Count a hit against `key`. Returns { ok, remaining, retryAfter, resetAt }.
 * `ok` is false once `limit` hits within the rolling `windowMs`.
 */
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;
  const ok = entry.count <= limit;
  return {
    ok,
    limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    resetAt: entry.resetAt,
  };
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(result) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } }
  );
}

/**
 * Convenience guard for route handlers:
 *   const limited = checkRateLimit(request, "login", { limit: 8, windowMs: 600000 });
 *   if (limited) return limited;     // already a 429 NextResponse
 */
export function checkRateLimit(request, label, opts) {
  const ip = getClientIp(request);
  const result = rateLimit(`${label}:${ip}`, opts);
  return result.ok ? null : tooManyRequests(result);
}
