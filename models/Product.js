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

productSchema.virtual("totalStock").get(function () {
  return this.variants.reduce((sum, v) => sum + v.stock, 0);
});

productSchema.virtual("minPrice").get(function () {
  if (!this.variants.length) return 0;
  return Math.min(...this.variants.map((v) => v.price));
});

const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);
export default Product;
