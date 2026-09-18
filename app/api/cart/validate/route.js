import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import { previewFlashPrices } from "@/lib/flashSale";
import { formatPrice } from "@/lib/utils";
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

    // Charge what the order route would charge: each line priced by the flash
    // offer checkout would claim for it, in the same order, whole lines only.
    const resolved = items.map((item) => {
      const product = byId.get(String(item.productId));
      const variant = product?.variants?.find((v) => v.size === item.size);
      return { item, product, variant };
    });
    const plan = await previewFlashPrices(
      resolved.map(({ item, variant }) => ({
        productId: String(item.productId),
        size: item.size,
        quantity: Number(item.quantity) || 0,
        regularPrice: variant ? variant.price : 0,
      }))
    );

    const lines = resolved.map(({ item, product, variant }, k) => {
      const base = { productId: item.productId, size: item.size, requested: Number(item.quantity) || 0 };
      if (!product) return { ...base, status: "gone", available: 0, reason: "This product is no longer available." };

      if (!variant)
        return {
          ...base,
          name: product.name,
          status: "gone",
          available: 0,
          reason: `${product.name} no longer comes in size ${item.size}.`,
        };

      const label = `${product.name} (${item.size})`;
      const { offer, left, best } = plan[k];
      const price = offer ? offer.price : variant.price;
      const stock = Math.max(0, variant.stock || 0);
      // A line on the flash price can only grow as far as the allocation it
      // was priced from; past that the whole line would fall back to the shelf
      // price, so the cart caps it there instead.
      const available = offer ? Math.min(stock, left) : stock;
      const stockStatus = stock === 0 ? "out" : base.requested > available ? "limited" : "ok";

      // Tell the customer when the price they were shown has moved.
      const shown = Number(item.price);
      const moved = Number.isFinite(shown) && Math.abs(shown - price) >= 1;
      let reason;
      if (stockStatus === "out") reason = `${label} is out of stock.`;
      else if (stockStatus === "limited") reason = `Only ${available} left of ${label}.`;
      else if (moved && price < shown) reason = `${label} is on flash sale — now ${formatPrice(price)}.`;
      else if (moved && best && best.left < base.requested)
        reason = `Only ${best.left} of ${label} left at the flash price (${formatPrice(best.offer.price)}) — lower the quantity to ${best.left} to keep it.`;
      else if (moved && shown < variant.price) reason = `The flash deal on ${label} has ended — it's ${formatPrice(price)} now.`;
      else if (moved) reason = `${label} is now ${formatPrice(price)}.`;

      return {
        ...base,
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] || "",
        sku: variant.sku || "",
        price,
        regularPrice: variant.price,
        flash: offer ? { saleId: offer.saleId, slug: offer.slug, title: offer.title } : null,
        available,
        status: stockStatus === "ok" && moved ? "repriced" : stockStatus,
        reason,
      };
    });

    return NextResponse.json({ lines });
  } catch (err) {
    console.error("POST /api/cart/validate error:", err);
    return NextResponse.json({ error: "Failed to validate cart" }, { status: 500 });
  }
}
