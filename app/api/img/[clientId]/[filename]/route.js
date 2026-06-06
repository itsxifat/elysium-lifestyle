import { signedCdnUrl, cdnConfigured } from "@/lib/cdn";

// Same-origin proxy for CDN images. The Next.js image optimizer fetches this
// route server-side; we mint a short-lived signed CDN URL (which bypasses
// domain locking) and stream the bytes back.
//
// Caching: filenames are content-addressed UUIDs, so a given URL never changes
// content — but a *deleted* file must stop being served. We therefore use a
// short max-age with a long stale-while-revalidate window: caches serve the
// bytes instantly while revalidating in the background, so when the upstream
// starts returning 404 the image is purged everywhere within ~10 minutes
// without ever making a visitor wait. (This max-age also drives the Next image
// optimizer's disk-cache TTL — kept in sync via images.minimumCacheTTL.)
const CACHE_CONTROL = "public, max-age=600, stale-while-revalidate=86400";
// Negative responses are cached briefly so a deleted/invalid file doesn't
// hammer the CDN, but clears fast.
const NEGATIVE_CACHE_CONTROL = "public, max-age=60";

// CDN path segments are UUID-style; reject anything else before signing so we
// can't be tricked into signing a crafted path.
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function GET(_request, { params }) {
  if (!cdnConfigured()) {
    return new Response("CDN not configured", { status: 500 });
  }

  const { clientId, filename } = params;
  if (!clientId || !filename || !SAFE_SEGMENT.test(clientId) || !SAFE_SEGMENT.test(filename)) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": NEGATIVE_CACHE_CONTROL },
    });
  }

  try {
    const url = signedCdnUrl(clientId, filename, 300);
    const upstream = await fetch(url, { cache: "no-store" });

    if (!upstream.ok) {
      // Deleted or missing — surface the status and let caches drop it fast.
      return new Response("Image not found", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": NEGATIVE_CACHE_CONTROL },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (err) {
    console.error("CDN proxy error:", err);
    return new Response("Upstream error", { status: 502 });
  }
}
