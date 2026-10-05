export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost, forgetReads, isIdempotencyKey } from "@/lib/erp";
import { quoteLines } from "@/lib/cart";
import { erpFailure, jsonBody } from "@/lib/http";
import { getShopper } from "@/lib/session";
import { clientOf } from "@/lib/shopper";
import { rememberOrderToken } from "@/lib/order-token";
import { normalizeBdPhone } from "@/lib/utils";

// Place the order in the brand ERP (POST /storefront/v1/checkout, D-521).
//
// The browser sends a fresh Idempotency-Key per "Place order" press (and the
// same key on a retry of that press), and the `expected` figures of the quote
// the shopper confirmed: if anything moved, the ERP places nothing and answers
// 409 CART_REPRICED with the new quote, which is passed back to be shown. The
// stock is held from this moment. The signed-in shopper's account and the
// shopper's address are added here, never taken from the browser.

const POISHA = /^\d{1,16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value, max) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : undefined;
}

export async function POST(request) {
  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!isIdempotencyKey(idempotencyKey)) {
    return NextResponse.json({ error: "Please press Place order again.", code: "IDEMPOTENCY_KEY_INVALID" }, { status: 400 });
  }
  const body = await jsonBody(request);
  const lines = quoteLines(body?.lines);
  if (!lines.length) return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });

  const expected = body?.expected;
  if (!expected || !POISHA.test(String(expected.totalPoisha || ""))) {
    return NextResponse.json({ error: "Please review your order total and try again." }, { status: 400 });
  }
  const paymentMethod = body?.paymentMethod === "sslcommerz" ? "sslcommerz" : "cod";
  const email = text(body?.contact?.email, 254);

  const shopper = await getShopper();
  const order = {
    lines,
    contact: {
      name: text(body?.contact?.name, 200) || "",
      phone: normalizeBdPhone(body?.contact?.phone || "").slice(0, 32),
      ...(email ? { email } : {}),
    },
    address: {
      districtId: Number(body?.address?.districtId),
      thanaId: Number(body?.address?.thanaId),
      ...(text(body?.address?.area, 160) ? { area: text(body.address.area, 160) } : {}),
      addressLine: text(body?.address?.addressLine, 500) || "",
    },
    paymentMethod,
    locale: body?.locale === "en" ? "en" : "bn",
    expected: {
      totalPoisha: String(expected.totalPoisha),
      lines: (Array.isArray(expected.lines) ? expected.lines : [])
        .filter((l) => UUID.test(String(l?.skuId)) && POISHA.test(String(l?.unitPricePoisha)))
        .slice(0, 50)
        .map((l) => ({ skuId: l.skuId, unitPricePoisha: String(l.unitPricePoisha) })),
    },
  };
  const codes = (Array.isArray(body?.codes) ? body.codes : []).map((c) => String(c).trim().toUpperCase()).filter((c) => c.length >= 3 && c.length <= 40).slice(0, 5);
  if (codes.length) order.codes = codes;
  const notes = text(body?.notes, 1000);
  if (notes) order.notes = notes;
  if (shopper) order.accountId = shopper.accountId;
  const client = clientOf(request);
  if (client) order.client = client;

  try {
    const { body: answer, replayed } = await erpPost(erpPath("/checkout"), order, { idempotencyKey, timeoutMs: 15_000 });
    // The view token stays out of the page: it is kept in an HttpOnly cookie
    // for this order, which the confirmation page and the payment step read.
    const { viewToken, ...placed } = answer.order;
    // The order now holds stock: the next product page must not show the old count.
    forgetReads("/storefront/v1/catalog/");
    forgetReads("/storefront/v1/flash-sales");
    const response = NextResponse.json({ order: placed, replayed }, { status: 201, headers: { "Cache-Control": "no-store" } });
    rememberOrderToken(response, placed.orderNo, viewToken);
    return response;
  } catch (error) {
    return erpFailure(error);
  }
}
