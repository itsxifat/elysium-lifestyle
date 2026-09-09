export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { retryPendingNcomChanges } from "@/lib/ncom-orders";
import { getNcomConfig } from "@/lib/ncom";
import { secretEquals } from "@/lib/ncom-signature";

// Retries changes to ncom orders that have not reached ncom yet.
//
// The first attempt at telling ncom happens inline, in the request that made
// the change. Every attempt after that has to come from here: the request is
// long gone by the time the second is due, and holding one open for six hours
// to make it is not a plan.
//
// WITHOUT THIS, A FAILED NOTIFICATION IS LOST FOR EVER. An order cancelled here
// while ncom was having a bad minute goes on showing as live on their side —
// still offering a dispatch, still holding the stock of anything they store.
// Run it about every minute:
//
//   * * * * *  curl -fsS -H "Authorization: Bearer $NCOM_ORDER_SECRET" \
//                https://<your-domain>/api/ncom/outbox
//
// Authorised with the order secret rather than a new credential: it is the one
// already shared with ncom for exactly this integration, and rotating it kills
// this too. The endpoint causes outbound HTTP to an address an admin controls,
// so an open one would be a way to make this server generate traffic on demand.
export async function POST(request) {
  return run(request);
}

/** GET behaves identically, for schedulers that can only issue one. */
export async function GET(request) {
  return run(request);
}

async function run(request) {
  await connectDB();
  const cfg = await getNcomConfig();

  // Fail closed. Without a secret there is nothing to authenticate against, and
  // an unauthenticated sweep is an open trigger.
  if (!cfg.orderSecret) {
    return NextResponse.json({ error: "Not configured" }, { status: 401 });
  }

  const header = request.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!secretEquals(presented, cfg.orderSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await retryPendingNcomChanges();
  return NextResponse.json({ ok: true, orders });
}
