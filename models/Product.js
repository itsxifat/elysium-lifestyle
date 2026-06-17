import mongoose from "mongoose";

const variantSchema = new mongoose.Schema({
  size: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  sku: { type: String },
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    // Older slugs this product used to live at — so we can 301-redirect old links
    // to the current slug after a name/SKU change. See app/(store)/shop/[slug].
    previousSlugs: { type: [String], default: [] },
    // Product-level SKU base (e.g. ELY-0042). Variant SKUs derive from it.
    skuBase: { type: String, default: "" },
    description: { type: String },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    images: [{ type: String }],
    variants: [variantSchema],
    tags: [{ type: String, lowercase: true }],
    featured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    sizeChart: { type: mongoose.Schema.Types.ObjectId, ref: "SizeChart", default: null },
    gender: { type: String, enum: ["men", "women", "kids", "unisex"] },
    material: { type: String },
    careInstructions: { type: String },
  },
  { timestamps: true }
);

// Indexes that back the storefront/admin filters & sorts. (Search itself is
// case-insensitive regex across many fields, so it can't use a btree index —
// these speed up the category/published/price/recency paths around it.)
productSchema.index({ isPublished: 1, createdAt: -1 });
productSchema.index({ category: 1, isPublished: 1 });
productSchema.index({ "variants.price": 1 });
productSchema.index({ tags: 1 });
productSchema.index({ name: 1 });
productSchema.index({ previousSlugs: 1 }); // old-slug → product, for 301 redirects
productSchema.index({ skuBase: 1 });

productSchema.virtual("totalStock").get(function () {
  return this.variants.reduce((sum, v) => sum + v.stock, 0);
});

productSchema.virtual("minPrice").get(function () {
  if (!this.variants.length) return 0;
  return Math.min(...this.variants.map((v) => v.price));
});

// Optional ref/enum fields arrive from the admin form as "" when left blank
// (e.g. no category / no size chart / gender removed from the UI). Mongoose 500s
// on those — "" fails ObjectId casting and enum validation — so coerce blanks to
// a value it treats as "unset" before create/update.
export function normalizeProductInput(data) {
  const out = { ...data };
  if (out.category === "") out.category = null;
  if (out.sizeChart === "") out.sizeChart = null;
  if (out.gender === "" || out.gender == null) delete out.gender;
  return out;
}

const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);
export default Product;
