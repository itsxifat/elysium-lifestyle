import crypto from "crypto";

// EnCDN (cdn.enfinito.cloud) integration.
//
// Uploads run server-side with the API key/secret (no domain check on upload).
// Serving is domain-locked (whitelist mode), so the Next.js image optimizer —
// which fetches images server-side with no Referer — would get 403. To work
// around that we never hand a raw CDN URL to <Image>; instead we store an
// internal proxy path (/api/img/:clientId/:filename) and the proxy mints a
// short-lived *signed* URL on demand. Signed URLs bypass domain locking.

export const CDN_BASE_URL = "https://cdn.enfinito.cloud";

const API_KEY = process.env.CDN_API_KEY;
const API_SECRET = process.env.CDN_API_SECRET;

export function cdnConfigured() {
  return Boolean(API_KEY && API_SECRET);
}

/**
 * Upload a file buffer to EnCDN.
 * @returns {Promise<{ publicUrl: string, filename: string, clientId: string }>}
 */
export async function uploadToCDN(buffer, filename, mimeType) {
  if (!cdnConfigured()) {
    throw new Error("CDN credentials are not configured (CDN_API_KEY / CDN_API_SECRET)");
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), filename);

  const res = await fetch(`${CDN_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: {
      "X-CDN-API-Key": API_KEY,
      "X-CDN-API-Secret": API_SECRET,
    },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.media?.publicUrl) {
    throw new Error(data?.error || `CDN upload failed (${res.status})`);
  }

  const { publicUrl } = data.media;
  const parsed = parsePublicUrl(publicUrl);
  if (!parsed) throw new Error("CDN returned an unexpected publicUrl");

  return { publicUrl, ...parsed };
}

/**
 * Parse a CDN public URL of the form
 *   https://cdn.enfinito.cloud/d/<clientId>/<filename>
 * into { clientId, filename }.
 */
export function parsePublicUrl(publicUrl) {
  try {
    const { pathname } = new URL(publicUrl);
    const match = pathname.match(/^\/d\/([^/]+)\/([^/?#]+)$/);
    if (!match) return null;
    return { clientId: match[1], filename: match[2] };
  } catch {
    return null;
  }
}

/** Internal, same-origin path that <Image> can optimize safely. */
export function cdnProxyPath(clientId, filename) {
  return `/api/img/${encodeURIComponent(clientId)}/${encodeURIComponent(filename)}`;
}

/** Parse an internal proxy path (/api/img/<clientId>/<filename>). */
export function parseProxyPath(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^\/api\/img\/([^/]+)\/([^/?#]+)/);
  return m ? { clientId: decodeURIComponent(m[1]), filename: decodeURIComponent(m[2]) } : null;
}

/**
 * Resolve a stored value (proxy path OR raw CDN public URL) to its
 * { clientId, filename }. Returns null for anything else — legacy /uploads
 * paths, external URLs (Unsplash, Google avatars), placeholders — so callers
 * can safely no-op on non-CDN images.
 */
export function cdnRef(value) {
  return parseProxyPath(value) || parsePublicUrl(value);
}

// Far-future expiry (year 9999) for never-expiring "lifetime" signed links.
export const LIFETIME_EXPIRES = 253402300799;

function buildSignedUrl(clientId, filename, expires) {
  if (!API_SECRET) throw new Error("CDN_API_SECRET is not configured");
  const stringToSign = `${clientId}/${filename}|${expires}`;
  const token = crypto.createHmac("sha256", API_SECRET).update(stringToSign).digest("hex");
  return `${CDN_BASE_URL}/d/${clientId}/${filename}?expires=${expires}&token=${token}`;
}

/**
 * Time-limited, tamper-proof signed CDN URL. Signed URLs bypass domain
 * locking, so they work for server-side fetches (the image proxy uses this).
 */
export function signedCdnUrl(clientId, filename, expiresSeconds = 300) {
  return buildSignedUrl(clientId, filename, Math.floor(Date.now() / 1000) + expiresSeconds);
}

/** Never-expiring signed CDN URL — for permanent product images & avatars. */
export function lifetimeSignedCdnUrl(clientId, filename) {
  return buildSignedUrl(clientId, filename, LIFETIME_EXPIRES);
}

/**
 * Absolute, never-expiring URL for a stored image — used where an EXTERNAL
 * client fetches the file directly and can't go through the same-origin proxy:
 * og:image / social crawlers and email clients. Returns the value unchanged if
 * it's already an absolute URL, or null if there's nothing usable.
 */
export function cdnAbsoluteUrl(value) {
  const ref = cdnRef(value);
  if (ref) return lifetimeSignedCdnUrl(ref.clientId, ref.filename);
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  return null;
}

/**
 * Delete a file from the CDN given a stored value (proxy path or public URL).
 * Idempotent: a 404 (already gone) counts as success. Non-CDN values are
 * skipped. Never throws — deletion failures must not block the primary action.
 */
export async function deleteFromCDN(value) {
  const ref = cdnRef(value);
  if (!ref || !cdnConfigured()) return false;
  try {
    const res = await fetch(`${CDN_BASE_URL}/api/media/file/${encodeURIComponent(ref.filename)}`, {
      method: "DELETE",
      headers: { "X-CDN-API-Key": API_KEY, "X-CDN-API-Secret": API_SECRET },
    });
    if (res.ok || res.status === 404) return true;
    console.error(`CDN delete failed for ${ref.filename}: ${res.status}`);
    return false;
  } catch (err) {
    console.error(`CDN delete error for ${ref.filename}:`, err.message);
    return false;
  }
}
