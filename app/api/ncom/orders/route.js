export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:crypto for the HMAC — not available on edge

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import "@/models/User"; // register User for the customer link below
import { getNcomConfig, centsToTaka } from "@/lib/ncom";
import { verifySignature, secretEquals } from "@/lib/ncom-signature";
import { normalizeBdPhone } from "@/lib/utils";
import { findOrCreateCustomer } from "@/lib/customer-link";
import { createOrderWithNumber } from "@/lib/order-number";
import { reserveStock, releaseStock } from "@/lib/stock";
import { runFraudCheckForOrder } from "@/lib/fraud";
import { trackPurchaseFromOrder } from "@/lib/tracking/server";
import { notifyEvent } from "@/lib/notifications";
import { sendEmail, orderConfirmationTemplate } from "@/lib/email";

// Orders placed on an ncom.bd landing page, handed to us to process.
//
// Register this URL in ncom under Settings → Order handling:
//   https://<your-domain>/api/ncom/orders
//
// ── What this endpoint is ───────────────────────────────────────────────────
// The other half of the contract-1 integration. app/api/ncom/v1/* is ncom
// READING our catalogue; this is ncom WRITING an order into it. When a shop
// switches order handling to its own website, ncom stops screening, stops
// dispatching and stops calling /reserve — the order it posts here is what
// takes the stock, exactly as a checkout on our own storefront does.
//
// So this route is a checkout, not a notification. It does everything
// app/api/orders does after pricing: reserves stock atomically, links or
// creates the customer, allocates our own ELY- number, screens the phone
// against Steadfast's delivery history, notifies staff and fires the purchase
// pixel. From the moment it returns, the order is an ordinary Elysium order
// and every existing screen, scanner and courier flow works on it unchanged.
//
// ── Three rules, and why ────────────────────────────────────────────────────
//
//   NOTHING IS TRUSTED UNTIL THE HMAC CHECKS OUT. This endpoint creates orders
//   and moves stock. The URL is not a secret; the signature is. Same scheme as
//   the connector and the webhook receiver, verified with the same module.
//
//   EXACTLY ONCE, ENFORCED BY THE DATABASE. ncom retries anything it did not
//   get a clean answer to — including a request we processed and then failed to
//   acknowledge, which is indistinguishable to them from one we never received.
//   Every retry carries the same X-NCOM-Idempotency-Key, and the unique sparse
//   index on `ncom.idempotencyKey` is what makes a retry return the order we
//   already have instead of writing a second one. A repeat is answered 200, not
//   409: a conflict tells their queue to give up on an order we do have.
//
//   THEIR PRICES ARE THE PRICES. The customer was quoted a bundle price on a
//   landing page and has agreed to pay it. Re-pricing the basket from our own
//   catalogue here would charge a different number than the one they saw, so
//   the totals are taken from the payload verbatim. What we DO decide for
//   ourselves is stock — ours to give, and the one thing they cannot know.

const MAX_BODY_BYTES = 512 * 1024;
const MAX_LINES = 100;

function bad(status, message) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad(413, "Payload too large");

  // Raw text, not request.json() — re-serialising changes the bytes and the
  // signature would never match.
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return bad(413, "Payload too large");

  await connectDB();
  const cfg = await getNcomConfig();

  // Fail closed on every one of these. A shop that has not switched intake on
  // must not start taking orders because someone found the URL.
  if (!cfg.orderSecret || !cfg.orderKeyId) return bad(401, "Order intake is not configured");
  if (!cfg.acceptOrders) return bad(503, "This shop is not accepting ncom orders");

  if (!secretEquals(request.headers.get("x-ncom-key") || "", cfg.orderKeyId)) {
    return bad(401, "Unauthorized");
  }

  const verified = verifySignature(cfg.orderSecret, rawBody, request.headers.get("x-ncom-signature"));
  if (!verified.ok) {
    // The reason is for our logs and /admin/ncom, never for the caller —
    // telling an unauthenticated stranger "stale timestamp" versus "signature
    // mismatch" tells them which half of the forgery to fix.
    console.warn("[ncom] order auth refused:", verified.reason);
    return bad(401, "Unauthorized");
  }

  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return bad(400, "Invalid JSON");
  }

  const key = String(request.headers.get("x-ncom-idempotency-key") || envelope?.idempotencyKey || "").trim();
  if (!key) return bad(400, "Missing idempotency key");

  // A test is answered exactly like a real order — same auth, same 200 — and
  // filed like nothing. Checked before anything is written, because the whole
  // point of a test is that pressing it changes nothing here.
  if (envelope?.topic === "order.test") {
    Settings.updateOne({}, { $set: { "ncom.lastOrderAt": new Date() } }).catch(() => {});
    return NextResponse.json({ ok: true, test: true });
  }

  const order = envelope?.order;
  if (!order || typeof order !== "object") return bad(400, "Missing order");
  if (!Array.isArray(order.lines) || order.lines.length === 0) return bad(400, "Order has no lines");
  if (order.lines.length > MAX_LINES) return bad(400, "Too many lines in one order");

  // Already have it? Answer with what we have. This is the fast path for a
  // retry after a timeout, and it must come before anything is written.
  const existing = await Order.findOne({ "ncom.idempotencyKey": key })
    .select("_id orderNumber")
    .lean();
  if (existing) {
    return NextResponse.json({
      ok: true,
      deduped: true,
      orderId: String(existing._id),
      orderNumber: existing.orderNumber,
    });
  }

  try {
    const created = await placeNcomOrder({ envelope, order, key });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    // The duplicate-key path: two retries arriving at once both got past the
    // read above, and the unique index settled it. The loser reports the
    // winner's order, because from ncom's side those are the same request.
    if (e?.code === 11000) {
      const winner = await Order.findOne({ "ncom.idempotencyKey": key })
        .select("_id orderNumber")
        .lean();
      if (winner) {
        return NextResponse.json({
          ok: true,
          deduped: true,
          orderId: String(winner._id),
          orderNumber: winner.orderNumber,
        });
      }
    }

    console.error("[ncom] could not file order", key, e?.message);
    // A 5xx, so their queue retries. Whatever went wrong here — a database
    // blip, a validation we have not seen before — is far more likely to be
    // transient than to be a payload that will never be acceptable, and an
    // order refused for good is one nobody is packing.
    return bad(500, "Could not file the order");
  }
}

/**
 * Turns a handoff into an ordinary Elysium order.
 *
 * The sequence mirrors app/api/orders POST deliberately, because the promise
 * this integration makes is that an ncom order is processed exactly like any
 * other one. The differences are only the two things that are genuinely
 * different: the money is theirs, and some lines may be for products that live
 * in their catalogue rather than ours.
 */
async function placeNcomOrder({ envelope, order, key }) {
  const warnings = [];

  // ── The goods ────────────────────────────────────────────────────────────
  // A line is ours when its `source` says so AND it resolves to a real variant
  // here. Both halves matter: `source` is what ncom believes, and the lookup is
  // what is true — a product deleted here since the page was rendered is a line
  // we can describe but cannot pick from stock.
  const ourIds = order.lines
    .filter((line) => line.source === "website" && isObjectId(line.productId))
    .map((line) => line.productId);

  const products = ourIds.length
    ? await Product.find({ _id: { $in: ourIds } }).select("name images variants").lean()
    : [];
  const byId = new Map(products.map((product) => [String(product._id), product]));

  const items = [];
  const foreignItems = [];

  for (const line of order.lines) {
    const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
    if (quantity === 0) continue;

    const price = centsToTaka(line.unitPriceCents);
    const product = line.source === "website" ? byId.get(String(line.productId)) : null;
    const variant = matchVariant(product, line);

    if (product && variant) {
      items.push({
        product: product._id,
        name: product.name || line.title || "Item",
        // Their snapshot first: it is what the buyer was shown, and it is
        // already an absolute URL whichever catalogue it came from. Ours is the
        // fallback for a line whose photo they could not resolve.
        image: line.imageUrl || product.images?.[0] || "",
        sku: variant.sku || line.sku || "",
        size: variant.size,
        price,
        quantity,
      });
      continue;
    }

    // Everything else is described rather than picked: a product ncom stores
    // itself, or one of ours that has since gone. Both belong on the order —
    // the customer is paying for them — and neither moves stock here.
    if (line.source === "website") {
      warnings.push(
        `“${line.title}”${line.variantTitle ? ` (${line.variantTitle})` : ""} is no longer in this shop's catalogue — it was sold from a page that still had it.`
      );
    }

    foreignItems.push({
      title: line.title || "Item",
      variantTitle: line.variantTitle || "",
      sku: line.sku || "",
      image: line.imageUrl || "",
      quantity,
      price,
    });
  }

  if (items.length === 0 && foreignItems.length === 0) {
    throw new Error("no usable lines");
  }

  // An order with no line of ours still has to exist — the customer bought
  // something and somebody has to pack it — so a placeholder keeps the schema's
  // `items` requirement honest rather than inventing a product reference.
  const orderItems = items.length
    ? items
    : foreignItems.map((line) => ({
        name: line.title,
        image: line.image,
        sku: line.sku,
        size: line.variantTitle || "—",
        price: line.price,
        quantity: line.quantity,
      }));

  // ── The money ────────────────────────────────────────────────────────────
  // Theirs, verbatim. See the note at the top: the customer agreed to a bundle
  // price on their page, and re-deriving it here would charge a different one.
  const subtotal = centsToTaka(order.subtotalCents);
  const shippingFee = centsToTaka(order.shippingTotalCents);
  const discount = centsToTaka(order.discountTotalCents);
  const totalAmount = centsToTaka(order.totalCents);

  // ── Who is this ──────────────────────────────────────────────────────────
  const address = order.shippingAddress || {};
  const phone = normalizeBdPhone(order.customer?.phone || address.phone || "");
  const email = order.customer?.email || address.email || "";

  let customerId = null;
  try {
    const { user } = await findOrCreateCustomer({
      name: order.customer?.name || address.name,
      phone,
      email,
      source: "ncom",
    });
    customerId = user._id;
  } catch (e) {
    // Never block the sale on this. An unattached order is repairable by the
    // backfill script; a refused one is a lost customer.
    console.error("[ncom] customer link failed:", e.message);
  }

  // ── Take the stock ───────────────────────────────────────────────────────
  // Atomic and all-or-nothing, through the same helper the storefront uses —
  // this is the only thing standing between two buyers and the same last shirt,
  // and under this arrangement ncom is no longer calling /reserve for us.
  //
  // A shortfall does NOT refuse the order. The customer has already been told
  // it was placed; refusing here would leave a sale that exists on ncom, does
  // not exist in this shop, and that nobody would look at until they phoned.
  // The order is filed with the shortfall recorded on it instead, so staff see
  // it on the order rather than discovering it in the stockroom.
  let stockReserved = false;
  if (items.length > 0) {
    const reservation = await reserveStock(Product, items);
    if (reservation.ok) {
      stockReserved = true;
    } else {
      for (const short of reservation.unavailable || []) {
        warnings.push(
          `Not enough stock for ${short.name}${short.size ? ` (${short.size})` : ""} — ${short.requested} sold, ${short.available ?? 0} left.`
        );
      }
    }
  }

  let created;
  try {
    created = await createOrderWithNumber(Order, "ELY", (orderNumber) => ({
      orderNumber,
      user: customerId,
      guestEmail: email || undefined,
      items: orderItems,
      shippingAddress: {
        name: order.customer?.name || address.name || "Customer",
        phone,
        email: email || undefined,
        street: [address.address1, address.address2].filter(Boolean).join(", ") || "—",
        city: address.city || "—",
        state: address.province || undefined,
        postalCode: address.postalCode || undefined,
        country: address.countryCode === "BD" ? "Bangladesh" : address.countryCode || "Bangladesh",
      },
      source: "ncom",
      // Cash on delivery, unpaid, unprocessed. Exactly the state a storefront
      // COD order starts in, which is what lets every existing screen treat it
      // identically from here on.
      paymentMethod: "cod",
      paymentStatus: "pending",
      orderStatus: "pending",
      subtotal,
      shippingFee,
      discount,
      discountCodes: order.discountCode ? [order.discountCode] : [],
      totalAmount,
      notes: order.note || "",
      stockReserved,
      ncom: {
        orderId: order.id || "",
        orderNumber: order.orderNumber || "",
        idempotencyKey: key,
        receivedAt: new Date(),
        storeName: order.store?.name || "",
        storeUrl: order.store?.url || "",
        pageTitle: order.campaign?.pageTitle || "",
        pageUrl: order.campaign?.pageUrl || "",
        offerKey: order.campaign?.offerKey || "",
        offerLabel: order.campaign?.offerLabel || "",
        offerPrice: centsToTaka(order.campaign?.offerPriceCents),
        regularPrice: centsToTaka(order.campaign?.offerRegularCents),
        discountCode: order.discountCode || "",
        foreignItems,
        warnings,
        payload: envelope,
      },
    }));
  } catch (err) {
    // The units are already out of inventory; if the order never made it they
    // have to go back or they are lost to a document that got away.
    if (stockReserved) await releaseStock(Product, items).catch(() => {});
    throw err;
  }

  // ── Everything a normal order gets from here on ──────────────────────────
  // All fire-and-forget: none of them may delay ncom's response, and none may
  // fail an order that already exists. A slow acknowledgement is a retry from
  // their queue, and a retry is a wasted request at best.
  const label = order.campaign?.offerLabel ? ` · ${order.campaign.offerLabel}` : "";
  notifyEvent("ncom_order", {
    severity: warnings.length ? "warning" : "info",
    title: `ncom order ${created.orderNumber}`,
    body:
      `${order.customer?.name || "A customer"} ordered ৳${totalAmount} from ` +
      `${order.store?.name || "an ncom page"}${label}.` +
      (warnings.length ? ` ${warnings.length} thing(s) need checking.` : ""),
    link: `/admin/orders/${created._id}`,
    order: created._id,
  }).catch(() => {});

  runFraudCheckForOrder(created._id, phone).catch(() => {});
  trackPurchaseFromOrder(created, {}).catch(() => {});

  if (email) {
    sendEmail({
      to: email,
      subject: `Order Confirmed — ${created.orderNumber}`,
      html: orderConfirmationTemplate(created.toObject()),
    }).catch(() => {});
  }

  Settings.updateOne(
    {},
    { $set: { "ncom.lastOrderAt": new Date() }, $inc: { "ncom.ordersReceived": 1 } }
  ).catch(() => {});

  // Our identifiers go back so both sides can name the same order in a support
  // conversation. ncom stores these on its copy and shows them on the order.
  return {
    ok: true,
    orderId: String(created._id),
    orderNumber: created.orderNumber,
  };
}

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

/**
 * Which of a product's variants a handed-over line is for.
 *
 * The subdocument id first, because that is what our connector hands ncom and
 * what a saved offer on their side stores for ever — it is the only identifier
 * here that is stable across a rename.
 *
 * Then the size, then the SKU. Two real situations need those fallbacks, and in
 * both the alternative is silently filing a line as "not from this shop" and
 * shipping a parcel with a shirt missing from it:
 *
 *   * variants written straight into MongoDB rather than through mongoose carry
 *     no `_id` at all — there are such rows in this database — so the connector
 *     served ncom the string "undefined" as their id;
 *   * a variant deleted and re-added keeps its size and gets a new id, which
 *     retires every offer ncom saved against the old one.
 *
 * Size is a fallback rather than the primary key precisely because it is
 * editable: renaming "M" to "Medium" would make it match the wrong row, and the
 * id above is what stops that mattering for any variant that has one.
 */
function matchVariant(product, line) {
  const variants = product?.variants;
  if (!variants?.length) return null;

  const variantId = String(line.variantId || "");
  if (variantId && variantId !== "undefined") {
    const byId = variants.find((v) => v._id && String(v._id) === variantId);
    if (byId) return byId;
  }

  const size = String(line.variantTitle || "").trim();
  if (size) {
    const bySize = variants.find(
      (v) => String(v.size || "").trim().toLowerCase() === size.toLowerCase()
    );
    if (bySize) return bySize;
  }

  const sku = String(line.sku || "").trim();
  if (sku) {
    const bySku = variants.find((v) => String(v.sku || "").trim() === sku);
    if (bySku) return bySku;
  }

  // A single-variant product whose one size ncom reported as "Default" — the
  // connector's own word for a variant with no meaningful size. There is only
  // one thing it can mean.
  if (variants.length === 1) return variants[0];

  return null;
}
