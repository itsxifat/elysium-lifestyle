import { connectDB } from "@/lib/mongoose";
import FraudAccount from "@/models/FraudAccount";
import Order from "@/models/Order";
import Settings from "@/models/Settings";
import { maybeAutoSendToCourier } from "@/lib/steadfast";

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

// Test EACH account's login individually. The package's public `checkPhone`
// stops at the first working credential, so it can't tell us the health of the
// others. We reach its internal `getAllCredentials` + `Session` by absolute file
// path (its `exports` map only exposes the main entry) and attempt a fresh login
// per account — a successful login is the true per-account health signal.
// Returns [{ email, ok, message }] or throws so the caller can fall back.
async function testEachCredentialLogin() {
  const { createRequire } = await import("module");
  const path = await import("path");
  const { pathToFileURL } = await import("url");

  // Resolve from the project root (robust across Next's compiled output, where
  // import.meta.url can be unreliable). node_modules lives under cwd.
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const main = require.resolve("steadfast-fraud"); // → .../src/index.js
  const dir = path.dirname(main);
  // webpackIgnore so Next leaves these as native runtime imports (the package's
  // `exports` map blocks subpath specifiers, but file-URL imports bypass it).
  const { getAllCredentials } = await import(/* webpackIgnore: true */ pathToFileURL(path.join(dir, "credentials.js")).href);
  const { Session } = await import(/* webpackIgnore: true */ pathToFileURL(path.join(dir, "session.js")).href);

  const creds = await getAllCredentials();
  const results = [];
  for (const { email, password } of creds) {
    try {
      const s = new Session(email, password);
      await s.forceRefresh(); // performs a fresh login; throws on bad credentials
      results.push({ email, ok: true, message: "OK" });
    } catch (e) {
      results.push({ email, ok: false, message: e?.message || "Login failed" });
    }
  }
  return results;
}

// Test connectivity; records each account's status independently.
export async function testFraudAccounts(samplePhone = "01700000000") {
  const pkg = await getPkg();
  if (!pkg) return { ok: false, error: "steadfast-fraud package is not installed" };
  await connectDB();

  // Preferred path: per-account login test so one working account never masks a
  // broken one (and vice-versa).
  try {
    const perAccount = await testEachCredentialLogin();
    if (Array.isArray(perAccount) && perAccount.length) {
      for (const r of perAccount) {
        await FraudAccount.updateOne(
          { email: String(r.email).toLowerCase() },
          { lastTestedAt: new Date(), lastTestOk: r.ok, lastTestMessage: r.message }
        );
      }
      const working = perAccount.filter((r) => r.ok).length;
      return { ok: working > 0, perAccount, working, total: perAccount.length };
    }
  } catch (err) {
    // Package internals unreachable (e.g. layout changed) — degrade gracefully.
    console.error("[fraud] per-account test fell back to aggregate:", err.message);
  }

  // Fallback: aggregate check via the public API (best effort).
  try {
    const sample = await pkg.checkPhone(samplePhone);
    await FraudAccount.updateMany({}, { lastTestedAt: new Date(), lastTestOk: true, lastTestMessage: "OK (aggregate)" });
    return { ok: true, sample, aggregate: true };
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
    const movedToProcessing = autoProcess && order?.orderStatus === "pending";
    if (movedToProcessing) update.$set.orderStatus = "processing";

    await Order.findByIdAndUpdate(orderId, update);

    // Auto-create the Steadfast consignment once it enters processing.
    if (movedToProcessing) maybeAutoSendToCourier(orderId).catch(() => {});
  } catch (err) {
    const status = err?.code === "UNAVAILABLE" ? "unavailable" : "error";
    await Order.findByIdAndUpdate(orderId, {
      $set: { "fraudCheck.status": status, "fraudCheck.error": err.message || "Check failed", "fraudCheck.checkedAt": new Date() },
    }).catch(() => {});
  }
}
