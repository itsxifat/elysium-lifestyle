export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TrackingEvent from "@/models/TrackingEvent";
import { requireAdmin } from "@/lib/auth";
import { getTrackingConfig } from "@/lib/tracking/config";
import { sendToMeta } from "@/lib/tracking/meta";
import { sendToGa4 } from "@/lib/tracking/ga4";

export async function GET(_request, { params }) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    await connectDB();
    const doc = await TrackingEvent.findById(params.id).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch {
    return NextResponse.json({ error: "Failed to load event" }, { status: 500 });
  }
}

// Retry a failed send. We re-POST the EXACT stored request payload (already
// normalized/hashed at first send), so no raw PII is needed. Body: { platform }
// where platform is "meta" | "ga4" | omitted (retry all failed).
export async function POST(request, { params }) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    await connectDB();
    const doc = await TrackingEvent.findById(params.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const only = body.platform; // "meta" | "ga4" | undefined
    const config = await getTrackingConfig({ fresh: true });

    const wantMeta = (!only || only === "meta") && doc.meta?.request;
    const wantGa4 = (!only || only === "ga4") && doc.ga4?.request;

    if (wantMeta) {
      const r = await sendToMeta({ config, payload: doc.meta.request });
      doc.meta = { ...doc.meta.toObject?.() ?? doc.meta, ...r };
    }
    if (wantGa4) {
      const r = await sendToGa4({
        config,
        payload: doc.ga4.request,
        userAgent: doc.user?.userAgent,
        debug: doc.testMode,
      });
      doc.ga4 = { ...doc.ga4.toObject?.() ?? doc.ga4, ...r };
    }

    // Recompute overall status.
    const states = [doc.meta, doc.ga4].filter((p) => p.attempted).map((p) => p.status);
    doc.status =
      states.length === 0
        ? "skipped"
        : states.every((s) => s === "success")
        ? "success"
        : states.every((s) => s === "error")
        ? "error"
        : "partial";

    await doc.save();
    return NextResponse.json(doc.toObject());
  } catch (err) {
    console.error("[tracking] retry error:", err.message);
    return NextResponse.json({ error: "Retry failed" }, { status: 500 });
  }
}
