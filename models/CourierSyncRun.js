import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// One press of "Sync delivery status" — what it asked Steadfast, what came
// back, what moved, who started it and how long it took.
//
// Kept as records rather than only shown once in a popup because the question
// staff actually ask is retrospective: "why did this order go to delivered on
// Tuesday, and who ran that?" A sync is the one thing in the panel that changes
// many orders at once without anybody typing anything, so it needs a paper
// trail of its own — the per-order audit entry says a courier moved it, this
// says which run, and at whose hand.
//
// It is also the progress record for a run in flight: the sync happens after
// the HTTP response has gone back, so the browser follows it by re-reading
// this document.

const changeSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderNumber: { type: String, default: "" },
    from: { type: String, default: "" }, // our status before
    to: { type: String, default: "" }, // our status after
    courierStatus: { type: String, default: "" }, // their raw word for it
    courierStatusLabel: { type: String, default: "" },
    autoPaid: { type: Boolean, default: false },
    needsReturnEntry: { type: Boolean, default: false },
    reason: { type: String, default: "" }, // return-request reason, if any
    // Which of the two channels moved it: a delivery-status lookup, or their
    // return-request list.
    via: { type: String, default: "status" },
  },
  { _id: false }
);

const failureSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderNumber: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const courierSyncRunSchema = new mongoose.Schema(
  {
    // running → done | failed. A run left "running" by a restart is treated as
    // stale by the starter after RUN_STALE_MS (see lib/courier-sync-runs).
    state: {
      type: String,
      enum: ["running", "done", "failed"],
      default: "running",
    },

    // manual = the button on /admin/orders, order = the button on one order,
    // reconstructed = rebuilt from the audit trail for syncs run before this
    // history existed.
    trigger: {
      type: String,
      enum: ["manual", "order", "reconstructed"],
      default: "manual",
    },

    // Free text, because "every live parcel" and "order ELY-2026-00123" are
    // both answers staff need to read at a glance.
    scope: { type: String, default: "All live consignments" },
    includeSettled: { type: Boolean, default: false },

    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: "" }, // snapshot: survives the account going

    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },

    progress: {
      done: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    totals: {
      checked: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      remaining: { type: Number, default: 0 },
      settledSkipped: { type: Number, default: 0 },
      returnRequests: { type: Number, default: 0 },
    },

    changes: { type: [changeSchema], default: [] },
    // NOT named `errors`: that is a reserved path on a mongoose Document (it
    // holds validation errors), and shadowing it breaks saving the very
    // document that would record a failure.
    failures: { type: [failureSchema], default: [] },

    // Why the whole run stopped, when it did.
    error: { type: String, default: "" },
    // Their credentials were refused. Distinct from a per-order failure: the
    // run stops on the first one, because the next parcel would fail the same
    // way and 300 identical 401s help nobody.
    authFailed: { type: Boolean, default: false },
    returnRequestError: { type: String, default: "" },

    // Set on rebuilt records so nothing pretends to be more precise than it is,
    // and used to make the rebuild idempotent.
    reconstructed: { type: Boolean, default: false },
    sourceKey: { type: String, default: undefined },
  },
  { timestamps: true }
);

// History is always read newest-first.
courierSyncRunSchema.index({ startedAt: -1 });
// "is one already running?" — asked on every press of the button.
courierSyncRunSchema.index({ state: 1, startedAt: -1 });
// Rebuilding past runs from the audit trail must never double-insert, however
// many times the import is run.
courierSyncRunSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

const CourierSyncRun = tenantModel("CourierSyncRun", courierSyncRunSchema);
export default CourierSyncRun;
