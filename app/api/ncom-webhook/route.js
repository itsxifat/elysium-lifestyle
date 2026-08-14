export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:crypto for the HMAC — not available on edge

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import NcomEvent from "@/models/NcomEvent";
import { notifyEvent } from "@/lib/notifications";
import { getNcomConfig } from "@/lib/ncom";

// Inbound ncom.bd webhooks. Register this URL under Developers → Webhooks:
//   https://<your-domain>/api/ncom-webhook
//
// The URL is not a secret — it shows up in logs and proxies — so nothing here
// is trusted until the HMAC checks out. Unsigned callers get 401 before a
// single document is touched.

const SKEW_SECONDS = 300;

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

// t=<unix>,v1=<hex> over `<t>.<raw body>`.
function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(
    String(header || "")
      .split(",")
      .map((piece) => piece.trim().split("="))
      .filter((pair) => pair.length === 2)
  );

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "malformed signature header" };

  // Reject replays of a captured request.
  if (Math.abs(Date.now() / 1000 - timestamp) > SKEW_SECONDS) {
    return { ok: false, reason: "stale timestamp" };
  }

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1 || "", "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }

  return { ok: true };
}

export async function POST(request) {
  // Raw text, not request.json() — re-serializing changes the bytes and the
  // signature would never match. Read it before anything can consume the body.
  const rawBody = await request.text();

  // The secret lives in Settings (managed at /admin/ncom), with the env var
  // winning if set — so connect first, then authenticate.
  await connectDB();
  const cfg = await getNcomConfig();
  const secret = cfg.webhookSecret;

  // Fail closed. Without a secret we cannot tell ncom from anyone who learned
  // the URL, and this endpoint writes stock.
  if (!secret) return bad(401, "Webhook secret not configured");

  const result = verify(rawBody, request.headers.get("x-ncom-signature"), secret);
  if (!result.ok) return bad(401, result.reason);

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
    await handle(event);
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

async function handle(event) {
  switch (event.topic) {
    case "inventory.updated":
      return applyInventory(event.data);

    // order.created fires AFTER stock is reserved, and that reservation already
    // produces its own inventory.updated. Acting on both would decrement our
    // stock twice for one sale, so stock is driven purely by inventory.updated
    // and orders are informational.
    case "order.created":
      return notifyEvent("order_new", {
        severity: "info",
        title: `ncom order ${event.data?.orderNumber || ""}`.trim(),
        body: `An order was placed on the ncom channel. Stock will follow via inventory.updated.`,
      }).catch(() => {});

    default:
      // product.* and category.* are ours to push, not to receive — we are the
      // source of truth for the catalogue. Logged, deliberately not applied.
      console.log("[ncom] ignoring topic:", event.topic);
      return null;
  }
}

async function applyInventory(data) {
  const sku = data?.variant?.sku;
  const available = Number(data?.available);
  if (!sku || !Number.isFinite(available)) return;

  const product = await Product.findOne({ "variants.sku": sku }).select("variants").lean();
  if (!product) {
    console.warn("[ncom] inventory.updated for unknown sku:", sku);
    return;
  }

  const variant = (product.variants || []).find((v) => v.sku === sku);

  // Loop guard. Our own pushes bounce straight back as inventory.updated; if
  // the number already matches what we hold, applying it would be a no-op that
  // emits another event, and the two systems talk to each other forever.
  if (variant && Number(variant.stock) === available) return;

  await Product.updateOne(
    { _id: product._id, "variants.sku": sku },
    { $set: { "variants.$.stock": Math.max(0, available) } }
  );
}
