export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TrackingConfig from "@/models/TrackingConfig";
import { requireAdmin } from "@/lib/auth";
import {
  getTrackingConfig,
  redactConfig,
  stripMaskedSecrets,
  bustConfigCache,
} from "@/lib/tracking/config";

const ALLOWED = ["meta", "ga4", "proxy", "testMode", "events", "logRetentionDays"];

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const config = await getTrackingConfig({ fresh: true });
    return NextResponse.json(redactConfig(config));
  } catch {
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}

export async function PUT(request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    await connectDB();
    const body = await request.json();
    const update = {};
    for (const k of ALLOWED) if (body[k] !== undefined) update[k] = body[k];
    stripMaskedSecrets(update);

    const saved = await TrackingConfig.findOneAndUpdate(
      {},
      { $set: update },
      { upsert: true, new: true }
    ).lean();
    bustConfigCache(); // live edits take effect immediately (same process)
    return NextResponse.json(redactConfig(saved));
  } catch (err) {
    console.error("[tracking] config PUT error:", err.message);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
