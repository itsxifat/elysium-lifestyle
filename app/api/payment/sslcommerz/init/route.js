export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { getShopper } from "@/lib/session";
import { isOrderNo, rememberedOrderToken } from "@/lib/order-token";

// Open an SSLCommerz payment page for an order just placed (or still unpaid):
// the brand ERP opens the session with SSLCommerz (waiting up to 15 seconds) and
// answers with the gateway's page, where the shopper is sent next. The order is
// named by this browser's view token for it, or by the signed-in account.
export async function POST(request) {
  const body = await jsonBody(request);
  const orderNo = String(body?.orderNo || "");
  if (!isOrderNo(orderNo)) return NextResponse.json({ error: "No such order." }, { status: 404 });

  const shopper = await getShopper();
  const token = rememberedOrderToken(orderNo);
  if (!token && !shopper) return NextResponse.json({ error: "No such order." }, { status: 404 });
  const ask = token ? { orderNo, token } : { orderNo, accountId: shopper.accountId };
  try {
    const { body: answer } = await erpPost(erpPath("/payments/sslcommerz/init"), ask, { timeoutMs: 25_000 });
    return NextResponse.json({ gatewayUrl: answer.payment.gatewayUrl, expiresAt: answer.payment.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return erpFailure(error);
  }
}
