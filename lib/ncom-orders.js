// Telling ncom.bd what happened to an order it handed us.
//
// The return leg of the order handoff. app/api/ncom/orders receives orders and
// the changes ncom makes to them; this sends back the changes WE make, so the
// two order books go on describing the same sale rather than agreeing only on
// the day it was placed.
//
// Same credential and same signature as everything else in this integration —
// ncom resolves the workspace from `X-NCOM-Key` and verifies the HMAC with the
// secret it issued. Nothing new to configure.

import Order from "@/models/Order";
import NcomOutbox from "@/models/NcomOutbox";
import { getNcomConfig, centsToTaka } from "@/lib/ncom";
import { signatureHeader } from "@/lib/ncom-signature";

/** Attempts per message, including the first. */
const MAX_ATTEMPTS = 8;

/** Backoff in seconds: 15s, 1m, 5m, 15m, 1h, 3h, 6h — ncom's own schedule. */
const BACKOFF = [15, 60, 300, 900, 3600, 10_800, 21_600];

const TIMEOUT_MS = 15_000;

/** Orders touched per sweep, so one backlog cannot starve the rest. */
const SWEEP_BATCH = 50;

const takaToCents = (taka) => Math.round(Number(taka || 0) * 100);

/**
 * Where ncom listens for these.
 *
 * Derived from the REST base URL already configured rather than asking an admin
 * for a second address: they are the same deployment, and a field that has to
 * agree with another field is a field that eventually does not.
 */
function callbackUrl(cfg) {
  try {
    return new URL("/api/orders/callback", cfg.baseUrl).toString();
  } catch {
    return "";
  }
}

/**
 * Queues a change for ncom.
 *
 * Call inside the same request that made the change, after the order has saved.
 * Never throws: the change has happened here, and turning a delivery problem
 * into a failed edit for our own staff would be strictly worse than a message
 * that is late and visible.
 *
 * Does nothing for an order that did not come from ncom, which is almost all
 * of them.
 */
export async function notifyNcom(order, topic, { reason = null } = {}) {
  try {
    if (!order?.ncom?.orderId) return;

    const cfg = await getNcomConfig();
    if (!cfg.orderKeyId || !cfg.orderSecret) return;

    // Their revision moves with ours. Bumped on the order itself first, so the
    // number in the message is one the database actually holds.
    const base = Number(order.ncom.revision) || 0;
    const revision = base + 1;

    await Order.updateOne({ _id: order._id }, { $set: { "ncom.revision": revision } });

    const payload = {
      version: 1,
      topic,
      // One key per revision — the granularity ncom deduplicates at.
      idempotencyKey: `ely:${order._id}:${revision}`,
      sentAt: new Date().toISOString(),
      baseRevision: base,
      revision,
      reason,
      order: serializeForNcom(order, topic),
    };

    await NcomOutbox.create({
      order: order._id,
      ncomOrderId: order.ncom.orderId,
      topic,
      idempotencyKey: payload.idempotencyKey,
      baseRevision: base,
      revision,
      payload,
      status: "pending",
      nextAttemptAt: new Date(),
    });

    // Try immediately, but never block the response on ncom's server.
    drainOrder(order._id).catch(() => {});
  } catch (e) {
    // A queue write that fails must not fail our own staff's edit. It is logged
    // and the reconciliation is a human one.
    console.error("[ncom] could not queue change:", e?.message);
  }
}

/**
 * What ncom needs to know about the order as it now stands.
 *
 * `order.id` is THEIR id — the whole message is about their copy. Amounts go
 * back in the integer minor units their contract uses, so there is never a pair
 * of numbers that can disagree.
 */
/**
 * Our status in the vocabulary ncom has always been sent.
 *
 * They have only ever received our five fulfilment statuses, and a field that
 * has to agree with another system's enum is a field that eventually does not —
 * so the return states are reported as the nearest fact about the parcel and
 * the exact state travels alongside in `fulfilmentStatus`, where a value they
 * do not recognise cannot fail their validation.
 *
 * A full return maps to `cancelled` deliberately: for their order book a sale
 * where everything came back is no sale, and for any product they store it is
 * stock that has to go back on their shelf.
 */
const NCOM_STATUS = {
  return_requested: "delivered",
  partial_returned: "delivered",
  returned: "cancelled",
};

function serializeForNcom(order, topic) {
  return {
    id: order.ncom.orderId,
    orderNumber: order.orderNumber,
    status: NCOM_STATUS[order.orderStatus] || order.orderStatus,
    fulfilmentStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    currencyCode: "BDT",
    subtotalCents: takaToCents(order.subtotal),
    discountTotalCents: takaToCents(order.discount),
    shippingTotalCents: takaToCents(order.shippingFee),
    taxTotalCents: 0,
    totalCents: takaToCents(order.totalAmount),
    cancelledAt:
      topic === "order.cancelled" || order.orderStatus === "returned"
        ? new Date().toISOString()
        : null,
    note: order.notes || null,
    shippingAddress: {
      name: order.shippingAddress?.name || null,
      phone: order.shippingAddress?.phone || null,
      email: order.shippingAddress?.email || null,
      address1: order.shippingAddress?.street || null,
      address2: null,
      city: order.shippingAddress?.city || null,
      province: order.shippingAddress?.state || null,
      postalCode: order.shippingAddress?.postalCode || null,
      countryCode: "BD",
    },
    lines: (order.items || []).map((item) => ({
      productId: item.product ? String(item.product) : null,
      variantId: null,
      source: "website",
      title: item.name,
      variantTitle: item.size || null,
      sku: item.sku || null,
      imageUrl: item.image || null,
      quantity: item.quantity,
      unitPriceCents: takaToCents(item.price),
      discountCents: 0,
      taxCents: 0,
      totalCents: takaToCents(item.price * item.quantity),
      requiresShipping: true,
      weightGrams: 0,
      isGift: false,
    })),
  };
}

/**
 * Sends one order's queued changes, oldest first, stopping at the first that
 * does not land. Stopping is the point — see the note in the model.
 */
export async function drainOrder(orderId) {
  const pending = await NcomOutbox.find({ order: orderId, status: "pending" })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();

  for (const row of pending) {
    const landed = await attempt(row._id);
    if (!landed) return;
  }
}

/** One attempt at one message. Returns whether the queue may move on. */
async function attempt(messageId) {
  const message = await NcomOutbox.findById(messageId);
  if (!message || message.status !== "pending") return message?.status === "delivered";

  const cfg = await getNcomConfig();
  const url = callbackUrl(cfg);
  if (!url || !cfg.orderKeyId || !cfg.orderSecret) {
    message.status = "failed";
    message.error = "ncom credentials are not configured";
    message.nextAttemptAt = null;
    await message.save();
    return false;
  }

  const body = JSON.stringify(message.payload);
  const attemptNo = message.attempts + 1;

  let response = null;
  let text = "";
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Elysium-NcomOrders/1",
        "X-NCOM-Key": cfg.orderKeyId,
        "X-NCOM-Contract": "1",
        "X-NCOM-Idempotency-Key": message.idempotencyKey,
        "X-NCOM-Signature": signatureHeader(cfg.orderSecret, body),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    text = await response.text();
  } catch (e) {
    // No answer at all. Never terminal: the request may well have been
    // processed, so the only safe move is to ask again with the same key.
    return await reschedule(message, attemptNo, null, `No answer from ncom: ${e?.message || "unreachable"}`);
  }

  if (response.ok) {
    message.status = "delivered";
    message.attempts = attemptNo;
    message.nextAttemptAt = null;
    message.deliveredAt = new Date();
    message.statusCode = response.status;
    message.error = "";
    await message.save();
    return true;
  }

  // 409 means ncom holds a version we did not produce — somebody changed the
  // order in both places. Repeating cannot help and there is no correct
  // automatic answer, so it stops here for a human rather than being retried
  // into a loop or silently forced.
  if (response.status === 409) {
    message.status = "refused";
    message.attempts = attemptNo;
    message.nextAttemptAt = null;
    message.statusCode = 409;
    message.error = `ncom holds a different version of this order. ${text.slice(0, 200)}`;
    await message.save();
    return false;
  }

  const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
  if (!retryable) {
    message.status = "refused";
    message.attempts = attemptNo;
    message.nextAttemptAt = null;
    message.statusCode = response.status;
    message.error = `ncom refused it (${response.status}). ${text.slice(0, 200)}`;
    await message.save();
    return false;
  }

  return await reschedule(message, attemptNo, response.status, `ncom answered ${response.status}`);
}

async function reschedule(message, attemptNo, statusCode, error) {
  const done = attemptNo >= MAX_ATTEMPTS;
  message.status = done ? "failed" : "pending";
  message.attempts = attemptNo;
  message.statusCode = statusCode;
  message.error = error;
  message.nextAttemptAt = done
    ? null
    : new Date(Date.now() + BACKOFF[Math.min(attemptNo - 1, BACKOFF.length - 1)] * 1000);
  await message.save();
  return false;
}

/**
 * Retries every order with a change whose backoff has elapsed.
 *
 * Grouped by order rather than by message, because the queue is per-order: a
 * sweep picking due messages individually would send an order's second change
 * while its first was still waiting.
 */
export async function retryPendingNcomChanges() {
  const due = await NcomOutbox.find({ status: "pending", nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(SWEEP_BATCH)
    .select("order")
    .lean();

  const orders = [...new Set(due.map((row) => String(row.order)))];
  for (const orderId of orders) await drainOrder(orderId);
  return orders.length;
}
