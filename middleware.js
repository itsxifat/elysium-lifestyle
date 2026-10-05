import { NextResponse } from "next/server";

// Per-request Content-Security-Policy with a fresh nonce, and the old admin
// panel's addresses sent to the brand ERP.
//
// A nonce-based CSP is the strongest practical defense against XSS: even if an
// attacker injects a <script> tag, the browser refuses to run it without our
// per-request nonce (which they can't predict). Next.js App Router automatically
// reads the nonce from the `Content-Security-Policy` request header we set here
// and stamps it onto its own bootstrap scripts — so no manual wiring is needed.
//
// SAFE ROLLOUT: while REPORT_ONLY is true the browser only *reports* violations
// (to the console) instead of blocking, so a missed allowlist entry can't break
// checkout/login. Exercise Google login, SSLCommerz checkout and images, confirm
// zero violations, then set REPORT_ONLY=false to enforce.
const REPORT_ONLY = true;

const isDev = process.env.NODE_ENV !== "production";

// The website has no admin panel any more: products, orders, customers, offers
// and the website's look are run from the brand ERP's console.
const ERP_ADMIN_URL = (process.env.ERP_ADMIN_URL || "https://erp.elysium-lifestyle.bd").replace(/\/+$/, "");

// Product, category and banner images are the ERP's public `/media/` URLs; the
// image optimiser serves them same-origin, but a few small thumbnails (the
// search box) load them directly.
const MEDIA_ORIGINS = (process.env.ERP_MEDIA_ORIGINS || "https://erp.elysium-lifestyle.bd")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

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
    // Same-origin optimized images (/_next/image), blob/data previews, the ERP's
    // public media, the hero placeholders and Google profile pictures.
    `img-src 'self' data: blob: ${MEDIA_ORIGINS.join(" ")} https://images.unsplash.com https://plus.unsplash.com https://lh3.googleusercontent.com https://*.googleusercontent.com`,
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

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // /admin and everything under it → the ERP console (the same path is not kept:
  // the ERP's screens have their own addresses).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.redirect(`${ERP_ADMIN_URL}/`, 308);
  }

  // An order link from an email carries its view token in `?token=`. Keep it for
  // this browser in the same HttpOnly cookie the checkout sets (lib/order-token.js)
  // and continue on the clean address, so the token never sits in the address
  // bar, the history, a Referer, or the URL a tracking event reports.
  const linked = /^\/order-confirmation\/([A-Za-z0-9-]{3,40})$/.exec(pathname);
  const token = request.nextUrl.searchParams.get("token");
  if (linked && token !== null) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("token");
    const response = NextResponse.redirect(clean, 303);
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
      response.cookies.set(`ely_ot_${linked[1].toUpperCase()}`, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: !isDev,
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }
    return response;
  }

  const isApi = pathname.startsWith("/api");
  if (isApi) return NextResponse.next();

  // Edge-safe random nonce (no Node Buffer/crypto).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = buildCsp(nonce);

  // Next reads the nonce from the request-side CSP header; pass it through.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // The browser enforces (or, while REPORT_ONLY, only reports) this header.
  response.headers.set(
    REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    csp
  );
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo-black.png|logo-white.png|placeholder.svg).*)",
  ],
};
