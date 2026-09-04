import crypto from "node:crypto";

// The one signing scheme this integration uses, in both directions.
//
// ncom signs every request it makes to our connector, and every webhook it
// delivers, exactly the same way:
//
//     X-NCOM-Signature: t=<unix seconds>,v1=<hex hmac-sha256>
//     hmac = HMAC_SHA256(secret, "<t>." + <raw request body>)
//
// For a GET the signed body is the empty string, which is why a GET signature
// is taken over "<t>." with nothing after the dot.
//
// Kept in its own module, importing nothing but node:crypto, so the CLI
// conformance checker (scripts/ncom-check.mjs) can sign requests without
// dragging Next.js, mongoose or the rest of the app into a plain-node process.

// Anything older than this is a replay of a captured request, not a live call.
export const SKEW_SECONDS = 300;

const HEX_64 = /^[0-9a-f]{64}$/i;
const UNIX_SECONDS = /^\d{1,15}$/;

/** Parse `t=…,v1=…` into an object. Tolerates spaces and extra fields. */
export function parseSignatureHeader(header) {
  const parts = {};
  for (const piece of String(header || "").split(",")) {
    const eq = piece.indexOf("=");
    if (eq === -1) continue;
    parts[piece.slice(0, eq).trim()] = piece.slice(eq + 1).trim();
  }
  return parts;
}

/**
 * The hex digest for a given timestamp + raw body.
 *
 * `rawBody` must be the exact bytes — a string that was JSON.parse'd and
 * re-stringified produces different bytes and will never match. Buffers are
 * concatenated rather than interpolated: `${buffer}` stringifies as UTF-8,
 * which happens to work until a payload carries anything that is not.
 */
export function signPayload(secret, timestamp, rawBody = "") {
  const prefix = Buffer.from(`${timestamp}.`, "utf8");
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  return crypto.createHmac("sha256", secret).update(Buffer.concat([prefix, body])).digest("hex");
}

/** The full header value to send with a request we are making. */
export function signatureHeader(secret, rawBody = "", timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, rawBody)}`;
}

/** Constant-time hex comparison that cannot throw on malformed input. */
export function hexEquals(a, b) {
  if (!HEX_64.test(a || "") || !HEX_64.test(b || "")) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time comparison of two opaque credentials (a key id, say).
 *
 * Hashing first means the comparison is always over two 32-byte buffers, so
 * neither the length nor the content of the expected value leaks through the
 * time it takes to answer — timingSafeEqual throws outright on a length
 * mismatch, which is itself an oracle.
 */
export function secretEquals(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? ""), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b ?? ""), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Verify an inbound `X-NCOM-Signature`.
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }` — the reason is for our own
 * logs and the admin panel, never for the caller, who is told nothing beyond
 * 401. Volunteering "stale timestamp" vs "signature mismatch" to an
 * unauthenticated stranger tells them which half of the forgery to fix.
 */
export function verifySignature(secret, rawBody, header, { now = Date.now() } = {}) {
  if (!secret) return { ok: false, reason: "no signing secret configured" };

  const parts = parseSignatureHeader(header);
  if (!parts.t || !parts.v1) return { ok: false, reason: "malformed signature header" };
  if (!UNIX_SECONDS.test(parts.t)) return { ok: false, reason: "malformed timestamp" };

  const skew = Math.abs(now / 1000 - Number(parts.t));
  if (skew > SKEW_SECONDS) {
    return { ok: false, reason: `timestamp is ${Math.round(skew)}s out — check the server clock`, skew };
  }

  // Sign with the timestamp token exactly as it arrived. Re-formatting it
  // through Number() would silently change what is being hashed for any value
  // that does not round-trip.
  if (!hexEquals(signPayload(secret, parts.t, rawBody), parts.v1)) {
    return { ok: false, reason: "signature mismatch" };
  }

  return { ok: true, timestamp: Number(parts.t) };
}
