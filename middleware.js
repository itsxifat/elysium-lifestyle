import { NextResponse } from "next/server";
import { resolveDemo } from "@enfinito/demo-kit/middleware";

// Per-request Content-Security-Policy with a fresh nonce.
//
// A nonce-based CSP is the strongest practical defense against XSS: even if an
// attacker injects a <script> tag, the browser refuses to run it without our
// per-request nonce (which they can't predict). Next.js App Router automatically
// reads the nonce from the `Content-Security-Policy` request header we set here
// and stamps it onto its own bootstrap scripts — so no manual wiring is needed.
//
// SAFE ROLLOUT: while REPORT_ONLY is true the browser only *reports* violations
// (to the console) instead of blocking, so a missed allowlist entry can't break
// checkout/login. Exercise Google login, SSLCommerz checkout, images and the
// admin panel, confirm zero violations, then set REPORT_ONLY=false to enforce.
const REPORT_ONLY = true;

const isDev = process.env.NODE_ENV !== "production";

function buildCsp(nonce) {
  // 'strict-dynamic' lets Next's nonce'd loader scripts pull in the rest of the
  // bundle without us enumerating every chunk. Dev needs 'unsafe-eval' for Fast
  // Refresh; production does not.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Tailwind compiles to a same-origin file, but next/font + styled-jsx inject
    // inline <style> tags, so inline styles must be allowed.
    "style-src 'self' 'unsafe-inline'",
    // Same-origin optimized images (/_next/image, /api/img), blob/data previews,
    // and the external hosts we render directly.
    "img-src 'self' data: blob: https://cdn.enfinito.cloud https://res.cloudinary.com https://images.unsplash.com https://plus.unsplash.com https://lh3.googleusercontent.com https://*.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src https://accounts.google.com https://*.sslcommerz.com",
    "form-action 'self' https://*.sslcommerz.com https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function middleware(request) {
  // ── Demo layer (no-op unless DEMO_MODE=1) ───────────────────────────────
  // Resolves which sandbox this request belongs to and enforces its expiry, on
  // the Edge, from a signed cookie alone. It runs first because an expired or
  // absent sandbox must never reach a handler.
  const demo = await resolveDemo(request);
  if (demo.response) return demo.response;

  const isApi = request.nextUrl.pathname.startsWith("/api");

  // Edge-safe random nonce (no Node Buffer/crypto).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const csp = buildCsp(nonce);

  // Next reads the nonce from the request-side CSP header; pass it through.
  const requestHeaders = new Headers(request.headers);
  if (!isApi) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }
  // Hand the resolved sandbox to the Node side; connectDB() reads these.
  for (const [key, value] of Object.entries(demo.headers)) requestHeaders.set(key, value);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // The browser enforces (or, while REPORT_ONLY, only reports) this header.
  // API responses are JSON with no scripts, and skipping them keeps their long
  // immutable caching untouched.
  if (!isApi) {
    response.headers.set(
      REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      csp
    );
  }

  return response;
}

export const config = {
  // API routes are included so the demo layer can see them — /api/demo/claim
  // needs to run, and an expired sandbox must get a 410 rather than a query
  // against the wrong database. CSP is still skipped for them, inside the
  // handler above.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo-black.png|logo-white.png).*)",
  ],
};
