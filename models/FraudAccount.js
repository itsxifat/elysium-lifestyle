import mongoose from "mongoose";

// Metadata mirror of the Steadfast (Packzy) merchant accounts used for fraud
// checks. The actual credentials are stored encrypted by the `steadfast-fraud`
// package in the OS config dir — we never keep passwords in our DB. This doc
// just powers the admin "Fraud Accounts" UI (which accounts exist + status).
const fraudAccountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    label: { type: String, default: "" },
    lastTestedAt: { type: Date, default: null },
    lastTestOk: { type: Boolean, default: null },
    lastTestMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

const FraudAccount =
  mongoose.models.FraudAccount || mongoose.model("FraudAccount", fraudAccountSchema);
export default FraudAccount;
