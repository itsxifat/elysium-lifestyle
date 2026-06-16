/** @type {import('next').NextConfig} */

// Static security headers applied to every response. CSP is set per-request in
// middleware.js (it needs a fresh nonce each load), so it is intentionally not
// listed here.
const securityHeaders = [
  // Force HTTPS for two years, including subdomains. Only takes effect over TLS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Stop browsers from MIME-sniffing a response away from its declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (paths, query) to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Allow the camera on our own origin (the admin barcode scanner needs it);
  // still deny it to all third parties. Mic + geolocation stay fully off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  // Don't advertise the framework/version to attackers.
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["mongoose", "nodemailer", "steadfast-fraud"],
  },
  images: {
    // Image URLs are content-addressed (a changed image gets a new URL), so the
    // optimized output is effectively immutable — cache it as long as possible
    // to avoid ever re-optimizing the same image. (1 year.)
    minimumCacheTTL: 31536000,
    // WebP only. AVIF compresses a touch smaller but encodes ~5-10x slower,
    // which is the main cause of slow first loads — WebP is the fast sweet spot.
    formats: ["image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "cdn.enfinito.cloud" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
