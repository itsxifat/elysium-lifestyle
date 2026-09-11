import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { releaseIfHeld } from "@/lib/stock";
import { applyCodAutoPaid } from "@/lib/orders";
import { sendEmail, orderStatusTemplate } from "@/lib/email";
import { notifyEvent } from "@/lib/notifications";
import { notifyNcom } from "@/lib/ncom-orders";
import { fetchCourierStatus, getSteadfastConfig, steadfastConfigured } from "@/lib/steadfast";
import { courierStatusLabel, mapSteadfastStatus, COURIER_SETTLED_STATUSES } from "@/lib/steadfast-status";

// What happens to an order when Steadfast tells us where its parcel is.
//
// There are two ways that news arrives — their webhook pushes it, or the
// "Sync delivery status" button pulls it — and both must have exactly the same
// consequences, because an order whose status came from a poll instead of a
// push must not end up with different stock, payment or audit records. Hence
// one rule, here, that both paths call.

// How far along our own fulfilment timeline each status sits.
//
// A courier status may only move an order FORWARD. Steadfast re-reporting an
// earlier stage — a stale webhook, or `in_review` still sitting on a parcel the
// rider already has — must never walk a shipped order back to processing.
const RANK = { pending: 0, processing: 1, shipped: 2, delivered: 3 };

/**
 * Should `mapped` replace the order's current status?
 *
 * Cancelled is the one status that may arrive out of order: the courier handing
 * a parcel back is news whatever stage we thought it was at. A cancellation WE
 * made is never overridden though — staff cancelling an order is a decision,
 * not a stale reading, and the courier's copy of it lags behind ours.
 */
function shouldApply(current, mapped) {
  if (!mapped || mapped === current) return false;
  if (current === "cancelled") return false;
  if (mapped === "cancelled") return true;
  return (RANK[mapped] ?? -1) > (RANK[current] ?? -1);
}

/**
 * Apply one Steadfast delivery status to an order, saving it and firing every
 * side-effect the change implies.
 *
 * Mutates and SAVES the given order document. Returns a plain summary of what
 * changed, which is what both the webhook response and the sync report render.
 */
export async function applyCourierStatus(
  order,
  rawStatus,
  { deliveryCharge, trackingMessage, actorName = "Steadfast", pinVerified = false } = {}
) {
  const raw = String(rawStatus || "").toLowerCase();
  if (!order.courier) order.courier = {};

  const previousCourierStatus = order.courier.status || "";
  const previousStatus = order.orderStatus;

  order.courier.status = raw || previousCourierStatus;
  if (deliveryCharge != null) order.courier.deliveryCharge = Number(deliveryCharge) || 0;
  if (trackingMessage) {
    order.courier.trackingMessages = order.courier.trackingMessages || [];
    order.courier.trackingMessages.push({ message: trackingMessage, at: new Date() });
  }

  const mapped = mapSteadfastStatus(raw);
  const statusChanged = shouldApply(previousStatus, mapped);
  if (statusChanged) order.orderStatus = mapped;

  // Stock follows the status, exactly as it does on a manual cancel: a parcel
  // the courier handed back is goods sitting on our shelf again, and leaving
  // the units reserved would show the shop as sold out while they are in
  // stock. Only ever released once — `stockReserved` is the guard.
  if (statusChanged && mapped === "cancelled") {
    await releaseIfHeld(Product, order);
  }

  // COD auto-paid: a courier-confirmed delivery means the cash was collected.
  const autoPaid = applyCodAutoPaid(order);

  // Audit trail. `by` is null because nobody here is a member of staff — the
  // byName snapshot names the courier so the history reads honestly.
  const parts = [];
  if (statusChanged) parts.push(`status ${previousStatus} → ${order.orderStatus}`);
  if (autoPaid) parts.push("payment pending → paid (auto, COD delivered)");
  if (parts.length) {
    order.editHistory = order.editHistory || [];
    order.editHistory.push({
      at: new Date(),
      by: null,
      byName: actorName,
      action: "status_change",
      summary: `${parts.join("; ")} — Steadfast reported "${raw}"`,
      pinVerified,
    });
  }

  await order.save();

  const result = {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    courierStatus: raw,
    courierStatusLabel: courierStatusLabel(raw),
    courierStatusChanged: raw !== previousCourierStatus,
    previousCourierStatus,
    from: previousStatus,
    to: order.orderStatus,
    statusChanged,
    autoPaid,
    // A partial delivery is a status change AND an amount of stock coming back
    // that only a human can itemise — flagged so the UI can say so.
    needsReturnEntry: /partial/.test(raw),
  };

  if (statusChanged || autoPaid) await announceCourierStatus(order, result);
  return result;
}

/**
 * The outward-facing consequences of a courier status change: the customer's
 * email, the in-panel notification, and ncom's copy of a shared order.
 *
 * Every one of them is fire-and-forget — the status has already been saved, and
 * a mail server or a partner API being down must not turn that into a failure.
 */
async function announceCourierStatus(order, result) {
  if (result.statusChanged) {
    const toEmail = order.guestEmail || order.shippingAddress?.email;
    if (toEmail) {
      sendEmail({
        to: toEmail,
        subject: `Order Update — ${order.orderNumber}`,
        html: orderStatusTemplate(order.toObject()),
      }).catch(() => {});
    }
  }

  // An ncom order is a shared record: their order book has to follow ours or
  // the two quietly stop describing the same sale. A cancellation matters most
  // — without it their side goes on showing a parcel nobody is sending.
  if (order.source === "ncom" && (result.statusChanged || result.autoPaid)) {
    notifyNcom(order, result.to === "cancelled" ? "order.cancelled" : "order.updated", {
      reason: result.statusChanged ? `Courier reported "${result.courierStatus}"` : null,
    }).catch(() => {});
  }

  const link = `/admin/orders/${order._id}`;
  if (result.needsReturnEntry) {
    notifyEvent("order_returned", {
      severity: "warning",
      title: `Order ${order.orderNumber} partially returned (courier)`,
      body: `Steadfast reported "${result.courierStatus}". Review and record the return.`,
      link,
      order: order._id,
    }).catch(() => {});
  } else if (result.statusChanged && result.to === "cancelled") {
    notifyEvent("order_cancelled", {
      severity: "warning",
      title: `Order ${order.orderNumber} cancelled (courier)`,
      body: `Steadfast reported "${result.courierStatus}".`,
      link,
      order: order._id,
    }).catch(() => {});
  } else if (result.statusChanged && result.to === "delivered") {
    notifyEvent("order_delivered", {
      severity: "info",
      title: `Order ${order.orderNumber} delivered (courier)`,
      body: result.autoPaid ? "Marked COD payment as paid." : "",
      link,
      order: order._id,
    }).catch(() => {});
  }
}

/**
 * Ask Steadfast about one order and apply the answer.
 *
 * Never throws: a parcel they cannot find, or a request that times out, is one
 * failed row in the report rather than a failed sync.
 */
export async function syncOneOrder(order, cfg, { actorName = "Steadfast sync" } = {}) {
  try {
    const raw = await fetchCourierStatus(order, cfg);
    if (!raw) {
      // The lookup itself worked, they just have nothing to report yet — so any
      // error left over from a previous attempt is stale and goes.
      order.courier.lastSyncedAt = new Date();
      order.courier.error = "";
      await order.save();
      return {
        ok: true,
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        courierStatus: order.courier.status || "",
        courierStatusLabel: courierStatusLabel(order.courier.status),
        statusChanged: false,
        noAnswer: true,
      };
    }

    order.courier.lastSyncedAt = new Date();
    order.courier.error = "";
    const applied = await applyCourierStatus(order, raw, { actorName });
    return { ok: true, ...applied };
  } catch (err) {
    const message = err?.message || "Lookup failed";
    try {
      order.courier.lastSyncedAt = new Date();
      order.courier.error = message;
      await order.save();
    } catch {
      /* the report still carries the error even if we cannot record it */
    }
    return {
      ok: false,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      error: message,
    };
  }
}

// How many parcels we look up in one run, and how many lookups run at once.
//
// Steadfast has no bulk status endpoint, so a sync is one HTTP request per
// parcel. Four at a time keeps a shop with hundreds of live consignments inside
// a normal request timeout without hammering their API; the cap means a first
// sync on a long backlog returns a result instead of hanging, and reports how
// many are left for the next press.
const SYNC_CONCURRENCY = 4;
const SYNC_LIMIT = 250;

/**
 * The "Sync delivery status" run.
 *
 * Only orders that were actually handed to Steadfast are touched — a
 * consignment id (or tracking code) is what proves it, and it is there whether
 * staff pushed the order across by hand or the auto-send did it on
 * `processing`. Orders that never went to the courier have no delivery status
 * to read and are not part of the set at all.
 *
 * @param {object}   opts
 * @param {string[]} opts.orderIds       only these orders (the per-order sync)
 * @param {boolean}  opts.includeSettled re-check parcels already delivered/cancelled
 * @param {number}   opts.limit          cap on parcels looked up this run
 */
export async function syncCourierStatuses({ orderIds, includeSettled = false, limit = SYNC_LIMIT, actorName } = {}) {
  const cfg = await getSteadfastConfig();
  if (!steadfastConfigured(cfg)) {
    return { ok: false, error: "Steadfast is not configured. Add your API keys on the Courier page first." };
  }

  await connectDB();

  // Sent to the courier = has something of theirs to look the parcel up by.
  const query = {
    $or: [
      { "courier.consignmentId": { $ne: null } },
      { "courier.trackingCode": { $nin: ["", null] } },
    ],
  };
  if (Array.isArray(orderIds) && orderIds.length) query._id = { $in: orderIds };
  if (!includeSettled) query["courier.status"] = { $nin: COURIER_SETTLED_STATUSES };

  const eligible = await Order.countDocuments(query);

  // Counted BEFORE the lookups run: this is how many parcels the default run
  // deliberately left alone. Counting it afterwards would include the ones this
  // very run just settled, and the report would offer to "re-check" them.
  const settledSkipped = includeSettled
    ? 0
    : await Order.countDocuments({
        $or: query.$or,
        "courier.status": { $in: COURIER_SETTLED_STATUSES },
        ...(query._id ? { _id: query._id } : {}),
      });

  const orders = await Order.find(query).sort({ createdAt: -1 }).limit(Math.max(1, limit));

  const results = [];
  for (let i = 0; i < orders.length; i += SYNC_CONCURRENCY) {
    const batch = orders.slice(i, i + SYNC_CONCURRENCY);
    results.push(...(await Promise.all(batch.map((o) => syncOneOrder(o, cfg, { actorName })))));
  }

  const changes = results.filter((r) => r.ok && r.statusChanged);
  const errors = results.filter((r) => !r.ok);

  return {
    ok: true,
    checked: results.length,
    updated: changes.length,
    unchanged: results.filter((r) => r.ok && !r.statusChanged).length,
    failed: errors.length,
    // Parcels left over when a long backlog hit the per-run cap, so the UI can
    // say "press again" instead of quietly under-reporting.
    remaining: Math.max(0, eligible - results.length),
    includeSettled,
    settledSkipped,
    changes,
    errors,
    results,
  };
}
