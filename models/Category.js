import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
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

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
export default Category;
