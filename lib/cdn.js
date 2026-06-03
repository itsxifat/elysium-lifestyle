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

/**
 * Generate a time-limited, tamper-proof signed CDN URL. Signed URLs bypass
 * domain locking, so they work for server-side fetches (image optimizer,
 * og:image crawlers, email links).
 */
export function signedCdnUrl(clientId, filename, expiresSeconds = 300) {
  if (!API_SECRET) {
    throw new Error("CDN_API_SECRET is not configured");
  }
  const expires = Math.floor(Date.now() / 1000) + expiresSeconds;
  const stringToSign = `${clientId}/${filename}|${expires}`;
  const token = crypto.createHmac("sha256", API_SECRET).update(stringToSign).digest("hex");
  return `${CDN_BASE_URL}/d/${clientId}/${filename}?expires=${expires}&token=${token}`;
}
