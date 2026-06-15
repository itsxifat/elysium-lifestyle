export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { priceCartItems, applyDiscounts } from "@/lib/discountService";
import { checkRateLimit } from "@/lib/rate-limit";

// Public endpoint the cart/checkout calls to preview coupon + automatic
// discounts. Prices and eligibility are resolved server-side from the DB; the
// authoritative re-check happens again at order placement.
export async function POST(request) {
  try {
    // Throttle to stop coupon-code enumeration.
    const limited = checkRateLimit(request, "discount-validate", { limit: 30, windowMs: 5 * 60 * 1000 });
    if (limited) return limited;

    const session = await getServerSession(authOptions);
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const codes = Array.isArray(body.codes) ? body.codes : body.code ? [body.code] : [];
    const shippingFee = Number(body.shippingFee) || 0;

    if (rawItems.length === 0) {
      return NextResponse.json({ applied: [], rejected: [], discountTotal: 0, freeShipping: false, subtotal: 0 });
    }

    const items = await priceCartItems(rawItems);
    const result = await applyDiscounts({
      items,
      codes,
      shippingFee,
      userId: session?.user?.id || null,
      phone: body.phone || null,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/discounts/validate error:", err);
    return NextResponse.json({ error: "Failed to validate discount" }, { status: 500 });
  }
}
