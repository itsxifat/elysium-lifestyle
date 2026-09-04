import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// A "Custom URL" is a marketing campaign attached to an existing storefront link.
//
// The admin picks a BASE destination — a category (any depth), the shop listing,
// or any custom path that lists products — then layers on:
//   • a set of HIGHLIGHT products shown on top of the normal listing,
//   • an optional top BANNER (offer/announcement strip),
//   • an optional MODAL notification (text or image).
//
// Each campaign gets a unique 5-digit `code`. The shareable URL is the base link
// with a `?cu=<code>` suffix. When a visitor lands on that URL the storefront
// fetches this config (public route by code) and renders the extras.

const bannerSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    text: { type: String, default: "" },
    bgColor: { type: String, default: "#B85C3A" }, // brand terracotta
    textColor: { type: String, default: "#FFFFFF" },
    link: { type: String, default: "" }, // optional click-through
  },
  { _id: false }
);

const modalSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    type: { type: String, enum: ["text", "image"], default: "text" },
    title: { type: String, default: "" },
    text: { type: String, default: "" },
    image: { type: String, default: "" },
    ctaText: { type: String, default: "" },
    ctaLink: { type: String, default: "" },
  },
  { _id: false }
);

const customUrlSchema = new mongoose.Schema(
  {
    // 5-digit suffix appended to the base link as ?cu=<code>.
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },

    // Where the campaign lives.
    baseType: { type: String, enum: ["category", "shop", "custom"], default: "category" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    // Used when baseType === "custom" (e.g. "/shop?search=eid"). For "shop" the
    // base is always "/shop"; for "category" it's derived from the category slug.
    customPath: { type: String, default: "" },

    // Products pinned to the top of the listing, in the given order.
    highlightProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

    banner: { type: bannerSchema, default: () => ({}) },
    modal: { type: modalSchema, default: () => ({}) },

    isActive: { type: Boolean, default: true },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const CustomUrl = tenantModel("CustomUrl", customUrlSchema);
export default CustomUrl;
