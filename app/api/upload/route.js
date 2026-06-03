import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { uploadToCDN, cdnProxyPath, deleteFromCDN } from "@/lib/cdn";

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
    const { clientId, filename } = await uploadToCDN(
      buffer,
      file.name || "upload",
      file.type || "application/octet-stream"
    );

    // Store the internal proxy path, not the raw CDN URL, so <Image> can
    // optimize it (the proxy signs the request to bypass domain locking).
    return NextResponse.json({ url: cdnProxyPath(clientId, filename) });
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
    // deleteFromCDN is idempotent and no-ops on non-CDN values (legacy
    // /uploads, external URLs), so this is always safe to call.
    await deleteFromCDN(url);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
