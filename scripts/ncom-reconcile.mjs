// Nightly stock reconcile: push absolute counts from here to ncom.bd.
//
// Day to day the two systems exchange signed deltas, which compose safely under
// concurrency. But deltas drift over months — a dropped webhook, a failed push,
// a manual edit on one side. This is the correction: once a day, when nothing
// is selling, the system that does the physical counting states the truth.
//
// Run it from cron on the VPS, e.g. 03:30 Dhaka time:
//   30 3 * * *  cd /path/to/elysium && node scripts/ncom-reconcile.mjs --live >> /var/log/ncom-reconcile.log 2>&1
//
// DRY RUN BY DEFAULT — pass --live to write.
//
import mongoose from "mongoose";
import { ncomFetch, ncomList } from "../lib/ncom.js";

try {
  const dotenv = await import("dotenv");
  (dotenv.default ?? dotenv).config({ path: process.env.ENV_FILE || ".env.local" });
} catch { /* dotenv not installed — using process.env directly */ }

const { MONGODB_URI, NCOM_API_KEY } = process.env;
const LIVE = process.argv.includes("--live");

if (!MONGODB_URI || !NCOM_API_KEY) {
  console.error("MONGODB_URI and NCOM_API_KEY must both be set.");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const productsCol = mongoose.connection.collection("products");

const products = await productsCol.find({}).project({ name: 1, variants: 1 }).toArray();

// Ours, keyed by SKU.
const ours = new Map();
for (const p of products) {
  for (const v of p.variants || []) {
    if (v.sku) ours.set(v.sku, { stock: Math.max(0, Number(v.stock) || 0), product: p.name, size: v.size });
  }
}

// Theirs, to report the drift we're correcting rather than writing blind.
const remote = await ncomList("/inventory");
const theirs = new Map(remote.filter((r) => r.sku).map((r) => [r.sku, Number(r.available)]));

const updates = [];
const drift = [];
const unknown = [];

for (const [sku, local] of ours) {
  if (!theirs.has(sku)) {
    unknown.push(sku);
    continue;
  }
  const their = theirs.get(sku);
  if (their !== local.stock) drift.push({ sku, product: local.product, size: local.size, theirs: their, ours: local.stock });
  updates.push({ sku, available: local.stock });
}

console.log(`\n=== ncom reconcile (${LIVE ? "LIVE" : "DRY RUN"}) — ${new Date().toISOString()} ===`);
console.log(`${ours.size} local SKU(s), ${theirs.size} remote, ${drift.length} drifted, ${unknown.length} not present remotely.`);

if (drift.length) {
  console.log(`\nDrift being corrected:`);
  for (const d of drift) console.log(`  ${d.sku}  ${d.product} (${d.size})  theirs ${d.theirs} → ours ${d.ours}`);
}
if (unknown.length) {
  console.log(`\nLocal SKUs with no remote variant (run ncom-migrate.mjs): ${unknown.slice(0, 20).join(", ")}${unknown.length > 20 ? ` … +${unknown.length - 20}` : ""}`);
}

// SKUs they have and we don't — usually a product deleted here but not there.
const orphans = [...theirs.keys()].filter((sku) => !ours.has(sku));
if (orphans.length) {
  console.log(`\nRemote SKUs with no local variant (not touched): ${orphans.slice(0, 20).join(", ")}${orphans.length > 20 ? ` … +${orphans.length - 20}` : ""}`);
}

if (!LIVE) {
  console.log(`\nDRY RUN — nothing written. Re-run with --live to apply.\n`);
} else if (updates.length) {
  for (let i = 0; i < updates.length; i += 250) {
    const batch = updates.slice(i, i + 250);
    try {
      await ncomFetch("/inventory", { method: "POST", body: { updates: batch } });
      console.log(`  pushed ${i + batch.length}/${updates.length}`);
    } catch (e) {
      console.error(`  batch at ${i} FAILED: [${e.code}] ${e.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\nReconciled ${updates.length} SKU(s).\n`);
}

await mongoose.disconnect();
