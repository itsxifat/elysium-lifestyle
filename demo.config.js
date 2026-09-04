import { defineDemo } from "@enfinito/demo-kit/config";

// Elysium's demo profile. Everything site-specific lives here; the mechanics
// live in @enfinito/demo-kit.
//
// See ~/projects/endb/docs/integration-guide.md for what each field does and
// §9 for the gate this site must pass before the demo is publicly reachable.
export default defineDemo({
  siteId: "elysium",
  templateDb: "elysium_demo_template",
  sandboxPrefix: "elysium_demo_pool_",

  poolSize: 5,
  maxConcurrent: 25,
  ttlMinutes: 30,
  ownerTtlMinutes: 240,

  // Seeded into the template, surfaced by the autofill widget on both login
  // pages. Plain text on purpose — they only exist inside a throwaway sandbox.
  accounts: [
    // `pin` is Elysium-specific: the panel demands a 6-digit second factor for
    // order edits and status changes. Pre-set in the seed and shown here, or a
    // visitor hits a wall on their first click.
    { label: "Admin", email: "admin@demo.elysium", password: "DemoAdmin24", role: "superadmin", pin: "246810" },
    { label: "Shopper", email: "shopper@demo.elysium", password: "DemoShop24", role: "customer" },
  ],

  // Routed to the template rather than a sandbox: their edits become the
  // baseline every future visitor starts from.
  ownerEmail: process.env.DEMO_OWNER_EMAIL || "",

  // ── Outbound side effects ────────────────────────────────────────────────
  // Layer 1: every module found by the §0 audit, stubbed by name.
  // NOTE: NOT YET IMPLEMENTED — the firewall is the next phase. Until it lands
  // this demo must not be reachable from outside localhost.
  integrations: {
    mail: { module: "lib/email.js", stub: "mail" },
    courier: { module: "lib/steadfast.js", stub: "courier" },
    payments: { module: "lib/sslcommerz.js", stub: "payments" },
    // ncom's OUTBOUND half only (reading orders, registering webhooks). The
    // connector at app/api/ncom/v1/* is inbound and makes no egress call at
    // all — it fails closed in a sandbox because the seed clears its secret.
    ncom: { module: "lib/ncom.js", stub: "noop" },
    analyticsMeta: { module: "lib/tracking/meta.js", stub: "analytics" },
    analyticsGa4: { module: "lib/tracking/ga4.js", stub: "analytics" },
    fraud: { module: "lib/fraud.js", stub: "fraud" },
    storage: { module: "lib/cdn.js", stub: "storage", prefix: "demo/{sid}/" },
  },

  // Layer 2: deny-by-default egress. Anything not listed throws in demo mode.
  //
  // The media CDN is GET-only on purpose: the storefront needs its product
  // images (Next fetches them server-side through the image optimizer, so
  // blocking them leaves the shop looking broken), but an upload would outlive
  // the dropped sandbox and leak storage forever.
  // A good heuristic for the GET-only entries: mirror the img-src list in
  // middleware.js. Those hosts are already trusted to render into the page, and
  // a GET to an image host has no side effect. Everything else stays blocked.
  allowedHosts: [
    "endb.enfinito.cloud",
    { host: "cdn.enfinito.cloud", methods: ["GET", "HEAD"] },
    { host: "res.cloudinary.com", methods: ["GET", "HEAD"] },
    { host: "images.unsplash.com", methods: ["GET", "HEAD"] },
    { host: "plus.unsplash.com", methods: ["GET", "HEAD"] },
    { host: "lh3.googleusercontent.com", methods: ["GET", "HEAD"] },
  ],

  reap: { purgeCdnPrefix: true, clearInbox: true },
});
