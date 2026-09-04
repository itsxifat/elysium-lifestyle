export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120; // a dozen round-trips to our own public URL

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";
import { runSelfTest } from "@/lib/ncom-selftest";

// Runs the conformance checks against our own connector, over the public
// internet, so what passes here is what ncom will see.
export async function POST(request) {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();

  const body = await request.json().catch(() => ({}));
  // The browser knows the origin it reached us on, which is the right answer on
  // a host where NEXT_PUBLIC_SITE_URL was never set.
  const origin = typeof body.origin === "string" && /^https?:\/\//i.test(body.origin) ? body.origin : undefined;

  try {
    const result = await runSelfTest({ origin });
    Settings.updateOne({}, { $set: { "ncom.lastSelfTestAt": new Date(), "ncom.lastSelfTestOk": !!result.ok } }).catch(() => {});
    return NextResponse.json(result);
  } catch (e) {
    console.error("[ncom] self-test failed:", e);
    return NextResponse.json(
      { ok: false, checks: [], log: [{ level: "error", text: e.message || "Self-test failed" }] },
      { status: 500 }
    );
  }
}
