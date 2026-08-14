import mongoose from "mongoose";

// Delivery is at-least-once and retries reuse the event id, so every inbound
// ncom webhook is recorded here and a repeat is answered 200 without being
// applied twice. Rows self-expire after 7 days — comfortably past the ~2h
// retry ladder, and short enough that this never grows without bound.
const ncomEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    topic: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ncomEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

const NcomEvent = mongoose.models.NcomEvent || mongoose.model("NcomEvent", ncomEventSchema);
export default NcomEvent;
