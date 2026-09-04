import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// A hold ncom placed on this shop's stock while it wrote an order.
//
// Under contract 1 ncom does not own our inventory — it asks. POST /reserve
// takes the units here, atomically, and POST /release hands them back. This
// collection is what makes that pair honest:
//
//   * `orderRef` is unique, so a retried reserve cannot decrement twice;
//   * `lines` records what was ACTUALLY taken, so a release credits exactly
//     that and not whatever the caller happens to send weeks later;
//   * `state` moves pending → held → released once, so two concurrent releases
//     cannot both credit the same units.
//
// Rows outlive the parcel deliberately. A release arrives when an order is
// cancelled, when a checkout fails after the hold — and when a parcel comes
// back, which can be a month later. Six months is comfortably past that and
// still bounded.
const lineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const ncomReservationSchema = new mongoose.Schema(
  {
    orderRef: { type: String, required: true, unique: true },
    state: { type: String, enum: ["pending", "held", "released"], default: "pending", index: true },
    lines: { type: [lineSchema], default: [] },
    heldAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ncomReservationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const NcomReservation = tenantModel("NcomReservation", ncomReservationSchema);
export default NcomReservation;
