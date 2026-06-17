import mongoose from "mongoose";

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
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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

    address: addressSchema,
    phone: { type: String, trim: true },
    emailVerified: { type: Boolean, default: false },
    verificationOTP: { type: String, select: false },
    verificationOTPExpiry: { type: Date },
    verificationOTPAttempts: { type: Number, default: 0, select: false },
    resetToken: { type: String, select: false },
    resetTokenExpiry: { type: Date },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
