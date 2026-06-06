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
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
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
