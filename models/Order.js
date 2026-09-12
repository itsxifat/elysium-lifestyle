import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";
// Relative, not "@/lib/...": this model is also imported by the plain-node
// scripts in scripts/, which have no path-alias resolution.
import { ORDER_STATUSES } from "../lib/order-status.js";

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
      enum: ["website", "landing_page", "ncom", "facebook", "instagram", "whatsapp", "phone", "offline", "other"],
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
    // An order placed on an ncom.bd landing page and handed to us to process.
    //
    // ADMIN-ONLY, exactly like `landingPage` above: the customer's own account
    // pages must render this as a perfectly ordinary order, so never project
    // these fields into storefront views.
    //
    // Everything here is a snapshot of what ncom sent, because there is nothing
    // to join to — their pages, offers and stores live in their database, not
    // ours, and an order has to keep reading correctly after a campaign they
    // ran last March is deleted.
    ncom: {
      // Their order id, and the human number the buyer was shown on their
      // confirmation screen. A customer quoting a number over the phone is
      // quoting THIS one, not ours, so it has to be searchable.
      orderId: { type: String, default: "" },
      orderNumber: { type: String, default: "" },

      // The idempotency key from the handoff. Unique (sparse) — this index is
      // the entire defence against a retried delivery becoming a second order,
      // and it is enforced by the database rather than by a check-then-insert.
      idempotencyKey: { type: String, default: undefined },

      receivedAt: { type: Date, default: null },

      /// How many times this order has changed since it arrived.
      ///
      /// The defence against the two order books quietly disagreeing. Every
      /// message in either direction quotes the revision it was built from, and
      /// is applied only if that matches what this side holds. Anything else is
      /// refused with 409 and this number, never merged — two people editing the
      /// same order in two systems is a real thing that happens, and
      /// last-writer-wins loses one of their edits without telling anybody.
      revision: { type: Number, default: 0 },

      /// The idempotency key of the last change accepted FROM ncom.
      ///
      /// Tells their retry from a genuinely stale change, which comparing
      /// revisions cannot: both quote a base lower than we hold. Revisions are
      /// per-side counters and drift apart the moment each system applies
      /// something the other has not seen.
      lastInboundKey: { type: String, default: "" },

      // Which of their storefronts sold it, and which page on it.
      storeName: { type: String, default: "" },
      storeUrl: { type: String, default: "" },
      pageTitle: { type: String, default: "" },
      pageUrl: { type: String, default: "" },

      // The offer the buyer took. This is the single most useful field on the
      // whole record — it is what the ad promised, in the words the customer
      // read, and it is what staff need when the customer says "the two-shirt
      // deal".
      offerKey: { type: String, default: "" },
      offerLabel: { type: String, default: "" },
      offerPrice: { type: Number, default: 0 },
      regularPrice: { type: Number, default: 0 },

      // Their coupon, if the buyer typed one. We do not re-evaluate it — the
      // discount is already in the totals — this is for the record.
      discountCode: { type: String, default: "" },

      // Lines belonging to products ncom stores itself rather than to ours.
      // They have no Product to reference and no stock of ours to move, so they
      // are listed here for whoever packs the parcel and has to find them.
      foreignItems: [
        {
          title: { type: String, default: "" },
          variantTitle: { type: String, default: "" },
          sku: { type: String, default: "" },
          image: { type: String, default: "" },
          quantity: { type: Number, default: 0 },
          price: { type: Number, default: 0 },
        },
      ],

      // Anything ncom sent that we could not match to a product of ours, and
      // anything we could not reserve. Staff see this on the order rather than
      // discovering it in the stockroom.
      warnings: { type: [String], default: [] },

      // The handoff exactly as it arrived. Kept so "what did they actually send
      // us" is answerable from the order itself, which is the first question in
      // every integration conversation. Rendered in the expandable panel.
      payload: { type: mongoose.Schema.Types.Mixed, default: null },
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
    // The lifecycle lives in lib/order-status.js — labels, colours and the
    // "which of these may staff set by hand" rule all resolve from there.
    //
    // The three return states: `return_requested` is what a courier-reported
    // partial delivery / return request lands on (nothing itemised yet), and
    // `partial_returned` / `returned` are computed from the recorded return
    // lines when staff work through the return editor.
    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
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
      // Last time we ASKED Steadfast where this parcel is (the "Sync delivery
      // status" button / the per-order sync). Distinct from lastWebhookAt,
      // which is the last time they told US unprompted — the webhook only
      // fires if it is configured in their portal, so this is what proves an
      // order's courier status has actually been checked recently.
      lastSyncedAt: { type: Date, default: null },
      // When Steadfast started answering `401 Unauthorized Access` for this
      // consignment — their reply for a parcel that is no longer accessible on
      // the account (deleted their side, or raised under different keys).
      //
      // It is a permanent answer, not a wobble: the same three lookups (by id,
      // by tracking code, by our invoice) all refuse, while other parcels
      // answer 200 in the same breath. So the bulk sync stops asking, and one
      // dead consignment can no longer put a failure line on every run. A
      // per-order sync ignores this and clears it if they answer again.
      unauthorizedAt: { type: Date, default: null },

      // The return request Steadfast holds against this consignment, if any.
      //
      // Answers the question staff ask the moment an order shows up as "return
      // requested": who said so and why. Their request has its own lifecycle
      // ('pending' → 'approved' → 'processing' → 'completed' / 'cancelled')
      // which is about the PARCEL coming back, not about our itemising of it —
      // ours is the order status, driven by the return editor.
      returnRequest: {
        id: { type: String, default: "" },
        status: { type: String, default: "" }, // their request status, raw
        reason: { type: String, default: "" },
        at: { type: Date, default: null }, // when they raised it
        seenAt: { type: Date, default: null }, // when a sync first saw it
      },
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

// One ncom order, once. Sparse so the overwhelming majority of orders — every
// one placed on this shop's own storefront — carry no key and are unaffected.
//
// This is the guarantee that makes ncom's at-least-once delivery safe: their
// queue retries anything it did not get a clean answer to, including a request
// we processed and then failed to acknowledge, and the retry carries the same
// key. Without this index that retry is a duplicate order, a duplicate stock
// movement and a duplicate parcel.
orderSchema.index({ "ncom.idempotencyKey": 1 }, { unique: true, sparse: true });

// ── Reporting indexes ─────────────────────────────────────────────────────────
// /admin/analytics runs ~20 aggregations per page load, every one of them keyed
// on a createdAt window and most of them additionally on `source` or
// `createdBy` (the channel and staff filters). Without these each of those is a
// full collection scan of every order the shop has ever taken.
//
// Compound with createdAt DESCENDING because the filter is always a range on
// createdAt and the equality field leads: {source, createdAt} serves both
// "orders in this window" grouped by source and "this channel in this window".
orderSchema.index({ createdAt: -1 });
orderSchema.index({ source: 1, createdAt: -1 });
orderSchema.index({ createdBy: 1, createdAt: -1 });

// Customer management joins orders to users constantly: the list computes each
// customer's order count, lifetime spend and last-order date, and the detail
// drawer pulls one customer's history newest-first. Without this every one of
// those is a full scan — and there is now one customer record per buyer, so the
// list alone would scan the orders collection once per row.
orderSchema.index({ user: 1, createdAt: -1 });

// The audit-trail pass windows on when the ACTION happened, not when the order
// was placed, so it needs its own multikey index on the embedded timestamp.
orderSchema.index({ "editHistory.at": -1 });

// Fallback numbering for any code path that saves an order without going
// through createOrderWithNumber. Routed through the same atomic counter — the
// old `countDocuments() + 1` here handed concurrent saves the same number and
// the unique index turned that into a failed checkout.
orderSchema.pre("save", async function () {
  if (!this.orderNumber) {
    // Relative, not "@/lib/...": this model is also imported by the plain-node
    // scripts in scripts/, which have no path-alias resolution.
    const { nextOrderNumber } = await import("../lib/order-number.js");
    // `this.constructor`, not mongoose.model("Order"): the latter always
    // resolves against the DEFAULT connection, so under a demo sandbox this
    // hook would draw the order number from the wrong database's counter.
    this.orderNumber = await nextOrderNumber(this.constructor, "ELY");
  }
});

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const Order = tenantModel("Order", orderSchema);
export default Order;
