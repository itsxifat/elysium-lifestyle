export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getProduct } from "@/lib/storefront";
import { erpFailure } from "@/lib/http";

// One product by its address (slug), with every size's live stock and price and
// any flash price — what the quick-add modal needs. An old address answers with
// the product at its new one.
export async function GET(_request, { params }) {
  try {
    let found = await getProduct(params.id);
    if (found?.redirect) found = await getProduct(found.redirect);
    if (!found?.product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json({ product: found.product });
  } catch (error) {
    return erpFailure(error);
  }
}
