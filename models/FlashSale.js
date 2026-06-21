import mongoose from "mongoose";

// A homepage flash sale: a scheduled, limited-stock promotion.
//
// Each item pins a product to a special `salePrice` and an allocated
// `stockLimit` (how many units are offered at that price). `soldCount` grows as
// orders claim the deal, so the storefront can show "X left" and the price is
// enforced server-side at checkout (see lib/flashSale.js + the orders route).

const flashItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    salePrice: { type: Number, required: true, min: 0 },
    stockLimit: { type: Number, default: 0, min: 0 }, // units offered at the flash price
    soldCount: { type: Number, default: 0, min: 0 }, // units already claimed
  },
  { _id: false }
);

const flashSaleSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Flash Sale", trim: true },
    subtitle: { type: String, default: "" },
    enabled: { type: Boolean, default: false },
    // Optional schedule — null start means "live now", null end means "no end".
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    items: { type: [flashItemSchema], default: [] },
  },
  { timestamps: true }
);

const FlashSale =
  mongoose.models.FlashSale || mongoose.model("FlashSale", flashSaleSchema);
export default FlashSale;
