import mongoose from "mongoose";

// Rule-based discount / coupon.
//
// One schema expresses every common promotion type: % off, fixed amount, free
// shipping, buy-X-get-Y (BOGO), and tiered (spend-more-save-more). Each carries
// eligibility conditions (scope, min spend/qty, schedule, first-order, usage
// limits) and stacking control. The engine in lib/discounts.js evaluates these.

const tierSchema = new mongoose.Schema(
  {
    minSubtotal: { type: Number, default: 0 },
    type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    value: { type: Number, default: 0 },
  },
  { _id: false }
);

const discountSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // "code" = customer types a coupon; "automatic" = applies when eligible.
    method: { type: String, enum: ["code", "automatic"], default: "code" },
    code: { type: String, uppercase: true, trim: true, sparse: true, index: true },

    type: {
      type: String,
      enum: ["percentage", "fixed", "free_shipping", "buy_x_get_y", "tiered"],
      default: "percentage",
    },
    value: { type: Number, default: 0 }, // % (0-100) or fixed amount, by type
    maxDiscount: { type: Number, default: 0 }, // cap for percentage (0 = no cap)

    // buy_x_get_y
    buyQuantity: { type: Number, default: 0 },
    getQuantity: { type: Number, default: 0 },
    getDiscountPercent: { type: Number, default: 100 }, // 100 = the free items

    // tiered
    tiers: { type: [tierSchema], default: [] },

    // ── Eligibility ──────────────────────────────────────────────────────────
    appliesTo: { type: String, enum: ["all", "products", "categories"], default: "all" },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    minSubtotal: { type: Number, default: 0 },
    minQuantity: { type: Number, default: 0 },
    firstOrderOnly: { type: Boolean, default: false },

    // ── Limits ───────────────────────────────────────────────────────────────
    usageLimit: { type: Number, default: 0 }, // total uses, 0 = unlimited
    perCustomerLimit: { type: Number, default: 0 }, // uses per customer, 0 = unlimited
    usedCount: { type: Number, default: 0 },

    // ── Schedule ─────────────────────────────────────────────────────────────
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },

    // ── Stacking ─────────────────────────────────────────────────────────────
    allowStacking: { type: Boolean, default: false }, // can combine with others
    priority: { type: Number, default: 0 }, // higher applies first

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// A code is unique only among coupon-type discounts (automatic ones have none).
discountSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } }
);

const Discount = mongoose.models.Discount || mongoose.model("Discount", discountSchema);
export default Discount;
