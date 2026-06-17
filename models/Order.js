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

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    guestEmail: { type: String },
    items: [orderItemSchema],
    shippingAddress: { type: shippingAddressSchema, required: true },

    // Sales channel the order came through. "website" = customer self-checkout;
    // the rest are manual/POS orders created by staff from the admin panel.
    source: {
      type: String,
      enum: ["website", "facebook", "instagram", "whatsapp", "phone", "offline", "other"],
      default: "website",
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
    appliedDiscounts: [
      {
        discount: { type: mongoose.Schema.Types.ObjectId, ref: "Discount" },
        code: String,
        title: String,
        type: String, // percentage | fixed | free_shipping | buy_x_get_y | tiered
        amount: { type: Number, default: 0 }, // money taken off (shipping excluded)
        freeShipping: { type: Boolean, default: false },
      },
    ],
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

orderSchema.pre("save", async function () {
  if (!this.orderNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("Order").countDocuments();
    this.orderNumber = `ELY-${year}-${String(count + 1).padStart(5, "0")}`;
  }
});

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export default Order;
