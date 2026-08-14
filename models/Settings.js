import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    siteInfo: {
      siteName: { type: String, default: "Elysium Lifestyle" },
      logo: { type: String },
      merchantId: { type: String, default: "" }, // shown on shipping labels
      whatsappNumber: { type: String, default: "8801700000000" },
      phone: { type: String, default: "" }, // public call/contact number shown in footer & policy pages
      freeShippingThreshold: { type: Number, default: 1500 },
      shippingFee: { type: Number, default: 80 },
      email: { type: String },
      address: { type: String },
    },
    masterSizes: { type: [String], default: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "One Size"] },
    // In-panel notification routing. `routing` maps each notification event key
    // (see lib/notification-events.js) to the array of staff roles that should
    // receive it. Missing/empty for an event → that event's built-in defaults.
    // Managed from /admin/notifications/settings; redacted from the public
    // /api/admin/settings GET (storefront reads that endpoint).
    notifications: {
      routing: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    // Row background colours for the admin Orders list, so staff can tell
    // manual/POS orders (Facebook, walk-in, phone…) and landing-page funnel
    // orders apart from automated website checkouts at a glance. All are light
    // tints so the dark row text stays readable; admins can change them on the
    // Settings page.
    orderRowColors: {
      website: { type: String, default: "#EAF2FB" }, // automated website orders (soft blue)
      staff:   { type: String, default: "#FEF3C7" }, // staff-made manual/POS orders (warm amber)
      landing: { type: String, default: "#F3E8FF" }, // /lp campaign funnel orders (soft violet)
    },
    // Orders-list filtering behaviour. weekStartsOn (0=Sunday … 6=Saturday)
    // defines which day begins a "week" for the This week / Last week quick
    // filters. Defaults to Saturday, the usual start of the Bangladeshi week.
    orderFilters: {
      weekStartsOn: { type: Number, default: 6, min: 0, max: 6 },
    },
    // Configurable SKU scheme. A product gets a base code (prefix OR its
    // category's code, + a zero-padded running number); each size variant
    // optionally appends its size. Every knob is toggleable from /admin/settings.
    sku: {
      enabled:      { type: Boolean, default: false }, // auto-generate on create + power the Migrate button
      codeSource:   { type: String, enum: ["prefix", "category"], default: "prefix" },
      prefix:       { type: String, default: "ELY" },   // base prefix when codeSource = "prefix" (and fallback)
      separator:    { type: String, default: "-" },
      padding:      { type: Number, default: 4 },        // 4 → 0042
      appendSize:   { type: Boolean, default: true },    // ELY-0042-M vs ELY-0042
      appendToSlug: { type: Boolean, default: true },    // slug ends with the base code
      nextNumber:   { type: Number, default: 1 },        // global running counter (advanced)
    },
    shipping: {
      freeShippingEnabled: { type: Boolean, default: false },
      freeShippingThreshold: { type: Number, default: 1500 },
      insideDhaka: { type: Number, default: 60 },
      suburbs: { type: Number, default: 100 },
      outsideDhaka: { type: Number, default: 130 },
    },
    paymentGateways: {
      sslcommerz: {
        enabled: { type: Boolean, default: false },
        storeId: { type: String, default: "" },
        storePassword: { type: String, default: "" },
        isLive: { type: Boolean, default: false },
      },
      cod: { enabled: { type: Boolean, default: true } },
    },
    emailSettings: {
      smtpHost: { type: String, default: "" },
      smtpPort: { type: Number, default: 587 },
      smtpUser: { type: String, default: "" },
      smtpPass: { type: String, default: "" },
      fromName: { type: String, default: "Elysium Lifestyle" },
      fromEmail: { type: String, default: "" },
    },
    // Steadfast fraud check + auto-processing rules. A new order stays PENDING
    // until the courier history clears the thresholds below — then it auto-moves
    // to "processing".
    fraud: {
      autoCheck: { type: Boolean, default: true }, // run the Steadfast check on new orders
      autoProcess: { type: Boolean, default: true }, // auto-move to processing when thresholds met
      minDelivery: { type: Number, default: 10 }, // min total parcels in history
      minSuccessfulDelivery: { type: Number, default: 10 }, // min successful (delivered) parcels
      minSuccessRate: { type: Number, default: 0 }, // min delivery success rate % (0 = ignore)
      maxFrauds: { type: Number, default: 0 }, // max acceptable fraud reports (block above this)
    },
    // Steadfast Courier (Packzy) order-placement API + webhook. Separate from the
    // fraud-history package above — these are the portal Api-Key/Secret-Key.
    steadfast: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String, default: "" },
      secretKey: { type: String, default: "" },
      baseUrl: { type: String, default: "https://portal.packzy.com/api/v1" },
      // When an order reaches "processing", auto-create the consignment.
      autoSendOnProcessing: { type: Boolean, default: true },
      // Webhook auth: Steadfast sends `Authorization: Bearer <token>`. Defaults to
      // the apiKey; set a custom token here to verify against that instead.
      webhookToken: { type: String, default: "" },
    },
    // ncom.bd — catalogue push + two-way stock sync, managed at /admin/ncom.
    // Credentials live here rather than in env so the VPS needs no redeploy to
    // change them (same pattern as steadfast above). Env vars NCOM_API_KEY /
    // NCOM_WEBHOOK_SECRET still win if set, so an existing deployment keeps
    // working unchanged.
    ncom: {
      enabled: { type: Boolean, default: false },
      apiKey: { type: String, default: "" },
      // Signing secret for inbound webhooks. Without it the receiver at
      // /api/ncom-webhook fails closed and rejects every request.
      webhookSecret: { type: String, default: "" },
      baseUrl: { type: String, default: "https://ncom.bd/api/v1" },
      // Mirror every stock movement (sales, returns, order edits) as a delta.
      autoPushStock: { type: Boolean, default: true },
      lastMigrateAt: { type: Date, default: null },
      lastReconcileAt: { type: Date, default: null },
      lastWebhookAt: { type: Date, default: null },
    },
    // Desktop: 1920×750 px (16:6.25 ≈ 2.56:1) — Mobile: 750×1000 px (3:4)
    heroSlides: [
      {
        imageDesktop: { type: String, default: "" },
        imageMobile:  { type: String, default: "" },
        href:         { type: String, default: "/" },
      },
    ],
    // Navbar items — ordered list of what appears in the top navigation
    navItems: [
      {
        type:        { type: String, enum: ["category", "custom"], default: "custom" },
        label:       { type: String, default: "" },
        href:        { type: String, default: "/" },
        categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
        highlighted: { type: Boolean, default: false },
        isActive:    { type: Boolean, default: true },
        order:       { type: Number, default: 0 },
      },
    ],
    announcementBar: {
      enabled: { type: Boolean, default: true },
      text: { type: String, default: "Free shipping on orders over ৳1500 · Cash on Delivery Available" },
      link: { type: String, default: "" },
    },
    socialLinks: {
      facebook: String,
      instagram: String,
      tiktok: String,
    },
    promoBanner: {
      enabled:        { type: Boolean, default: false },
      headline:       { type: String,  default: "Season Sale." },
      subtext:        { type: String,  default: "Up to 40% off selected styles. Refresh your wardrobe with our finest pieces at unbeatable prices." },
      note:           { type: String,  default: "+ Free shipping on all sale orders" },
      decorativeText: { type: String,  default: "40%" },
      primaryLabel:   { type: String,  default: "Shop the Sale" },
      primaryHref:    { type: String,  default: "/shop?onSale=true" },
      secondaryLabel: { type: String,  default: "All Collections" },
      secondaryHref:  { type: String,  default: "/shop" },
    },
    testimonials: [
      {
        name:      { type: String, default: "" },
        location:  { type: String, default: "" },
        rating:    { type: Number, default: 5, min: 1, max: 5 },
        text:      { type: String, default: "" },
        sortOrder: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
export default Settings;
