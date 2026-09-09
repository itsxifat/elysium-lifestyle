import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// Changes this shop has made to an ncom order, on their way back to ncom.
//
// WHY A TABLE AND NOT A fetch()
// A cancellation that fails to reach ncom leaves their copy of the order live —
// with the units of any product THEY store still off their shelf, and their
// dashboard still offering to dispatch a parcel we are not sending. A
// fire-and-forget call loses that silently the first time their host has a bad
// minute, and nobody finds out until the numbers are compared.
//
// So the row is written inside the same save that made the change, before any
// HTTP happens, and a failed send is retried from here. The row is the queue
// and the audit trail: "did you actually tell them?" is the first question in
// every one of these conversations.
//
// ORDERED, AND ONE FAILURE BLOCKS THE REST
// Two changes to one order are not independent facts — "quantity is now 3"
// delivered after "quantity is now 5" leaves ncom holding a number nobody
// chose. Messages for a single order are sent oldest-first and a message that
// has not landed holds the ones behind it. Different orders never wait on each
// other.
const ncomOutboxSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    // ncom's own order id — what their side keys on.
    ncomOrderId: { type: String, required: true },

    topic: { type: String, enum: ["order.updated", "order.cancelled"], required: true },

    // Stable across every retry, so a message they processed and then failed to
    // acknowledge is recognised rather than applied twice.
    idempotencyKey: { type: String, required: true, unique: true },

    // What we believed they held, and what applying this produces.
    baseRevision: { type: Number, required: true },
    revision: { type: Number, required: true },

    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: ["pending", "delivered", "refused", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    statusCode: { type: Number, default: null },
    error: { type: String, default: "" },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The retry sweep: queued rows whose backoff has elapsed.
ncomOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
// Draining one order's messages in the order they were made.
ncomOutboxSchema.index({ order: 1, createdAt: 1 });

const NcomOutbox = tenantModel("NcomOutbox", ncomOutboxSchema);
export default NcomOutbox;
