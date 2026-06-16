import crypto from "crypto";

// Tiny, dependency-free signed token for the native scanner app.
//
// NextAuth's session is cookie/JWT based and can't be ridden by a native app,
// so the app logs in once (email + password) and gets one of these tokens to
// send as `Authorization: Bearer <token>` on every request. It's an HS256-style
// token (`base64url(payload).base64url(hmac)`) signed with NEXTAUTH_SECRET — the
// same trust root the rest of auth already uses. We re-read the user from the DB
// on every request (see lib/scanner-auth.js) so a demote/disable takes effect
// immediately, exactly like the NextAuth jwt() callback does.

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (str) =>
  Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function secret() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) throw new Error("NEXTAUTH_SECRET is not set");
  return s;
}

function sign(body) {
  return b64url(crypto.createHmac("sha256", secret()).update(body).digest());
}

// Issue a token. `payload` is any small JSON object; we add `iat`/`exp`.
export function signToken(payload, { expiresInSec = 60 * 60 * 24 * 30 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec }));
  return `${body}.${sign(body)}`;
}

// Verify a token. Returns the payload object, or null if anything is off
// (bad shape, bad signature, or expired). Signature check is timing-safe.
export function verifyToken(token) {
  try {
    if (typeof token !== "string") return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;

    const expected = sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(fromB64url(body).toString("utf8"));
    if (!payload?.exp || Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
