import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

const sizeChartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    columns: { type: [String], default: ["Size", "Chest (cm)", "Waist (cm)", "Length (cm)"] },
    rows: { type: [[String]], default: [] },
  },
  { timestamps: true }
);

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const SizeChart = tenantModel("SizeChart", sizeChartSchema);
export default SizeChart;
