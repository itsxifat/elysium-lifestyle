import "server-only";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";

// SSLCommerz sends the shopper back to this site with a form post carrying
// `tran_id` (and, on success, `val_id`). Nothing in it is believed here: it is
// relayed to the brand ERP (POST /storefront/v1/payments/sslcommerz/return),
// which checks the payment with SSLCommerz's validation API and answers paid,
// refused, checking or cancelled (D-525, D-527). The shopper then lands on the
// order's own page, which reads the order back from the ERP.

function siteUrl(request) {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

async function fieldsOf(request) {
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    return { tranId: params.get("tran_id"), valId: params.get("val_id") };
  }
  try {
    const form = await request.formData();
    return { tranId: form.get("tran_id"), valId: form.get("val_id") };
  } catch {
    return { tranId: null, valId: null };
  }
}

export async function relayPaymentReturn(request, kind) {
  const base = siteUrl(request);
  const { tranId, valId } = await fieldsOf(request);
  const tran = String(tranId || "").trim();
  if (tran.length < 6 || tran.length > 40) {
    return NextResponse.redirect(new URL("/checkout?error=payment_failed", base), 303);
  }
  const body = { kind, tranId: tran };
  const val = String(valId || "").trim();
  if (kind === "success" && val && val.length <= 80) body.valId = val;
  try {
    const { body: answer } = await erpPost(erpPath("/payments/sslcommerz/return"), body, { timeoutMs: 25_000 });
    const { orderNo, status } = answer.payment;
    const target = new URL(`/order-confirmation/${encodeURIComponent(orderNo)}`, base);
    target.searchParams.set("payment", status);
    return NextResponse.redirect(target, 303);
  } catch (error) {
    console.error(`[payment] return (${kind}) relay failed:`, error?.code || error?.message);
    return NextResponse.redirect(new URL("/checkout?error=payment_failed", base), 303);
  }
}
