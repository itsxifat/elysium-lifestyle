import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// In-panel notifications.
//
// Targeting model:
//  - `roles`   → the staff roles that should see this row (resolved per event
//                from the admin-configurable routing matrix). A user sees a row
//                if their role is in `roles`.
//  - `recipient` → one specific person, e.g. "your PIN was reset".
//  - `audience`  → LEGACY bucket ("admins" | "staff" | "user") kept only so
//                rows created before role-routing still resolve. New rows use
//                `roles`/`recipient`. See lib/notifications.js.
//
// Read state is tracked per-user via `readBy` so a single broadcast row can be
// marked read independently by each recipient. See lib/notifications.js for the
// create helpers and the per-user visibility filter.
const notificationSchema = new mongoose.Schema(
  {
    // Staff roles that should receive this notification.
    roles: { type: [String], default: [] },
    // Legacy audience bucket (back-compat only — no longer written for events).
    audience: {
      type: String,
      enum: ["admins", "staff", "user"],
      default: null,
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

notificationSchema.index({ roles: 1, createdAt: -1 });
notificationSchema.index({ audience: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const Notification = tenantModel("Notification", notificationSchema);
export default Notification;
