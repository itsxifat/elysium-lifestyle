export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full catalogue import can take a while

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";
import { backfillSkus, migrateCatalogue, reconcileStock } from "@/lib/ncom-sync";

// Runs one of the three operations and returns its log verbatim, so the panel
// shows exactly what the CLI would print.
//
// Every action defaults to a DRY RUN. Writing requires an explicit
// `dryRun: false` from the client — a mis-parsed body can't push a catalogue.
export async function POST(request) {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;

  await connectDB();

  try {
    switch (body.action) {
      case "backfill-skus":
        return NextResponse.json(await backfillSkus({ dryRun, enableScheme: !!body.enableScheme }));

      case "migrate": {
        const settings = await Settings.findOne({}).select("ncom").lean();
        return NextResponse.json(
          await migrateCatalogue({
            dryRun,
            includeImages: settings?.ncom?.includeImages !== false,
            skipStock: !!body.skipStock,
          })
        );
      }

      case "reconcile":
        return NextResponse.json(await reconcileStock({ dryRun }));

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("[ncom] sync action failed:", body.action, e);
    return NextResponse.json(
      { ok: false, log: [{ level: "error", text: e.message || "Operation failed" }] },
      { status: 500 }
    );
  }
}
