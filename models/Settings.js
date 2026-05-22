import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    siteInfo: {
      siteName: { type: String, default: "Elysium Lifestyle" },
      logo: { type: String },
      whatsappNumber: { type: String, default: "8801700000000" },
      freeShippingThreshold: { type: Number, default: 1500 },
      shippingFee: { type: Number, default: 80 },
      email: { type: String },
      address: { type: String },
    },
    masterSizes: { type: [String], default: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "One Size"] },
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
