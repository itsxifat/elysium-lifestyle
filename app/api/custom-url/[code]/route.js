export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import CustomUrl from "@/models/CustomUrl";
import { buildBasePath } from "@/lib/customUrl";

// Public: the storefront resolves a ?cu=<code> suffix to its campaign config —
// highlight products (in order), the top banner, and the modal notification.
export async function GET(_, { params }) {
  try {
    await connectDB();
    const code = String(params.code || "").trim();
    if (!/^\d{4,6}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const doc = await CustomUrl.findOne({ code, isActive: true })
      .populate("category", "name slug")
      .populate({
        path: "highlightProducts",
        match: { isPublished: true },
        select: "name slug images variants isNewArrival",
      })
      .lean();

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Count the visit without blocking the response.
    CustomUrl.updateOne({ _id: doc._id }, { $inc: { views: 1 } }).catch(() => {});

    return NextResponse.json({
      code: doc.code,
      title: doc.title,
      basePath: buildBasePath(doc),
      banner: doc.banner?.enabled ? doc.banner : null,
      modal: doc.modal?.enabled ? doc.modal : null,
      highlightProducts: (doc.highlightProducts || []).filter(Boolean),
    });
  } catch (err) {
    console.error("GET /api/custom-url/[code] error:", err);
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 500 });
  }
}
