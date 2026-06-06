import mongoose from "mongoose";

// One log row per tracked event. Stores the inbound payload, exactly what was
// sent to each platform, both responses, status and latency — everything the
// admin monitoring view needs. Heavily indexed for fast filtering.

const platformResultSchema = new mongoose.Schema(
  {
    attempted: { type: Boolean, default: false },
    status: { type: String, enum: ["success", "error", "skipped"], default: "skipped" },
    httpStatus: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    request: { type: mongoose.Schema.Types.Mixed, default: null }, // payload we sent
    response: { type: mongoose.Schema.Types.Mixed, default: null }, // API response
    error: { type: String, default: "" },
    endpoint: { type: String, default: "" },
  },
  { _id: false }
);

const trackingEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, index: true }, // shared browser+server dedup id
    eventName: { type: String, index: true },
    source: { type: String, enum: ["client", "server"], default: "server", index: true },
    testMode: { type: Boolean, default: false },

    // Masked user snapshot for the UI (never store raw PII in clear beyond masks).
    user: {
      emailMasked: { type: String, default: "" },
      phoneMasked: { type: String, default: "" },
      ip: { type: String, default: "" },
      userAgent: { type: String, default: "" },
    },
    // Which Meta EMQ inputs were present — powers the match-quality dashboard.
    matchKeys: {
      email: { type: Boolean, default: false },
      phone: { type: Boolean, default: false },
      firstName: { type: Boolean, default: false },
      lastName: { type: Boolean, default: false },
      city: { type: Boolean, default: false },
      fbp: { type: Boolean, default: false },
      fbc: { type: Boolean, default: false },
      ip: { type: Boolean, default: false },
      userAgent: { type: Boolean, default: false },
      externalId: { type: Boolean, default: false },
    },

    inbound: { type: mongoose.Schema.Types.Mixed, default: null }, // raw event as received
    customData: { type: mongoose.Schema.Types.Mixed, default: null },
    value: { type: Number, default: 0 },
    currency: { type: String, default: "" },

    meta: { type: platformResultSchema, default: () => ({}) },
    ga4: { type: platformResultSchema, default: () => ({}) },

    status: {
      type: String,
      enum: ["success", "partial", "error", "skipped"],
      default: "skipped",
      index: true,
    },
    totalLatencyMs: { type: Number, default: 0 },

    // TTL: each doc self-expires at expireAt. Setting it per-doc (instead of a
    // fixed index TTL) makes the retention window live-configurable.
    expireAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound indexes for the common admin queries (filter + sort by recency).
trackingEventSchema.index({ createdAt: -1 });
trackingEventSchema.index({ eventName: 1, createdAt: -1 });
trackingEventSchema.index({ status: 1, createdAt: -1 });
trackingEventSchema.index({ source: 1, createdAt: -1 });
// TTL — Mongo purges docs once expireAt passes (expireAfterSeconds: 0).
trackingEventSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const TrackingEvent =
  mongoose.models.TrackingEvent || mongoose.model("TrackingEvent", trackingEventSchema);
export default TrackingEvent;
