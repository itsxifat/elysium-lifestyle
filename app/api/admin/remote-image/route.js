export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import dns from "node:dns/promises";
import net from "node:net";
import { requireStaff } from "@/lib/auth";

// Same-origin proxy for images hosted anywhere else.
//
// Our own product photos are stored as relative /api/img/... paths and render
// directly. An order that arrived from a partner — an ncom.bd line, whose photo
// lives on whatever host their page used — carries an absolute URL to a host we
// cannot know in advance, and two separate rules make that image invisible in
// the admin panel:
//
//   1. the Content-Security-Policy in middleware.js allows `img-src` only from
//      ourselves and a handful of named CDNs, so the browser blocks it, and
//   2. next/image refuses any host missing from `images.remotePatterns`.
//
// Whitelisting hosts cannot fix this: the point of a partner order is that we
// do not know where its pictures live. Fetching the bytes here instead makes
// every image same-origin, which satisfies both rules at once, for any source.
//
// Staff-only, and hardened against being used as a way to reach things inside
// the network — see isPubliclyRoutable below.

const CACHE_CONTROL = "private, max-age=3600, stale-while-revalidate=86400";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB — a product photo, generously
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

/**
 * Is this address one the public internet can route to?
 *
 * The proxy fetches a URL chosen by whoever sent us the order, so without this
 * it is a request-forwarder aimed at anything our server can reach: the
 * metadata service on the VPS, the database on localhost, another service on
 * the private subnet. Every private, loopback, link-local, carrier-NAT and
 * otherwise special range is refused.
 */
function isPubliclyRoutable(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false; // this host, private, loopback
    if (a === 169 && b === 254) return false; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier NAT
    if (a === 192 && b === 0) return false; // protocol assignments
    if (a >= 224) return false; // multicast + reserved
    return true;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return false;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb"))
      return false; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return false; // unique-local
    // IPv4 mapped/compatible — judge the address it actually carries.
    const mapped = lower.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPubliclyRoutable(mapped[1]);
    return true;
  }
  return false;
}

/** Parse + vet one hop. Returns the URL to fetch, or an error string. */
async function vet(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "Not a URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Unsupported scheme" };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (!isPubliclyRoutable(host)) return { error: "Blocked address" };
    return { url };
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    return { error: "Host not found" };
  }
  // ALL resolved addresses must be routable: a name that answers with one
  // public and one private address would otherwise be a way through.
  if (!addresses.length || !addresses.every((a) => isPubliclyRoutable(a.address))) {
    return { error: "Blocked address" };
  }
  return { url };
}

function fail(status, message) {
  return new Response(message, { status, headers: { "Cache-Control": "private, max-age=30" } });
}

export async function GET(request) {
  const { error } = await requireStaff();
  if (error) return error;

  const target = new URL(request.url).searchParams.get("url");
  if (!target) return fail(400, "Missing url");

  let next = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const vetted = await vet(next);
    if (vetted.error) return fail(400, vetted.error);

    let upstream;
    try {
      upstream = await fetch(vetted.url, {
        redirect: "manual", // each hop is vetted, never blindly followed
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        headers: { Accept: "image/*" },
      });
    } catch {
      return fail(502, "Could not fetch image");
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) return fail(502, "Bad redirect");
      next = new URL(location, vetted.url).toString();
      continue;
    }

    if (!upstream.ok) return fail(upstream.status === 404 ? 404 : 502, "Image not available");

    const type = upstream.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return fail(415, "Not an image");

    const declared = Number(upstream.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return fail(413, "Image too large");

    // Buffered rather than streamed so the cap is enforced even when the host
    // declares no length — a proxy with no ceiling is a memory bill.
    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return fail(413, "Image too large");

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": CACHE_CONTROL,
        // Never let a proxied image be read as markup, whatever the host said.
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  }

  return fail(502, "Too many redirects");
}
