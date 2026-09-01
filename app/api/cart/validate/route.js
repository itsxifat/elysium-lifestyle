import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import { getActiveFlashSale, getFlashPriceMap } from "@/lib/flashSale";
import { checkRateLimit } from "@/lib/rate-limit";

// What the cart is actually worth, according to the server.
//
// The cart lives in localStorage, so it long outlives the page that filled it:
// products get unpublished, sizes sell out, prices change, and a reseeded or
// pruned catalogue can leave it pointing at ids that no longer exist. Checkout
// used to be the first place any of that surfaced, as a flat "Product not
// found" that the customer could do nothing about — the dead line stayed in
// their cart and every retry failed the same way.
//
// This endpoint answers one question per line: can it still be bought, and on
// what terms? The client uses the answer to heal the cart before checkout
// rather than dead-ending in it. It is advisory only — the order route still
// re-checks everything and is the thing that actually reserves stock.

export async function POST(request) {
  try {
    const limited = checkRateLimit(request, "cart-validate", { limit: 120, windowMs: 5 * 60 * 1000 });
    if (limited) return limited;

    await connectDB();
    const data = await request.json();
    const items = Array.isArray(data?.items) ? data.items.slice(0, 50) : [];
    if (!items.length) return NextResponse.json({ lines: [] });

    const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    // Only published products are buyable, so an unpublished one is reported
    // exactly like a deleted one — the customer cannot order either.
    const products = await Product.find({ _id: { $in: ids }, isPublished: true })
      .select("name slug images variants isPublished")
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const flashMap = getFlashPriceMap(await getActiveFlashSale());

    const lines = items.map((item) => {
      const base = { productId: item.productId, size: item.size, requested: Number(item.quantity) || 0 };
      const product = byId.get(String(item.productId));
      if (!product) return { ...base, status: "gone", available: 0, reason: "This product is no longer available." };

      const variant = product.variants?.find((v) => v.size === item.size);
      if (!variant)
        return {
          ...base,
          name: product.name,
          status: "gone",
          available: 0,
          reason: `${product.name} no longer comes in size ${item.size}.`,
        };

      // Charge what the order route would charge: the flash price while its
      // allocation lasts and it actually undercuts the shelf price.
      let price = variant.price;
      const flash = flashMap.get(String(product._id));
      if (flash && flash.remaining > 0 && flash.salePrice < variant.price) price = flash.salePrice;

      const available = Math.max(0, variant.stock || 0);
      const status =
        available === 0 ? "out" : base.requested > available ? "limited" : "ok";

      return {
        ...base,
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] || "",
        sku: variant.sku || "",
        price,
        available,
        status,
        reason:
          status === "out"
            ? `${product.name} (${item.size}) is out of stock.`
            : status === "limited"
            ? `Only ${available} left of ${product.name} (${item.size}).`
            : undefined,
      };
    });

    return NextResponse.json({ lines });
  } catch (err) {
    console.error("POST /api/cart/validate error:", err);
    return NextResponse.json({ error: "Failed to validate cart" }, { status: 500 });
  }
}
