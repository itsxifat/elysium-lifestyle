import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// Content-hash -> stored image value map, used to dedup uploads: if the exact
// same image bytes are uploaded again, we reuse the existing CDN file instead
// of uploading a duplicate.
const imageHashSchema = new mongoose.Schema(
  {
    hash: { type: String, required: true, unique: true }, // sha256 of the file
    value: { type: String, required: true }, // stored proxy path (/api/img/...)
  },
  { timestamps: true }
);

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const ImageHash = tenantModel("ImageHash", imageHashSchema);
export default ImageHash;
