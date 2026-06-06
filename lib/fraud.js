import { connectDB } from "@/lib/mongoose";
import FraudAccount from "@/models/FraudAccount";
import Order from "@/models/Order";
import Settings from "@/models/Settings";

// Steadfast (Packzy) courier fraud-history integration via the `steadfast-fraud`
// package. The package is loaded lazily and guarded, so the app keeps working
// (fraud checks just report "unavailable") if it isn't installed on the host.
//
// Credentials live in the package's own encrypted store (OS config dir). We keep
// only metadata (emails + test status) in Mongo for the admin UI — never
// passwords.

let pkgPromise = null;
async function getPkg() {
  if (!pkgPromise) {
    pkgPromise = import("steadfast-fraud").catch((e) => {
      console.error("[fraud] steadfast-fraud not available:", e.message);
      return null;
    });
  }
  return pkgPromise;
}

export async function fraudAvailable() {
  return Boolean(await getPkg());
}

/* ---------------- Account management ---------------- */

export async function addFraudAccount({ email, password, label = "" }) {
  const pkg = await getPkg();
  if (!pkg) throw new Error("steadfast-fraud package is not installed on the server");
  email = String(email).toLowerCase().trim();
  await pkg.addCredential({ email, password }); // encrypts + persists in package store
  await connectDB();
  await FraudAccount.findOneAndUpdate(
    { email },
    { email, label, lastTestedAt: null, lastTestOk: null, lastTestMessage: "" },
    { upsert: true, new: true }
  );
  return { email };
}

export async function listFraudAccounts() {
  const pkg = await getPkg();
  let emails = [];
  if (pkg) {
    try {
      emails = await pkg.listCredentials();
    } catch {
      emails = [];
    }
  }
  await connectDB();
  const meta = await FraudAccount.find().lean();
  const byEmail = Object.fromEntries(meta.map((m) => [m.email, m]));
  // Union of package store + our metadata; mark the first as the primary.
  const all = emails.length ? emails : meta.map((m) => m.email);
  return all.map((email, i) => ({
    email,
    primary: i === 0,
    label: byEmail[email]?.label || "",
    lastTestedAt: byEmail[email]?.lastTestedAt || null,
    lastTestOk: byEmail[email]?.lastTestOk ?? null,
    lastTestMessage: byEmail[email]?.lastTestMessage || "",
    inStore: emails.includes(email),
  }));
}

export async function removeFraudAccount(email) {
  email = String(email).toLowerCase().trim();
  const pkg = await getPkg();
  if (pkg) {
    try {
      await pkg.removeCredential(email);
    } catch {
      /* not in store — still remove our metadata */
    }
  }
  await connectDB();
  await FraudAccount.deleteOne({ email });
}

// Test connectivity by running a sample lookup; records per-account status.
export async function testFraudAccounts(samplePhone = "01700000000") {
  const pkg = await getPkg();
  if (!pkg) return { ok: false, error: "steadfast-fraud package is not installed" };
  await connectDB();
  try {
    const sample = await pkg.checkPhone(samplePhone);
    await FraudAccount.updateMany({}, { lastTestedAt: new Date(), lastTestOk: true, lastTestMessage: "OK" });
    return { ok: true, sample };
  } catch (err) {
    if (err?.name === "AllCredentialsFailedError" && Array.isArray(err.failures)) {
      for (const f of err.failures) {
        await FraudAccount.updateOne(
          { email: String(f.email).toLowerCase() },
          { lastTestedAt: new Date(), lastTestOk: false, lastTestMessage: f.error || "Failed" }
        );
      }
    }
    return { ok: false, error: err.message, failures: err.failures };
  }
}

/* ---------------- Per-order check + auto-processing ---------------- */

export async function checkPhone(phone) {
  const pkg = await getPkg();
  if (!pkg) {
    const e = new Error("steadfast-fraud not installed");
    e.code = "UNAVAILABLE";
    throw e;
  }
  return pkg.checkPhone(phone);
}

/**
 * Fetch the courier history for an order's phone, store it on the order, and —
 * if the configured thresholds are met — auto-move a still-pending order to
 * "processing". Designed to be called fire-and-forget; never throws.
 */
export async function runFraudCheckForOrder(orderId, phone) {
  try {
    await connectDB();
    const settings = await Settings.findOne({}).lean();
    const cfg = settings?.fraud || {};

    if (cfg.autoCheck === false) {
      await Order.findByIdAndUpdate(orderId, {
        $set: { "fraudCheck.status": "skipped", "fraudCheck.checkedAt": new Date() },
      });
      return;
    }
    if (!phone) {
      await Order.findByIdAndUpdate(orderId, {
        $set: { "fraudCheck.status": "error", "fraudCheck.error": "No phone number", "fraudCheck.checkedAt": new Date() },
      });
      return;
    }

    await Order.findByIdAndUpdate(orderId, { $set: { "fraudCheck.status": "checking" } });

    const r = await checkPhone(phone);
    const delivered = Number(r.delivered || 0);
    const cancelled = Number(r.cancelled || 0);
    const frauds = Number(r.frauds || 0);
    const totalParcels = Array.isArray(r.consignment) && r.consignment.length
      ? r.consignment.length
      : delivered + cancelled;
    const successRate = totalParcels ? Math.round((delivered / totalParcels) * 100) : 0;

    const minDelivery = cfg.minDelivery ?? 10;
    const minSuccessful = cfg.minSuccessfulDelivery ?? 10;
    const meetsThreshold = totalParcels >= minDelivery && delivered >= minSuccessful;
    const autoProcess = cfg.autoProcess !== false && meetsThreshold;

    const fraudCheck = {
      status: "done",
      delivered,
      cancelled,
      frauds,
      totalParcels,
      successRate,
      autoProcessed: autoProcess,
      checkedAt: new Date(),
      error: "",
    };

    const update = { $set: { fraudCheck } };
    // Only auto-advance an order that's still pending — never override an admin.
    const order = await Order.findById(orderId).select("orderStatus").lean();
    if (autoProcess && order?.orderStatus === "pending") update.$set.orderStatus = "processing";

    await Order.findByIdAndUpdate(orderId, update);
  } catch (err) {
    const status = err?.code === "UNAVAILABLE" ? "unavailable" : "error";
    await Order.findByIdAndUpdate(orderId, {
      $set: { "fraudCheck.status": status, "fraudCheck.error": err.message || "Check failed", "fraudCheck.checkedAt": new Date() },
    }).catch(() => {});
  }
}
