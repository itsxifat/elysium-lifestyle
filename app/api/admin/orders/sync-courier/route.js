export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncCourierStatuses } from "@/lib/courier-sync";

// "Sync delivery status" on /admin/orders — asks Steadfast where every live
// consignment is and brings our order statuses in line with the answers.
//
// Only orders actually handed to Steadfast are in scope; see lib/courier-sync.
// Requires orders.manage rather than orders.view because it MOVES orders
// (delivered / cancelled), hands stock back and can mark COD payments paid.
export async function POST(request) {
  const { error, session } = await requireAdmin("orders.manage");
  if (error) return error;

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* an empty body is the ordinary case — sync everything live */
  }

  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter(Boolean).slice(0, 500) : null;
  const actorName = `Steadfast sync (${session.user.name || session.user.email || "staff"})`;

  try {
    const result = await syncCourierStatuses({
      orderIds,
      includeSettled: !!body.includeSettled,
      actorName,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/admin/orders/sync-courier error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
