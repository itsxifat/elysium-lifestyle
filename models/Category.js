import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    // Short uppercase code used to build SKUs when the SKU scheme's codeSource
    // is "category" (e.g. Dresses → "DRS" → DRS-0042-M).
    code: { type: String, default: "", uppercase: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    gender: { type: String, enum: ["men", "women", "kids", "all"], default: "all" },
    image: { type: String },
    description: { type: String },
    isActive:   { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index for fast tree lookups
categorySchema.index({ parent: 1, sortOrder: 1 });

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const Category = tenantModel("Category", categorySchema);
export default Category;
