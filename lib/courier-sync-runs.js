import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import CourierSyncRun from "@/models/CourierSyncRun";
import { notifyEvent } from "@/lib/notifications";
import { courierStatusLabel } from "@/lib/steadfast-status";
import { syncCourierStatuses } from "@/lib/courier-sync";

// The record-keeping half of the courier sync: starting a run, following it
// while it works, and keeping it afterwards as history.
//
// Two reasons this exists rather than the route simply awaiting the sync:
//
//   1. A shop with a few hundred live consignments is a few hundred throttled
//      HTTP requests — minutes, not seconds. Holding a browser request open
//      that long means a gateway timeout and a staff member with no idea
//      whether anything happened. So the route starts the work and answers
//      immediately; the work reports into the run document, which the popup
//      polls and which a notification announces when it finishes.
//
//   2. A sync is the one action in the panel that changes many orders at once
//      without anybody typing anything, so "what did Tuesday's sync do, and who
//      ran it" has to be answerable later.
//
// Deployment note: the work continues after the response because this runs
// under a long-lived Node process (pm2). On a platform that freezes a function
// the moment it responds, this would need an external worker instead.

/** A run still marked `running` after this long was killed mid-flight. */
const RUN_STALE_MS = 15 * 60 * 1000;

/** A run past this length is assumed to have outlived the popup that started it. */
const LONG_RUN_MS = 60 * 1000;

/** Rebuilt-history clustering: audit entries this far apart are separate runs. */
const RECONSTRUCT_GAP_MS = 5 * 60 * 1000;

/** Summary fields for the history list — the per-order arrays stay behind. */
const SUMMARY_FIELDS =
  "state trigger scope includeSettled by byName startedAt finishedAt progress totals error authFailed returnRequestError reconstructed";

/**
 * The run currently in flight, if any.
 *
 * Two staff pressing the button within a minute of each other should watch one
 * run, not start a second that asks Steadfast everything all over again.
 */
export async function findActiveRun() {
  await connectDB();
  return CourierSyncRun.findOne({
    state: "running",
    startedAt: { $gte: new Date(Date.now() - RUN_STALE_MS) },
  })
    .sort({ startedAt: -1 })
    .lean();
}

export async function startRun({ by = null, byName = "", trigger = "manual", scope, includeSettled = false }) {
  await connectDB();
  return CourierSyncRun.create({
    state: "running",
    trigger,
    scope: scope || (includeSettled ? "Every consignment, settled included" : "All live consignments"),
    includeSettled,
    by,
    byName,
    startedAt: new Date(),
    progress: { done: 0, total: 0 },
  });
}

const changeDoc = (c, via = "status") => ({
  order: c.orderId,
  orderNumber: c.orderNumber,
  from: c.from || "",
  to: c.to || "",
  courierStatus: c.courierStatus || "",
  courierStatusLabel: c.courierStatusLabel || courierStatusLabel(c.courierStatus),
  autoPaid: !!c.autoPaid,
  needsReturnEntry: !!c.needsReturnEntry,
  reason: c.returnRequest?.reason || "",
  via: c.returnRequest ? "return_request" : via,
});

/**
 * Do the work of a run that has already been created, writing progress into it
 * as it goes and closing it out at the end.
 *
 * Never throws — it is called without being awaited, so an exception here has
 * nowhere to go but an unhandled rejection. Anything fatal is recorded on the
 * run and the run is marked failed, which is what the UI reads.
 */
export async function executeRun(runId, { orderIds, includeSettled = false, actorName } = {}) {
  try {
    const report = await syncCourierStatuses({
      orderIds,
      includeSettled,
      actorName,
      onStart: async ({ total, settledSkipped }) => {
        await CourierSyncRun.updateOne(
          { _id: runId },
          { $set: { "progress.total": total, "totals.settledSkipped": settledSkipped || 0 } }
        );
      },
      onProgress: async ({ done, batch, returns }) => {
        const changes = [
          ...(batch || []).filter((r) => r.ok && r.statusChanged).map((r) => changeDoc(r)),
          ...(returns || []).map((r) => changeDoc(r, "return_request")),
        ];
        const failures = (batch || [])
          .filter((r) => !r.ok)
          .map((r) => ({ order: r.orderId, orderNumber: r.orderNumber, error: r.error }));

        const update = { $set: { "progress.done": done } };
        if (changes.length) update.$push = { changes: { $each: changes } };
        if (failures.length) update.$push = { ...(update.$push || {}), failures: { $each: failures } };
        await CourierSyncRun.updateOne({ _id: runId }, update);
      },
    });

    if (!report.ok) {
      await finish(runId, { state: "failed", error: report.error });
      return report;
    }

    await finish(runId, {
      state: report.authFailed ? "failed" : "done",
      error: report.authFailed ? report.authError : "",
      authFailed: report.authFailed,
      returnRequestError: report.returnRequestError || "",
      totals: {
        checked: report.checked,
        updated: report.updated,
        unchanged: report.unchanged,
        failed: report.failed,
        remaining: report.remaining,
        settledSkipped: report.settledSkipped,
        returnRequests: report.returnRequests || 0,
        clearedErrors: report.clearedErrors || 0,
      },
    });
    return report;
  } catch (err) {
    console.error("[courier-sync] run failed:", err);
    await finish(runId, { state: "failed", error: err?.message || "Sync failed" });
    return { ok: false, error: err?.message || "Sync failed" };
  }
}

async function finish(runId, { state, error = "", authFailed = false, returnRequestError = "", totals }) {
  const set = { state, finishedAt: new Date(), error, authFailed, returnRequestError };
  if (totals) for (const [k, v] of Object.entries(totals)) set[`totals.${k}`] = v;
  const run = await CourierSyncRun.findOneAndUpdate({ _id: runId }, { $set: set }, { new: true }).lean();
  if (run) await announce(run);
  return run;
}

/**
 * Tell staff a finished run is worth looking at.
 *
 * Only when there is something to say: a run that moved nothing is the normal
 * case and notifying on it would train everyone to ignore the bell. A per-order
 * sync never notifies — the person who pressed it is looking at the answer.
 */
async function announce(run) {
  if (run.trigger !== "manual") return;

  const changed = run.totals?.updated || 0;
  const failed = run.totals?.failed || 0;
  const tookMs = run.finishedAt && run.startedAt ? new Date(run.finishedAt) - new Date(run.startedAt) : 0;

  // Worth the bell if it changed something, if anything failed, or if it ran
  // long enough that whoever started it has certainly closed the popup and
  // moved on — which is the case the notification exists for. A quick run that
  // moved nothing is the ordinary case and notifying on it would train
  // everybody to ignore the bell.
  if (!run.authFailed && !run.error && changed === 0 && failed === 0 && tookMs < LONG_RUN_MS) return;

  const title = run.authFailed
    ? "Courier sync failed — Steadfast refused the API keys"
    : run.error
      ? "Courier sync failed"
      : `Courier sync: ${changed} order${changed === 1 ? "" : "s"} updated`;

  const bits = [];
  if (run.byName) bits.push(`Started by ${run.byName}.`);
  if (!run.error) {
    bits.push(`${run.totals?.checked || 0} parcels checked.`);
    if (failed) bits.push(`${failed} could not be checked.`);
    if (run.totals?.remaining) bits.push(`${run.totals.remaining} left for the next run.`);
  } else {
    bits.push(run.error);
  }

  await notifyEvent("courier_sync", {
    severity: run.authFailed || run.error ? "warning" : "info",
    title,
    body: bits.join(" "),
    link: `/admin/orders?sync=${run._id}`,
  }).catch(() => {});
}

export async function listRuns({ limit = 30 } = {}) {
  await connectDB();
  return CourierSyncRun.find({}, SUMMARY_FIELDS).sort({ startedAt: -1 }).limit(Math.min(100, limit)).lean();
}

export async function getRun(id) {
  await connectDB();
  return CourierSyncRun.findById(id).lean();
}

// ── Rebuilding the history that predates this record ────────────────────────
//
// Syncs were run before runs were kept, and the evidence of them is still in
// the database: every status a courier moved left an audit entry on its order
// naming the sync that did it, and every parcel that could not be checked left
// the error and the time on `order.courier`. That is enough to reconstruct
// which runs happened, when, at whose hand and what each one did.
//
// What cannot be recovered is how many parcels a past run checked and found
// nothing new about — nobody wrote that down — so those runs carry
// `reconstructed: true` and the UI says so rather than showing a confident
// "unchanged: 0".

const STATUS_RE = /status (\w+) → (\w+)/;
const REPORTED_RE = /Steadfast reported "([^"]+)"/;
const RETURN_REQ_RE = /Steadfast raised a return request/;

function eventsFromOrder(order) {
  const events = [];

  for (const h of order.editHistory || []) {
    const byName = h.byName || "";
    if (!/^Steadfast sync/i.test(byName)) continue; // webhooks are not runs
    const status = STATUS_RE.exec(h.summary || "");
    const reported = REPORTED_RE.exec(h.summary || "");
    events.push({
      at: new Date(h.at),
      byName,
      kind: "change",
      orderId: order._id,
      orderNumber: order.orderNumber,
      from: status?.[1] || "",
      to: status?.[2] || "",
      courierStatus: reported?.[1] || "",
      autoPaid: /payment pending → paid/.test(h.summary || ""),
      via: RETURN_REQ_RE.test(h.summary || "") ? "return_request" : "status",
    });
  }

  // A parcel whose lookup failed leaves no audit entry — only the error and the
  // moment it was recorded. This is what makes a run of nothing but 401s
  // recoverable at all.
  const c = order.courier || {};
  if (c.error && c.lastSyncedAt) {
    events.push({
      at: new Date(c.lastSyncedAt),
      byName: "", // the failure path never recorded who was running it
      kind: "error",
      orderId: order._id,
      orderNumber: order.orderNumber,
      error: c.error,
    });
  }

  return events;
}

/**
 * Group past sync evidence into runs and insert any that are missing.
 *
 * Idempotent: each cluster gets a `sourceKey` derived from its first event, and
 * the unique index on that key means running this a second time inserts
 * nothing. Safe to offer as a button.
 */
export async function reconstructRuns() {
  await connectDB();

  const orders = await Order.find(
    {
      $or: [
        { "editHistory.byName": /^Steadfast sync/i },
        { "courier.error": { $nin: ["", null] }, "courier.lastSyncedAt": { $ne: null } },
      ],
    },
    "orderNumber editHistory courier.error courier.lastSyncedAt"
  ).lean();

  const events = orders.flatMap(eventsFromOrder).filter((e) => e.at && !Number.isNaN(+e.at));
  events.sort((a, b) => a.at - b.at);

  // One cluster = one run: consecutive events close together in time. The
  // actor is taken from whichever events recorded one, so a cluster of 401s
  // that names nobody still gets the name of the change in the same run.
  const clusters = [];
  for (const e of events) {
    const last = clusters[clusters.length - 1];
    if (last && e.at - last.endedAt <= RECONSTRUCT_GAP_MS) {
      last.events.push(e);
      last.endedAt = e.at;
      if (!last.byName && e.byName) last.byName = e.byName;
    } else {
      clusters.push({ startedAt: e.at, endedAt: e.at, byName: e.byName, events: [e] });
    }
  }

  let inserted = 0;
  let skipped = 0;

  for (const cluster of clusters) {
    const changes = cluster.events.filter((e) => e.kind === "change");
    const errors = cluster.events.filter((e) => e.kind === "error");
    const sourceKey = `audit:${cluster.startedAt.toISOString()}:${cluster.byName || "unknown"}`;

    // Checked as well as indexed. The unique index is the real guarantee, but
    // indexes are built when a model is first compiled — on a deployment where
    // that has not happened yet, this is what keeps the rebuild idempotent.
    if (await CourierSyncRun.exists({ sourceKey })) {
      skipped++;
      continue;
    }

    try {
      await CourierSyncRun.create({
        state: "done",
        trigger: "reconstructed",
        scope: "Rebuilt from the order audit trail",
        by: null,
        // The name the sync recorded on the orders it changed. Blank means the
        // only trace left was failures, which never recorded one.
        byName: cluster.byName || "",
        startedAt: cluster.startedAt,
        finishedAt: cluster.endedAt,
        progress: { done: cluster.events.length, total: cluster.events.length },
        totals: {
          checked: cluster.events.length,
          updated: changes.length,
          unchanged: 0, // not recoverable: nothing recorded a parcel that did not move
          failed: errors.length,
          remaining: 0,
          settledSkipped: 0,
          returnRequests: changes.filter((c) => c.via === "return_request").length,
        },
        changes: changes.map((c) => ({
          order: c.orderId,
          orderNumber: c.orderNumber,
          from: c.from,
          to: c.to,
          courierStatus: c.courierStatus,
          courierStatusLabel: courierStatusLabel(c.courierStatus),
          autoPaid: c.autoPaid,
          needsReturnEntry: c.to === "return_requested",
          via: c.via,
        })),
        failures: errors.map((e) => ({ order: e.orderId, orderNumber: e.orderNumber, error: e.error })),
        authFailed: errors.length > 0 && errors.every((e) => /\(401\)|\(403\)|refused/i.test(e.error || "")),
        reconstructed: true,
        sourceKey,
      });
      inserted++;
    } catch (err) {
      // Duplicate key = this cluster is already in the history, which is the
      // whole point of the key.
      if (err?.code === 11000) skipped++;
      else throw err;
    }
  }

  return { clusters: clusters.length, inserted, skipped, events: events.length };
}
