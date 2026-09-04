export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAdmin } from "@/lib/auth";
import { backfillSkus } from "@/lib/sku-backfill";

// Catalogue housekeeping, not an ncom operation: SKUs travel to ncom as
// metadata and are copied onto their order lines, but stock is addressed by
// variant id and no longer depends on them.
//
// Defaults to a DRY RUN. Writing requires an explicit `dryRun: false` from the
// client, so a mis-parsed body cannot renumber a catalogue.
export async function POST(request) {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  await connectDB();

  try {
    return NextResponse.json(
      await backfillSkus({ dryRun: body.dryRun !== false, enableScheme: !!body.enableScheme })
    );
  } catch (e) {
    console.error("[ncom] SKU backfill failed:", e);
    return NextResponse.json(
      { ok: false, log: [{ level: "error", text: e.message || "Operation failed" }] },
      { status: 500 }
    );
  }
}
