import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

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

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const FraudAccount = tenantModel("FraudAccount", fraudAccountSchema);
export default FraudAccount;
