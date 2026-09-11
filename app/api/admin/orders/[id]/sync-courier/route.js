export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import "@/models/User";
import { executeRun, startRun } from "@/lib/courier-sync-runs";

// Sync ONE order's delivery status from Steadfast (the Courier panel's button
// on the order detail page). Returns the result plus the refreshed order.
//
// Awaited rather than backgrounded like the bulk sync: this is a single
// throttled request, so the answer is there before the browser gets bored — and
// the person who pressed it is looking straight at the panel that changes.
// It still writes a run, so per-order checks appear in the sync history too.
//
// `includeSettled` is on: asking about one specific parcel is a deliberate act,
// so it is answered even when we already hold a settled status for it.
export async function POST(request, { params }) {
  const { error, session } = await requireAdmin("orders.manage");
  if (error) return error;

  const byName = session.user.name || session.user.email || "Staff";

  try {
    await connectDB();
    const existing = await Order.findById(params.id).select("orderNumber").lean();
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const run = await startRun({
      by: session.user.id,
      byName,
      trigger: "order",
      includeSettled: true,
      scope: `Order ${existing.orderNumber}`,
    });

    const report = await executeRun(run._id, {
      orderIds: [params.id],
      includeSettled: true,
      actorName: `Steadfast sync (${byName})`,
    });

    if (!report.ok) return NextResponse.json({ error: report.error }, { status: 400 });

    const row = report.results?.[0];
    if (!row) {
      return NextResponse.json(
        { error: "This order was never sent to Steadfast, so it has no delivery status to check." },
        { status: 400 }
      );
    }
    if (!row.ok) return NextResponse.json({ error: row.error }, { status: 400 });

    const order = await Order.findById(params.id).populate("user", "name email").lean();
    return NextResponse.json({ ...row, runId: String(run._id), order });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/sync-courier error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
