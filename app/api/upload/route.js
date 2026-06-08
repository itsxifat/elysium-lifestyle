import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import ImageHash from "@/models/ImageHash";
import { uploadToCDN, cdnProxyPath } from "@/lib/cdn";
import { deleteImageIfUnreferenced } from "@/lib/images";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // De-dup: if these exact bytes were uploaded before, reuse the existing
    // file instead of uploading again.
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    await connectDB();
    const existing = await ImageHash.findOne({ hash }).lean();
    if (existing) {
      return NextResponse.json({ url: existing.value, deduped: true });
    }

    const { clientId, filename } = await uploadToCDN(
      buffer,
      file.name || "upload",
      file.type || "application/octet-stream"
    );

    // Store the internal proxy path, not the raw CDN URL, so <Image> can
    // optimize it (the proxy signs the request to bypass domain locking).
    const value = cdnProxyPath(clientId, filename);
    await ImageHash.create({ hash, value }).catch(() => {}); // ignore race dup-key
    return NextResponse.json({ url: value });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { url } = await request.json();
    // Only delete if nothing references it (the same file may be shared via
    // de-dup / product duplication).
    await deleteImageIfUnreferenced(url);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
