import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  name: { type: String, required: true },
  image: { type: String },
  sku: { type: String, default: "" },
  size: { type: String, required: true },
  color: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  // Quantity of this line that was returned (partial delivery / full return).
  returnedQuantity: { type: Number, default: 0, min: 0 },
});

const shippingAddressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String },
  postalCode: { type: String },
  country: { type: String, default: "Bangladesh" },
});

// A discount that was applied to the order, snapshotted for the record.
//
// This MUST be its own Schema rather than an inline object literal. Mongoose
// treats a plain object containing a `type` key as a type declaration, so the
// inline form silently compiled `appliedDiscounts` to an array of Strings and
// every order carrying a discount failed to save.
const appliedDiscountSchema = new mongoose.Schema(
  {
    discount: { type: mongoose.Schema.Types.ObjectId, ref: "Discount" },
    code: { type: String },
    title: { type: String },
    // percentage | fixed | free_shipping | buy_x_get_y | tiered
    type: { type: String },
    amount: { type: Number, default: 0 }, // money taken off (shipping excluded)
    freeShipping: { type: Boolean, default: false },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    guestEmail: { type: String },
    items: [orderItemSchema],
    shippingAddress: { type: shippingAddressSchema, required: true },

    // Sales channel the order came through. "website" = customer self-checkout;
    // "landing_page" = a /lp/<code> funnel; the rest are manual/POS orders
    // created by staff from the admin panel.
    source: {
      type: String,
      enum: ["website", "landing_page", "facebook", "instagram", "whatsapp", "phone", "offline", "other"],
      default: "website",
    },

    // Which landing page produced this order, and which offer the customer took.
    // ADMIN-ONLY: the customer's own account pages must render this order as a
    // perfectly ordinary order, so never project these fields into storefront
    // views. Fields are snapshots so the record survives the LP being deleted.
    landingPage: {
      page: { type: mongoose.Schema.Types.ObjectId, ref: "LandingPage", default: null },
      code: { type: String, default: "" }, // the /lp/<code> slug
      name: { type: String, default: "" }, // internal LP name
      offerKey: { type: String, default: "" },
      offerLabel: { type: String, default: "" },
      offerPrice: { type: Number, default: 0 }, // LP price charged for the offer
      regularPrice: { type: Number, default: 0 }, // undiscounted product total
    },
    // Who created the order (null for customer self-checkout). createdByName is a
    // snapshot kept even if the staff account is later removed.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },

    paymentMethod: {
      type: String,
      enum: ["sslcommerz", "cod", "bkash", "nagad", "bank", "cash"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    shippingZone: {
      type: String,
      enum: ["inside_dhaka", "suburbs", "outside_dhaka"],
      default: "inside_dhaka",
    },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    // Discounts/coupons applied to the order (snapshot for the record).
    discountCodes: { type: [String], default: [] },
    appliedDiscounts: { type: [appliedDiscountSchema], default: [] },
    totalAmount: { type: Number, required: true },
    transactionId: { type: String },
    valId: { type: String },
    notes: { type: String },

    // ── Audit trail ─────────────────────────────────────────────────────────
    // Who changed this order and what. Appended on every PIN-gated mutation
    // (edits, status/payment changes, returns) so we can always tell who did
    // what. byName is a snapshot kept even if the staff account is removed.
    editHistory: [
      {
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        byName: { type: String, default: "" },
        action: { type: String, default: "" }, // edit | status_change | payment_update | payment_change | return | return_edit
        summary: { type: String, default: "" }, // human-readable description of the change
        pinVerified: { type: Boolean, default: false },
      },
    ],

    // Whether this order is currently holding its units out of inventory.
    // Set when the stock is reserved at creation, cleared when a cancellation
    // hands it back. Without this flag a second cancel — or a cancel after a
    // partial return — would credit the stock twice. See lib/stock.js.
    stockReserved: { type: Boolean, default: false },

    // ── Returns / partial delivery ──────────────────────────────────────────
    // Set when staff record a return; totals above are recomputed accordingly.
    returnedAmount: { type: Number, default: 0 }, // value refunded for returned items
    deliveryChargeWaived: { type: Boolean, default: false },
    returns: [
      {
        at: { type: Date, default: Date.now },
        by: String, // staff name snapshot
        items: [{ name: String, size: String, quantity: Number, price: Number }],
        refundAmount: { type: Number, default: 0 },
        deliveryChargeWaived: { type: Boolean, default: false },
        note: String,
      },
    ],

    // ── Steadfast courier consignment (order placement) ─────────────────────
    courier: {
      provider: { type: String, default: "steadfast" },
      consignmentId: { type: Number, default: null },
      trackingCode: { type: String, default: "" },
      status: { type: String, default: "" }, // raw Steadfast status
      deliveryCharge: { type: Number, default: 0 },
      sentAt: { type: Date, default: null },
      lastWebhookAt: { type: Date, default: null },
      error: { type: String, default: "" },
      trackingMessages: [{ message: String, at: { type: Date, default: Date.now } }],
    },

    // Steadfast (Packzy) courier fraud/delivery history for the order's phone,
    // fetched automatically on order creation. See lib/fraud.js.
    fraudCheck: {
      status: {
        type: String,
        enum: ["pending", "checking", "done", "error", "skipped", "unavailable"],
        default: "pending",
      },
      delivered: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      frauds: { type: Number, default: 0 },
      totalParcels: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 }, // delivered / total, %
      autoProcessed: { type: Boolean, default: false }, // did it auto-move to processing
      checkedAt: { type: Date, default: null },
      error: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// Fallback numbering for any code path that saves an order without going
// through createOrderWithNumber. Routed through the same atomic counter — the
// old `countDocuments() + 1` here handed concurrent saves the same number and
// the unique index turned that into a failed checkout.
orderSchema.pre("save", async function () {
  if (!this.orderNumber) {
    // Relative, not "@/lib/...": this model is also imported by the plain-node
    // scripts in scripts/, which have no path-alias resolution.
    const { nextOrderNumber } = await import("../lib/order-number.js");
    this.orderNumber = await nextOrderNumber(mongoose.model("Order"), "ELY");
  }
});

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export default Order;
