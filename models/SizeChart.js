import mongoose from "mongoose";

const sizeChartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    columns: { type: [String], default: ["Size", "Chest (cm)", "Waist (cm)", "Length (cm)"] },
    rows: { type: [[String]], default: [] },
  },
  { timestamps: true }
);

const SizeChart = mongoose.models.SizeChart || mongoose.model("SizeChart", sizeChartSchema);
export default SizeChart;
