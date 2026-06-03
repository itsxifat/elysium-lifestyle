import { signedCdnUrl, cdnConfigured } from "@/lib/cdn";

// Same-origin proxy for CDN images. The Next.js image optimizer fetches this
// route server-side; we mint a short-lived signed CDN URL (which bypasses
// domain locking) and stream the bytes back. Responses are immutable because
// CDN filenames are content-addressed UUIDs.
export async function GET(_request, { params }) {
  if (!cdnConfigured()) {
    return new Response("CDN not configured", { status: 500 });
  }

  const { clientId, filename } = params;
  if (!clientId || !filename) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const url = signedCdnUrl(clientId, filename, 300);
    const upstream = await fetch(url, { cache: "no-store" });

    if (!upstream.ok) {
      return new Response("Image not found", { status: upstream.status });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("CDN proxy error:", err);
    return new Response("Upstream error", { status: 502 });
  }
}
