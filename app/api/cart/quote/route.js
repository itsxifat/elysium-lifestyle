export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { quoteCart, quoteLines } from "@/lib/cart";
import { erpFailure, jsonBody } from "@/lib/http";
import { getShopper } from "@/lib/session";

// The cart priced by the brand ERP: items, discounts, delivery for the chosen
// district and thana, and the total. Writes nothing. Called by the cart and the
// checkout whenever the cart, the address or a code changes.
export async function POST(request) {
  const body = await jsonBody(request);
  const lines = quoteLines(body?.lines);
  if (!lines.length) return NextResponse.json({ quote: null });
  try {
    const shopper = await getShopper();
    const quote = await quoteCart({
      lines,
      address: body?.address,
      codes: body?.codes,
      accountId: shopper?.accountId,
      phone: body?.phone,
    });
    return NextResponse.json({ quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return erpFailure(error);
  }
}
