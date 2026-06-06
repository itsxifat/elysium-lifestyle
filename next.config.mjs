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
  // Deny powerful device APIs we never use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  // Don't advertise the framework/version to attackers.
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["mongoose", "nodemailer", "steadfast-fraud"],
  },
  images: {
    // Keep the optimizer's disk-cache TTL in sync with the image proxy's
    // max-age so a deleted CDN file is re-validated (and purged) within minutes.
    minimumCacheTTL: 600,
    // Serve AVIF/WebP when the browser supports them — smaller, faster loads.
    formats: ["image/avif", "image/webp"],
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
