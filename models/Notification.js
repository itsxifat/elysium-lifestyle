import mongoose from "mongoose";

// In-panel notifications.
//
// Audience model (kept deliberately simple for a small staff team):
//  - "admins"  → every superadmin + admin (staff actions, new orders, cancels…)
//  - "staff"   → every moderator + staff (broadcasts an admin sends down)
//  - "user"    → one specific person (`recipient`), e.g. "your PIN was reset"
//
// Read state is tracked per-user via `readBy` so a single broadcast row can be
// marked read independently by each recipient. See lib/notifications.js for the
// create helpers and the per-user visibility filter.
const notificationSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: ["admins", "staff", "user"],
      required: true,
    },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Free-form category used for icon/grouping on the client.
    type: { type: String, default: "system" },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },

    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: { type: String, default: "" }, // e.g. /admin/orders/<id>

    // Who triggered it (null for system/automated events). Name snapshot kept.
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: "" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },

    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

notificationSchema.index({ audience: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
