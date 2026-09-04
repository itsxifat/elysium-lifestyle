import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

const addressSchema = new mongoose.Schema({
  street: String,
  city: String,
  state: String,
  postalCode: String,
  country: { type: String, default: "Bangladesh" },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Guests created from a landing-page order may have no email at all (a phone
    // number is the only thing we're guaranteed), so the unique index is sparse:
    // any number of documents may omit the field, but a present email is unique.
    // NOTE: existing databases carry a non-sparse `email_1` index — run
    // scripts/migrate-guest-users.mjs once to rebuild it.
    email: {
      type: String,
      required: function () {
        return !this.isGuest;
      },
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, select: false },
    image: { type: String },
    role: {
      type: String,
      enum: ["customer", "staff", "moderator", "admin", "superadmin"],
      default: "customer",
    },
    // Additive permission grants beyond the role's defaults (managed by a
    // superadmin). See lib/permissions.js for the catalog of keys.
    permissions: { type: [String], default: [] },

    // ── Admin security PIN ──────────────────────────────────────────────────
    // 6-digit PIN every panel member (incl. superadmin) must create. Required
    // as a second factor for critical actions (order edits, status/payment
    // changes, returns). Stored as a bcrypt hash. See lib/pin.js.
    adminPin: { type: String, select: false },
    pinSetAt: { type: Date, default: null },
    pinFailedAttempts: { type: Number, default: 0, select: false }, // brute-force counter
    pinLockedUntil: { type: Date, default: null }, // temporary lockout after too many fails

    // ── Guest customers ─────────────────────────────────────────────────────
    // A stub created when an order arrives (today: from a landing page) whose
    // phone/email matches nobody. It holds the order history so that when the
    // person eventually registers with an email and verifies it, we claim this
    // same document — their past orders are already attached. Guests can never
    // sign in: they have no password and `isGuest` stays true until verified.
    // See lib/customer-link.js.
    isGuest: { type: Boolean, default: false },
    guestSource: { type: String, default: "" }, // e.g. "landing_page"

    address: addressSchema,
    phone: { type: String, trim: true, index: true }, // normalised 01XXXXXXXXX
    emailVerified: { type: Boolean, default: false },
    verificationOTP: { type: String, select: false },
    verificationOTPExpiry: { type: Date },
    verificationOTPAttempts: { type: Number, default: 0, select: false },
    resetToken: { type: String, select: false },
    resetTokenExpiry: { type: Date },
  },
  { timestamps: true }
);

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const User = tenantModel("User", userSchema);
export default User;
