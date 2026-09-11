export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  executeRun,
  findActiveRun,
  getRun,
  listRuns,
  reconstructRuns,
  startRun,
} from "@/lib/courier-sync-runs";

// "Sync delivery status" on /admin/orders.
//
// POST starts a run and answers straight away with its id: a shop with a few
// hundred live consignments is a few hundred throttled requests to Steadfast,
// which is minutes of work, and a browser request held open that long is a
// gateway timeout and a staff member who cannot tell whether anything
// happened. The work reports into the run document (models/CourierSyncRun) —
// the popup polls it, and a notification announces the result to whoever has
// closed the popup and moved on.
//
// GET reads the history: the list of past runs, or one run in full.
//
// Both require orders.manage rather than orders.view, because a sync MOVES
// orders (delivered / cancelled / return requested), hands stock back and can
// mark COD payments paid.

export async function POST(request) {
  const { error, session } = await requireAdmin("orders.manage");
  if (error) return error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* an empty body is the ordinary case — sync every live consignment */
  }

  // Rebuilding the history of syncs run before this record existed. Same
  // permission, same route: it is the history's own maintenance action.
  if (body.action === "import-history") {
    try {
      const result = await reconstructRuns();
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      console.error("POST sync-courier import-history error:", err);
      return NextResponse.json({ error: err.message || "Could not rebuild history" }, { status: 500 });
    }
  }

  // One run at a time. Two staff pressing the button a minute apart should
  // watch the same run rather than double the load on Steadfast.
  const active = await findActiveRun();
  if (active) {
    return NextResponse.json({ ok: true, alreadyRunning: true, runId: String(active._id), run: active });
  }

  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter(Boolean).slice(0, 500) : null;
  const includeSettled = !!body.includeSettled;
  const byName = session.user.name || session.user.email || "Staff";

  const run = await startRun({
    by: session.user.id,
    byName,
    trigger: "manual",
    includeSettled,
    scope: orderIds
      ? `${orderIds.length} selected order${orderIds.length === 1 ? "" : "s"}`
      : includeSettled
        ? "Every consignment, settled included"
        : "All live consignments",
  });

  // Deliberately NOT awaited: the response goes back now and the sync carries
  // on in this (long-lived, pm2-managed) process. executeRun never throws.
  executeRun(run._id, { orderIds, includeSettled, actorName: `Steadfast sync (${byName})` });

  return NextResponse.json({ ok: true, runId: String(run._id), run: run.toObject() });
}

export async function GET(request) {
  const { error } = await requireAdmin("orders.manage");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (runId) {
    const run = await getRun(runId);
    if (!run) return NextResponse.json({ error: "Sync run not found" }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  }

  const runs = await listRuns({ limit: Number(searchParams.get("limit")) || 30 });
  return NextResponse.json({ ok: true, runs });
}
