export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import "@/models/User";
import { syncCourierStatuses } from "@/lib/courier-sync";

// Sync one order's delivery status from Steadfast (the Courier panel's button
// on the order detail page). Returns the sync report plus the refreshed order.
//
// `includeSettled` is on: asking about one specific parcel is a deliberate act,
// so it is answered even when we already hold a settled status for it.
export async function POST(request, { params }) {
  const { error, session } = await requireAdmin("orders.manage");
  if (error) return error;

  const actorName = `Steadfast sync (${session.user.name || session.user.email || "staff"})`;

  try {
    const result = await syncCourierStatuses({
      orderIds: [params.id],
      includeSettled: true,
      actorName,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const row = result.results?.[0];
    if (!row) {
      return NextResponse.json(
        { error: "This order was never sent to Steadfast, so it has no delivery status to check." },
        { status: 400 }
      );
    }
    if (!row.ok) return NextResponse.json({ error: row.error }, { status: 400 });

    await connectDB();
    const order = await Order.findById(params.id).populate("user", "name email").lean();
    return NextResponse.json({ ...row, order });
  } catch (err) {
    console.error("POST /api/admin/orders/[id]/sync-courier error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
