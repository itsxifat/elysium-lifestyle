import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { releaseIfHeld } from "@/lib/stock";
import { applyCodAutoPaid } from "@/lib/orders";
import { sendEmail, orderStatusTemplate } from "@/lib/email";
import { notifyEvent } from "@/lib/notifications";
import { notifyNcom } from "@/lib/ncom-orders";
import {
  fetchCourierStatus,
  getCourierReturnRequests,
  getSteadfastConfig,
  steadfastConfigured,
} from "@/lib/steadfast";
import { courierStatusLabel, mapSteadfastStatus, COURIER_SETTLED_STATUSES } from "@/lib/steadfast-status";
import { isReturnStatus, orderStatusLabel } from "@/lib/order-status";

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
//
// The return states rank above delivered, which is what stops the other half of
// that problem: once staff have itemised a return (partial_returned / returned),
// Steadfast going on reporting `partial_delivered` cannot reset the order to
// "return requested" and make it look unhandled again.
const RANK = {
  pending: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
  return_requested: 4,
  partial_returned: 5,
  returned: 6,
};

/**
 * Should `mapped` replace the order's current status?
 *
 * Cancelled is the one status that may arrive out of order: the courier handing
 * a whole parcel back is news whatever stage we thought it was at. Two things
 * it must not overwrite — a cancellation WE made (staff cancelling an order is
 * a decision, not a stale reading, and the courier's copy of it lags behind
 * ours), and a return already being worked through here, which is downstream of
 * delivery and belongs to staff.
 */
function shouldApply(current, mapped) {
  if (!mapped || mapped === current) return false;
  if (current === "cancelled") return false;
  if (mapped === "cancelled") return !isReturnStatus(current);
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
    // An order sitting in "return requested" is waiting on a human: which
    // items came back, and how many. Flagged so the sync report and the
    // notification both say so rather than just naming a new status.
    needsReturnEntry: order.orderStatus === "return_requested",
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
      title: `Order ${order.orderNumber} — return requested (courier)`,
      body: `Steadfast reported "${result.courierStatus}". Record which items came back in the return editor; the order becomes ${orderStatusLabel("returned")} or ${orderStatusLabel("partial_returned")} from what you enter.`,
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
      // Their credentials were refused, so the next parcel will fail
      // identically — the run stops rather than writing this same line onto
      // every remaining order.
      auth: !!err?.auth,
    };
  }
}

/**
 * Their OTHER "something is coming back" channel: return-request records.
 *
 * A partial delivery arrives as a delivery status, but a return raised after
 * the parcel was delivered exists only as a return request — so a sync that
 * read statuses alone would never notice it, which is exactly the case the shop
 * asked about. One list call per run, matched to orders by consignment id (then
 * tracking code, then our invoice number).
 *
 * Their request lifecycle is about the parcel, not about our itemising of it:
 * anything they have not cancelled means goods are coming back, so the order
 * goes to `return_requested` and waits for the return editor. `completed` is
 * included deliberately — their courier finishing the journey does not mean
 * anybody here has yet written down what was in the box.
 *
 * Never throws: this is an addition to the status sync, and an endpoint their
 * account may not even have enabled must not fail the whole run.
 */
async function applyReturnRequests(cfg, { orderIds, actorName } = {}) {
  let requests;
  try {
    requests = await getCourierReturnRequests(cfg);
  } catch (err) {
    return { ok: false, error: err?.message || "Return requests unavailable", changes: [] };
  }

  const live = requests.filter((r) => r.status !== "cancelled");
  if (!live.length) return { ok: true, seen: 0, changes: [] };

  const or = [];
  const cids = live.map((r) => r.consignmentId).filter(Boolean);
  const codes = live.map((r) => r.trackingCode).filter(Boolean);
  const invoices = live.map((r) => r.invoice).filter(Boolean);
  if (cids.length) or.push({ "courier.consignmentId": { $in: cids } });
  if (codes.length) or.push({ "courier.trackingCode": { $in: codes } });
  if (invoices.length) or.push({ orderNumber: { $in: invoices } });
  if (!or.length) return { ok: true, seen: live.length, changes: [] };

  const query = { $or: or };
  if (Array.isArray(orderIds) && orderIds.length) query._id = { $in: orderIds };

  const orders = await Order.find(query);
  const changes = [];

  for (const order of orders) {
    const req =
      live.find((r) => r.consignmentId && r.consignmentId === order.courier?.consignmentId) ||
      live.find((r) => r.trackingCode && r.trackingCode === order.courier?.trackingCode) ||
      live.find((r) => r.invoice && r.invoice === order.orderNumber);
    if (!req) continue;

    const prev = order.courier?.returnRequest || {};
    const isNew = prev.id !== req.id;
    order.courier.returnRequest = {
      id: req.id,
      status: req.status,
      reason: req.reason,
      at: req.at || prev.at || null,
      seenAt: isNew ? new Date() : prev.seenAt || new Date(),
    };

    const from = order.orderStatus;
    if (shouldApply(from, "return_requested")) {
      order.orderStatus = "return_requested";
      order.editHistory = order.editHistory || [];
      order.editHistory.push({
        at: new Date(),
        by: null,
        byName: actorName || "Steadfast sync",
        action: "status_change",
        summary: `status ${from} → return_requested — Steadfast raised a return request${req.reason ? ` ("${req.reason}")` : ""}`,
        pinVerified: false,
      });
      await order.save();
      const result = {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        courierStatus: order.courier.status || "",
        courierStatusLabel: courierStatusLabel(order.courier.status),
        from,
        to: "return_requested",
        statusChanged: true,
        autoPaid: false,
        needsReturnEntry: true,
        returnRequest: { id: req.id, status: req.status, reason: req.reason },
      };
      changes.push(result);
      await announceCourierStatus(order, result);
    } else {
      // Status already at or past a return — only the request record updates.
      await order.save();
    }
  }

  return { ok: true, seen: live.length, changes };
}

// How many parcels we look up in one run, and how many at a time.
//
// Steadfast has no bulk status endpoint, so a sync is one HTTP request per
// parcel. The real ceiling is the gate in lib/steadfast.js (2 in flight, 300ms
// apart, and their own Retry-After obeyed whenever they send one) — this
// matches it so we are not queueing work that cannot start.
//
// The per-run cap means a first sync over a long backlog returns a result
// instead of running until something times out, and reports how many parcels
// are left for the next press rather than quietly ignoring them.
const SYNC_CONCURRENCY = 2;
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
export async function syncCourierStatuses({
  orderIds,
  includeSettled = false,
  limit = SYNC_LIMIT,
  actorName,
  onStart,
  onProgress,
} = {}) {
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

  await onStart?.({ total: orders.length, eligible, settledSkipped });

  const results = [];
  let authFailed = false;
  for (let i = 0; i < orders.length; i += SYNC_CONCURRENCY) {
    const batch = orders.slice(i, i + SYNC_CONCURRENCY);
    const batchResults = await Promise.all(batch.map((o) => syncOneOrder(o, cfg, { actorName })));
    results.push(...batchResults);

    // Reported per batch rather than at the end, because the run outlives the
    // request that started it and the browser follows it by reading progress.
    await onProgress?.({ done: results.length, total: orders.length, batch: batchResults });

    if (batchResults.some((r) => r.auth)) {
      authFailed = true;
      break;
    }
  }

  // Their return-request list, read once per run. Orders already settled at
  // `delivered` are not in the status pass above, so this is the only thing
  // that can spot a return raised after a successful delivery. Skipped when the
  // credentials have already been refused — it would only fail the same way.
  const returnPass = authFailed
    ? { ok: true, seen: 0, changes: [] }
    : await applyReturnRequests(cfg, { orderIds, actorName });
  if (returnPass.changes.length) {
    await onProgress?.({ done: results.length, total: orders.length, batch: [], returns: returnPass.changes });
  }

  const changes = [...results.filter((r) => r.ok && r.statusChanged), ...returnPass.changes];
  const errors = results.filter((r) => !r.ok);

  // An order can appear in both passes — status said nothing new, then the
  // return-request list moved it. It is one changed order, not one changed and
  // one unchanged, so the second pass wins when the counts are tallied.
  const movedIds = new Set(returnPass.changes.map((c) => c.orderId));

  // A parcel the return-request pass moved but the status pass never looked at
  // (a settled `delivered` one, skipped by design) was still checked — counting
  // only the status pass would report "2 checked, 1 updated, 2 unchanged".
  const returnOnly = returnPass.changes.filter((c) => !results.some((r) => r.orderId === c.orderId)).length;

  return {
    ok: true,
    // The run stopped early: the keys in Settings are being refused by
    // Steadfast, which is a configuration answer, not a per-order one.
    authFailed,
    authError: authFailed ? errors.find((e) => e.auth)?.error || "Steadfast refused the API credentials" : "",
    checked: results.length + returnOnly,
    updated: changes.length,
    unchanged: results.filter((r) => r.ok && !r.statusChanged && !movedIds.has(r.orderId)).length,
    failed: errors.length,
    // Parcels left over when a long backlog hit the per-run cap, so the UI can
    // say "press again" instead of quietly under-reporting.
    remaining: Math.max(0, eligible - results.length),
    includeSettled,
    settledSkipped,
    // How many live return requests Steadfast is holding, and whether that
    // list could be read at all — an account without the endpoint enabled
    // should say so rather than silently look like "no returns".
    returnRequests: returnPass.ok ? returnPass.seen || 0 : null,
    returnRequestError: returnPass.ok ? "" : returnPass.error,
    changes,
    errors,
    results,
  };
}
