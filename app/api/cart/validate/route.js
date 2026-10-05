export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { quoteCart, quoteLines, reconcileLines } from "@/lib/cart";
import { jsonBody } from "@/lib/http";
import { getShopper } from "@/lib/session";

// What the stored cart is still worth, according to the brand ERP.
//
// The cart lives in localStorage, so it long outlives the page that filled it:
// products leave the website, sizes sell out, prices change. This answers, per
// line, whether it can still be bought and on what terms, so the cart heals
// itself before checkout instead of dead-ending in it. It is advisory only —
// the ERP's checkout re-prices everything and is what holds the stock.
export async function POST(request) {
  const body = await jsonBody(request);
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 50);
  const lines = quoteLines(items);
  if (!lines.length) return NextResponse.json({ lines: [] });
  try {
    const shopper = await getShopper();
    const quote = await quoteCart({ lines, accountId: shopper?.accountId });
    return NextResponse.json({ lines: reconcileLines(items, quote) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/cart/validate error:", err?.code || err?.message);
    return NextResponse.json({ error: "Failed to validate cart" }, { status: 502 });
  }
}
