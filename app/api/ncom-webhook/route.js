export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:crypto for the HMAC — not available on edge

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import NcomEvent from "@/models/NcomEvent";
import { notifyEvent } from "@/lib/notifications";
import { getNcomConfig } from "@/lib/ncom";
import { verifySignature } from "@/lib/ncom-signature";

// Inbound ncom.bd webhooks. Register this URL under Developers → Webhooks:
//   https://<your-domain>/api/ncom-webhook
//
// The URL is not a secret — it shows up in logs, proxies and browser history —
// so nothing here is trusted until the HMAC checks out. Unsigned callers get
// 401 before a single document is touched.
//
// ── What contract 1 changed here ────────────────────────────────────────────
// Stock used to arrive through this door: ncom held a copy of our inventory and
// reported every movement back as inventory.updated. It no longer does. Our
// stock is ours, is never reported back to us, and moves through the connector
// at /api/ncom/v1/reserve — atomically, before the order is written.
//
// So this endpoint is now about ORDERS and PARCELS: what was sold, what was
// held for fraud review, what was delivered and what came back.

const MAX_BODY_BYTES = 1024 * 1024;

// Mongoose's autoIndex only fires when a model is first compiled, so a
// collection created later (or dropped and recreated) silently ends up with no
// indexes at all — observed here: neither the unique eventId nor the TTL on
// receivedAt existed, which would have let rows accumulate forever. Build them
// explicitly, once per process, and let a later request retry on failure.
let indexPromise = null;
function ensureIndexes() {
  if (!indexPromise) {
    indexPromise = NcomEvent.createIndexes().catch((e) => {
      console.error("[ncom] index build failed:", e.message);
      indexPromise = null;
    });
  }
  return indexPromise;
}

function bad(status, message) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad(413, "Payload too large");

  // Raw text, not request.json() — re-serializing changes the bytes and the
  // signature would never match. Read it before anything can consume the body.
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return bad(413, "Payload too large");

  // The secret lives in Settings (managed at /admin/ncom), with the env var
  // winning if set — so connect first, then authenticate.
  await connectDB();
  const cfg = await getNcomConfig();

  // Fail closed. Without a secret we cannot tell ncom from anyone who learned
  // the URL, and this endpoint moves stock when reservations are switched off.
  if (!cfg.webhookSecret) return bad(401, "Webhook secret not configured");

  const result = verifySignature(cfg.webhookSecret, rawBody, request.headers.get("x-ncom-signature"));
  if (!result.ok) {
    console.warn("[ncom] webhook auth refused:", result.reason);
    return bad(401, "Unauthorized");
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return bad(400, "Invalid JSON");
  }

  const eventId = event.id || request.headers.get("x-ncom-event-id");
  if (!eventId) return bad(400, "Missing event id");

  await ensureIndexes();

  // Claim the event id with an atomic upsert: the claim succeeds only for
  // whoever actually inserted the row.
  //
  // Deliberately NOT a plain create()-and-catch-11000. That relies on the
  // unique index existing, and mongoose builds indexes in the background after
  // the first write — so on a cold collection two quick retries both insert,
  // and the unique build then fails permanently against the duplicates it
  // finds, leaving dedupe silently broken. $setOnInsert is correct from the
  // very first request; the unique index below is defense in depth for the
  // genuinely-simultaneous case.
  let claimed = false;
  try {
    const claim = await NcomEvent.updateOne(
      { eventId },
      { $setOnInsert: { eventId, topic: event.topic || "unknown", receivedAt: new Date() } },
      { upsert: true }
    );
    claimed = claim.upsertedCount > 0;
  } catch (e) {
    if (e?.code === 11000) return NextResponse.json({ ok: true, deduped: true });
    throw e;
  }

  if (!claimed) return NextResponse.json({ ok: true, deduped: true });

  try {
    await handle(event, cfg);
  } catch (e) {
    console.error("[ncom] webhook handler failed:", event.topic, e.message);
    // Drop the claim so their retry can have another go at it.
    await NcomEvent.deleteOne({ eventId }).catch(() => {});
    return bad(500, "Handler failed");
  }

  // Last-delivery timestamp, so /admin/ncom can show the webhook is alive.
  Settings.updateOne({}, { $set: { "ncom.lastWebhookAt": new Date() } }).catch(() => {});

  return NextResponse.json({ ok: true });
}

const orderLabel = (data) => data?.orderNumber || data?.number || data?.id || "";

async function handle(event, cfg) {
  const data = event.data || {};

  switch (event.topic) {
    // Sent AFTER stock has moved: requested from this site through /reserve for
    // everything we sell, and decremented on their side for the products ncom
    // stores itself. So the units are already committed and there is nothing to
    // take — unless this shop declined to implement reservations, in which case
    // this event is the only notice we get that a sale happened.
    case "order.created": {
      if (!cfg.capabilities.reserve) await moveStockFromLines(data.lines, -1);
      return notifyEvent("ncom_order", {
        severity: "info",
        title: `ncom order ${orderLabel(data)}`.trim(),
        body: describeOrder(data),
      }).catch(() => {});
    }

    // "Its units were released back to your own stock first" — i.e. ncom called
    // our /release before sending this. Symmetrically, if reservations are off
    // there is no release to receive and the credit is ours to make.
    case "order.cancelled":
    case "shipment.returned": {
      if (!cfg.capabilities.reserve) await moveStockFromLines(data.lines, +1);
      return notifyEvent(event.topic === "order.cancelled" ? "ncom_order" : "ncom_shipment", {
        severity: "warning",
        title:
          event.topic === "order.cancelled"
            ? `ncom order ${orderLabel(data)} cancelled`.trim()
            : `ncom parcel returned — order ${orderLabel(data)}`.trim(),
        body: "Units were released back to this shop's stock.",
      }).catch(() => {});
    }

    case "order.held_for_review":
      return notifyEvent("ncom_hold", {
        severity: "warning",
        title: `ncom order ${orderLabel(data)} held for review`.trim(),
        body: data.reason || "Failed the courier fraud screen. Release or refuse it in the ncom dashboard.",
      }).catch(() => {});

    case "shipment.delivered": {
      const collected = Number(data.collectedAmountCents);
      return notifyEvent("ncom_shipment", {
        severity: "info",
        title: `ncom parcel delivered — order ${orderLabel(data)}`.trim(),
        body: Number.isFinite(collected)
          ? `${data.provider || "Courier"} collected ৳${(collected / 100).toLocaleString("en-BD")}.`
          : `${data.provider || "Courier"} reports delivered.`,
      }).catch(() => {});
    }

    // Recorded (so a retry is deduped) but deliberately not notified: a parcel
    // moving through four states per delivery would bury the events that need
    // a human.
    case "order.updated":
    case "order.fulfilled":
    case "shipment.created":
    case "shipment.updated":
      return null;

    // Products, categories and inventory that NCOM stores. Under contract 1 our
    // catalogue is read live from us and is never written back, so an event
    // about one of these is about THEIR products — applying it to ours would
    // fight with the reservation that already moved the stock correctly.
    case "inventory.updated":
    case "product.created":
    case "product.updated":
    case "product.deleted":
    case "category.created":
    case "category.updated":
    case "category.deleted":
      return null;

    default:
      console.log("[ncom] ignoring unknown topic:", event.topic);
      return null;
  }
}

function describeOrder(data) {
  const lines = Array.isArray(data.lines) ? data.lines : [];
  const units = lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const total = Number(data.totalCents);
  const parts = [];
  if (units) parts.push(`${units} unit${units === 1 ? "" : "s"}`);
  if (Number.isFinite(total)) parts.push(`৳${(total / 100).toLocaleString("en-BD")}`);
  return parts.length ? `${parts.join(" · ")}. Stock is already committed.` : "Stock is already committed.";
}

/**
 * Move stock for an ncom order's lines — the fallback path when this shop has
 * switched reservations off.
 *
 * `sign` is -1 for a sale and +1 for a cancellation or return. Lines are matched
 * on our variant id first (which is what the connector hands out) and on SKU
 * second; anything that matches neither belongs to ncom's own catalogue and is
 * correctly ignored.
 *
 * Never throws: a stock adjustment that fails must not make the webhook retry
 * for ever and eventually park the endpoint.
 */
async function moveStockFromLines(lines, sign) {
  for (const line of Array.isArray(lines) ? lines : []) {
    const quantity = Math.floor(Number(line?.quantity) || 0);
    if (quantity <= 0) continue;

    const variantId = String(line.variantId || line.variant_id || "").trim();
    const sku = String(line.sku || "").trim();

    const filter = variantId && /^[a-f\d]{24}$/i.test(variantId)
      ? { "variants._id": variantId }
      : sku
        ? { "variants.sku": sku }
        : null;
    if (!filter) continue;

    try {
      // Selling clamps at zero — a negative shelf count is never the truth —
      // while a credit is unconditional.
      const guarded = sign < 0
        ? { variants: { $elemMatch: { ...elem(filter), stock: { $gte: quantity } } } }
        : filter;

      const res = await Product.updateOne(guarded, { $inc: { "variants.$.stock": sign * quantity } });
      if (sign < 0 && res.modifiedCount !== 1) {
        console.warn("[ncom] order.created could not take", quantity, "of", variantId || sku, "— not enough stock");
      }
    } catch (e) {
      console.error("[ncom] stock move failed for", variantId || sku, e.message);
    }
  }
}

// Turn a top-level `variants.x` filter into the $elemMatch form, so the guard
// and the decrement land on the SAME array element rather than on any element
// that happens to satisfy either half.
function elem(filter) {
  if (filter["variants._id"]) return { _id: filter["variants._id"] };
  return { sku: filter["variants.sku"] };
}
