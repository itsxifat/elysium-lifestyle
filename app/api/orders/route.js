import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import "@/models/User"; // ensure User schema is registered for .populate("user")
import { sendEmail, orderConfirmationTemplate } from "@/lib/email";
import { escapeRegExp, normalizeBdPhone } from "@/lib/utils";
import { findOrCreateCustomer } from "@/lib/customer-link";
import { trackPurchaseFromOrder } from "@/lib/tracking/server";
import { runFraudCheckForOrder } from "@/lib/fraud";
import { priceCartItems, applyDiscounts, recordDiscountUsage } from "@/lib/discountService";
import { getActiveFlashSale, getFlashPriceMap, claimFlashUnits, releaseFlashUnits } from "@/lib/flashSale";
import { notifyEvent } from "@/lib/notifications";
import { reserveStock, releaseStock } from "@/lib/stock";
import { createOrderWithNumber } from "@/lib/order-number";
import { checkRateLimit } from "@/lib/rate-limit";

// A basket bigger than this is not a customer, and a line quantity bigger than
// this is not a wardrobe. Both are cheap guards against a scripted client.
const MAX_LINES = 50;
const MAX_QTY_PER_LINE = 20;

export async function GET(request) {
  const { error } = await requireAdmin("orders.view");
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const query = {};
    if (status && status !== "all") query.orderStatus = status;
    const safeSearch = escapeRegExp(search);
    if (safeSearch) {
      const rx = { $regex: safeSearch, $options: "i" };
      query.$or = [
        { orderNumber: rx },
        { "shippingAddress.name": rx },
        { "shippingAddress.phone": rx },
        { "shippingAddress.email": rx },
        { guestEmail: rx },
        { "courier.consignmentId": rx },
        { "courier.trackingCode": rx },
        { "items.name": rx },
        { "items.sku": rx },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(query).populate("user", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(query),
    ]);

    return NextResponse.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const data = await request.json();

    // Placing an order is expensive (courier lookup, email, pixels) and creates
    // real records, so it cannot be an unmetered endpoint.
    //
    // The ceiling is deliberately loose. Mobile customers here sit behind
    // carrier-grade NAT, so one public IP can legitimately be a whole street of
    // shoppers — a tight limit would turn a busy flash sale into a wall of
    // refusals. This is sized to stop a script, not to ration real buyers.
    const limited = checkRateLimit(request, "create-order", { limit: 30, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;

    if (!data.items?.length) return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    if (!Array.isArray(data.items) || data.items.length > MAX_LINES)
      return NextResponse.json({ error: "Too many items in one order" }, { status: 400 });
    if (!data.shippingAddress || !data.paymentMethod) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Quantities decide what we charge and what we take out of stock, so they
    // are parsed here rather than trusted. A non-integer or out-of-range value
    // is a malformed request, not a quantity to guess at.
    for (const item of data.items) {
      const q = Number(item.quantity);
      if (!Number.isInteger(q) || q < 1 || q > MAX_QTY_PER_LINE)
        return NextResponse.json(
          { error: `Invalid quantity for one of the items (1–${MAX_QTY_PER_LINE} per size).` },
          { status: 400 }
        );
      item.quantity = q;
    }

    // Normalise the phone (Bangla→English digits, strip country code) so it's
    // stored, screened for fraud, and sent to the courier in ASCII 01XXXXXXXXX.
    if (data.shippingAddress.phone) data.shippingAddress.phone = normalizeBdPhone(data.shippingAddress.phone);

    // isPublished matters here: without it a draft or withdrawn product stays
    // orderable by anyone who kept its id in a stale cart.
    const productIds = data.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds }, isPublished: true }).lean();
    const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

    // Active flash sale → special price + limited stock, enforced here (never
    // trust the client's price). soldByProduct records what each line actually
    // managed to claim, so a failed order can hand it back.
    const flashSale = await getActiveFlashSale();
    const flashMap = getFlashPriceMap(flashSale);
    const soldByProduct = {};

    const orderItems = [];
    for (const item of data.items) {
      const product = productMap[item.productId];
      // Report these as structured lines rather than a bare message: the cart
      // lives in localStorage and can outlive the product it points at, and the
      // client needs to know WHICH line to drop. A flat "Product not found"
      // left the customer with a basket they could never check out.
      if (!product) {
        return NextResponse.json(
          {
            error: "Some items are no longer available.",
            unavailable: [{ product: item.productId, size: item.size, reason: "gone" }],
          },
          { status: 409 }
        );
      }

      // Find variant by size to get the real price
      const variant = product.variants?.find((v) => v.size === item.size);
      if (!variant) {
        return NextResponse.json(
          {
            error: `${product.name} is no longer available in size ${item.size}.`,
            unavailable: [{ product: item.productId, name: product.name, size: item.size, reason: "gone" }],
          },
          { status: 409 }
        );
      }

      // Claim the flash allocation here rather than after the order is written.
      // The claim is atomic and covers the full quantity, so the sale price is
      // only charged for units the allocation actually still has. If it cannot
      // cover them the customer simply pays the shelf price — an exhausted
      // promotion is not a reason to refuse the sale.
      let unitPrice = variant.price;
      const flash = flashMap.get(String(product._id));
      if (flash && flash.salePrice < variant.price) {
        const claimed = await claimFlashUnits(flashSale?._id, product._id, item.quantity, flash.stockLimit);
        if (claimed) {
          unitPrice = flash.salePrice;
          soldByProduct[String(product._id)] = (soldByProduct[String(product._id)] || 0) + item.quantity;
        }
      }

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images?.[0] || "",
        sku: variant.sku || "",
        size: item.size,
        price: unitPrice,
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const settings = await Settings.findOne({}).lean();
    const s = settings?.shipping || {};
    let shippingFee;
    if (s.freeShippingEnabled) {
      shippingFee = 0;
    } else {
      const freeThreshold = s.freeShippingThreshold ?? settings?.siteInfo?.freeShippingThreshold ?? 1500;
      if (subtotal >= freeThreshold) {
        shippingFee = 0;
      } else {
        const zone = data.shippingZone || "inside_dhaka";
        if (zone === "outside_dhaka") shippingFee = s.outsideDhaka ?? 130;
        else if (zone === "suburbs") shippingFee = s.suburbs ?? 100;
        else shippingFee = s.insideDhaka ?? 60;
      }
    }

    // ── Discounts (re-validated server-side; never trust client amounts) ──────
    let discount = 0;
    let discountCodes = [];
    let appliedDiscounts = [];
    try {
      const engineItems = await priceCartItems(data.items);
      // Keep the discount engine consistent with the flash price we charged.
      for (const ei of engineItems) {
        const flash = flashMap.get(String(ei.productId));
        if (flash && flash.remaining > 0 && flash.salePrice < ei.price) ei.price = flash.salePrice;
      }
      const dres = await applyDiscounts({
        items: engineItems,
        codes: data.discountCodes || [],
        shippingFee,
        userId: session?.user?.id || null,
        phone: data.shippingAddress?.phone || null,
      });
      discount = dres.discountTotal || 0;
      if (dres.freeShipping) shippingFee = 0;
      appliedDiscounts = (dres.applied || []).map((a) => ({
        discount: a.discountId || undefined,
        code: a.code,
        title: a.title,
        type: a.type,
        amount: a.amount,
        freeShipping: a.freeShipping,
      }));
      discountCodes = appliedDiscounts.filter((a) => a.code).map((a) => a.code);
    } catch (e) {
      console.error("discount apply error:", e.message);
    }

    const totalAmount = Math.max(0, subtotal + shippingFee - discount);

    // ── Who is this? ─────────────────────────────────────────────────────────
    // A signed-in shopper is themselves. A guest checkout is matched on
    // phone/email and, on a miss, gets a guest stub — so EVERY storefront order
    // shows up in the customer list and is claimed automatically if the person
    // later registers. Never let this block the sale: on failure the order is
    // still created, just unattached (the backfill script can repair it).
    let customerId = session?.user?.id || null;
    if (!customerId) {
      try {
        const { user } = await findOrCreateCustomer({
          name: data.shippingAddress?.name,
          phone: data.shippingAddress?.phone,
          email: data.guestEmail || data.shippingAddress?.email,
          source: "website",
        });
        customerId = user._id;
      } catch (e) {
        console.error("customer link error:", e.message);
      }
    }

    // ── Take the stock ───────────────────────────────────────────────────────
    // Before the order exists, and atomically. This is the only thing standing
    // between two people and the same last item: whoever loses the race matches
    // no document and is told the size has gone, rather than both being sold it.
    //
    // Every order reserves, not just COD. The old code decremented for COD here
    // and left online payments to the gateway callback, which meant an unpaid
    // online order held nothing and a customer could be sold stock that was
    // already spoken for.
    const reservation = await reserveStock(Product, orderItems);
    if (!reservation.ok) {
      const first = reservation.unavailable[0];
      return NextResponse.json(
        {
          error:
            first.available > 0
              ? `Only ${first.available} left of ${first.name} (${first.size}).`
              : `${first.name} (${first.size}) has just sold out.`,
          unavailable: reservation.unavailable.map((u) => ({ ...u, reason: "stock" })),
        },
        { status: 409 }
      );
    }

    let order;
    try {
      order = await createOrderWithNumber(Order, "ELY", (orderNumber) => ({
        orderNumber,
        user: customerId,
        guestEmail: !session ? data.guestEmail : undefined,
        items: orderItems,
        shippingAddress: data.shippingAddress,
        shippingZone: data.shippingZone || "inside_dhaka",
        paymentMethod: data.paymentMethod,
        paymentStatus: "pending",
        orderStatus: "pending",
        subtotal,
        shippingFee,
        discount,
        discountCodes,
        appliedDiscounts,
        totalAmount,
        stockReserved: true,
      }));
    } catch (err) {
      // The units are already out of inventory; if the order never made it,
      // they have to go back or they are lost to a document that got away.
      await releaseStock(Product, orderItems);
      for (const [pid, qty] of Object.entries(soldByProduct)) {
        await releaseFlashUnits(flashSale?._id, pid, qty).catch(() => {});
      }
      throw err;
    }
    const orderNumber = order.orderNumber;

    // Count the usage now that the order exists.
    if (appliedDiscounts.length) recordDiscountUsage(appliedDiscounts).catch(() => {});


    // Notify the roles subscribed to new storefront orders.
    notifyEvent("order_new", {
      severity: "info",
      title: `New order ${orderNumber}`,
      body: `${data.shippingAddress?.name || "A customer"} placed an order for ৳${totalAmount} (${orderItems.length} item${orderItems.length === 1 ? "" : "s"}, ${data.paymentMethod === "cod" ? "COD" : "online"}).`,
      link: `/admin/orders/${order._id}`,
      order: order._id,
    }).catch(() => {});

    // No stock is mirrored to ncom.bd any more. Under their contract 1 there is
    // no copy of this inventory to keep in step: ncom reads the count from
    // /api/ncom/v1/stock when it needs one, and takes units through
    // /api/ncom/v1/reserve when it sells one. The reservation above is the only
    // movement there is.

    if (data.paymentMethod === "cod") {
      // Order intentionally stays "pending". The Steadfast fraud check below
      // may auto-advance it to "processing" once the customer's courier history
      // clears the thresholds configured in Settings.

      const toEmail = session?.user?.email || data.guestEmail;
      if (toEmail) {
        sendEmail({
          to: toEmail,
          subject: `Order Confirmed — ${orderNumber}`,
          html: orderConfirmationTemplate(order.toObject()),
        }).catch(console.error);
      }

      // Auto fraud/delivery-history check on the order's phone — stores the
      // result on the order and may auto-move it to "processing".
      runFraudCheckForOrder(order._id, data.shippingAddress?.phone).catch(() => {});

      // Primary, unblockable Purchase signal (server-side, real customer IP/UA
      // from this request). Fire-and-forget so it never delays the response.
      trackPurchaseFromOrder(order, { request }).catch(() => {});
    }

    return NextResponse.json({ orderId: order._id.toString() }, { status: 201 });
  } catch (err) {
    console.error("POST /api/orders error:", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
