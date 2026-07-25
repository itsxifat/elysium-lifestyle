// One-time backfill: attach orphaned orders to a customer record.
//
// Until now only landing-page orders ran through findOrCreateCustomer(); orders
// placed as a guest on the storefront and manual/POS orders were saved with
// `user: null`, so those buyers never appeared in the customer list. The routes
// are fixed going forward — this repairs the history.
//
// For every order with no `user`, it matches the shipping phone/email against
// existing users (email first, then phone, preferring a real account over a
// guest stub) and, on a miss, creates the same guest stub the app would have.
// Orders sharing a phone collapse onto one customer, so a repeat buyer ends up
// with a single record holding every order.
//
//   node scripts/backfill-order-customers.mjs --dry-run
//   node scripts/backfill-order-customers.mjs
//
// Safe to re-run: orders that already have a user are skipped.
//
// NOTE: run scripts/migrate-guest-users.mjs FIRST if you have not already —
// this script creates email-less guests, which collide under the legacy
// non-sparse unique index on users.email.
import mongoose from "mongoose";
import { normalizeBdPhone } from "../lib/utils.js";

try {
  const dotenv = await import("dotenv");
  (dotenv.default ?? dotenv).config({ path: process.env.ENV_FILE || ".env.local" });
} catch { /* dotenv not installed — using process.env directly */ }

const { MONGODB_URI } = process.env;
const DRY_RUN = process.argv.includes("--dry-run");

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}

const lower = (v) => String(v || "").toLowerCase().trim();

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;
const orders = db.collection("orders");
const users = db.collection("users");

// Guard: creating email-less guests needs the sparse index (see note above).
const emailIdx = (await users.indexes()).find((i) => i.key?.email === 1);
if (emailIdx && emailIdx.unique && !emailIdx.sparse) {
  console.error(
    `\nusers.email is a NON-sparse unique index (${emailIdx.name}).\n` +
    `Run: node scripts/migrate-guest-users.mjs   — then re-run this script.\n`
  );
  await mongoose.disconnect();
  process.exit(1);
}

const orphans = await orders
  .find({ $or: [{ user: null }, { user: { $exists: false } }] })
  .project({ orderNumber: 1, shippingAddress: 1, guestEmail: 1, source: 1, createdAt: 1 })
  .sort({ createdAt: 1 })
  .toArray();

console.log(`\nOrders with no customer: ${orphans.length}${DRY_RUN ? "  (dry run)" : ""}\n`);

const stats = { linked: 0, created: 0, skipped: 0, failed: 0 };
// Phone/email → user _id for customers created during THIS run, so several
// orders from the same buyer collapse onto one new record.
const seen = new Map();

async function resolveCustomer({ name, phone, email, source }) {
  const e = lower(email);
  const p = normalizeBdPhone(phone || "");

  const cacheKey = e || p;
  if (cacheKey && seen.has(cacheKey)) return { id: seen.get(cacheKey), created: false };

  if (e) {
    const byEmail = await users.findOne({ email: e }, { projection: { _id: 1 } });
    if (byEmail) {
      if (cacheKey) seen.set(cacheKey, byEmail._id);
      if (p) seen.set(p, byEmail._id);
      return { id: byEmail._id, created: false };
    }
  }
  if (p) {
    // Prefer a real account over a guest stub when both carry the same phone.
    const byPhone = await users
      .find({ phone: p }, { projection: { _id: 1 } })
      .sort({ isGuest: 1, createdAt: 1 })
      .limit(1)
      .toArray();
    if (byPhone[0]) {
      seen.set(p, byPhone[0]._id);
      if (e) seen.set(e, byPhone[0]._id);
      return { id: byPhone[0]._id, created: false };
    }
  }

  if (!p && !e) return null; // nothing to identify them by

  const now = new Date();
  const doc = {
    name: String(name || "Guest").trim() || "Guest",
    role: "customer",
    isGuest: true,
    guestSource: source || "",
    emailVerified: false,
    permissions: [],
    createdAt: now,
    updatedAt: now,
  };
  if (p) doc.phone = p;
  if (e) doc.email = e;

  if (DRY_RUN) {
    const fakeId = new mongoose.Types.ObjectId();
    if (cacheKey) seen.set(cacheKey, fakeId);
    if (p) seen.set(p, fakeId);
    return { id: fakeId, created: true };
  }

  const res = await users.insertOne(doc);
  if (cacheKey) seen.set(cacheKey, res.insertedId);
  if (p) seen.set(p, res.insertedId);
  return { id: res.insertedId, created: true };
}

for (const order of orphans) {
  const addr = order.shippingAddress || {};
  try {
    const resolved = await resolveCustomer({
      name: addr.name,
      phone: addr.phone,
      email: order.guestEmail || addr.email,
      source: order.source || "website",
    });

    if (!resolved) {
      stats.skipped++;
      console.log(`  – ${order.orderNumber || order._id}  no phone or email — skipped`);
      continue;
    }

    if (!DRY_RUN) {
      await orders.updateOne({ _id: order._id }, { $set: { user: resolved.id } });
    }
    if (resolved.created) stats.created++;
    stats.linked++;
  } catch (err) {
    stats.failed++;
    console.error(`  ! ${order.orderNumber || order._id}  ${err.message}`);
  }
}

console.log(
  `\nDone${DRY_RUN ? " (dry run — nothing written)" : ""}:\n` +
  `  linked orders   : ${stats.linked}\n` +
  `  customers created: ${stats.created}\n` +
  `  skipped (no contact): ${stats.skipped}\n` +
  `  failed          : ${stats.failed}\n`
);

await mongoose.disconnect();
